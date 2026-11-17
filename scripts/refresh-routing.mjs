import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { inBbox } from './data-normalization.mjs'

export const BOUNDS = [121.5338, 25.0116, 121.5446, 25.022]
const box = [BOUNDS[1], BOUNDS[0], BOUNDS[3], BOUNDS[2]].join(',')
// Re-read node tags as well: barriers and kerbs are often mapped as points.
const routingQuery = `[out:json][timeout:22];way[highway](${box});out body;>;out body qt;`
const target = fileURLToPath(new URL('../public/data/routing-network.json', import.meta.url))
const overpass = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const walkways = new Set(['footway', 'path', 'pedestrian', 'living_street', 'residential', 'unclassified', 'service', 'track'])
const restricted = new Set(['no', 'private', 'customers', 'permit', 'destination', 'delivery', 'use_sidepath'])
const fixedBarriers = new Set(['stile', 'turnstile', 'kissing_gate', 'cycle_barrier', 'block', 'bus_trap', 'jersey_barrier', 'lift_gate', 'swing_gate', 'chain'])
const gates = new Set(['gate', 'lift_gate', 'swing_gate', 'chain'])
const conditional = ['access:conditional', 'foot:conditional', 'wheelchair:conditional', 'oneway:foot:conditional', 'oneway:wheelchair:conditional']

const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 140) : null
const openFoot = value => ['yes', 'designated', 'permissive', 'official'].includes(value)
const deniesFoot = tags => restricted.has(tags.foot ?? tags.access) || restricted.has(tags.wheelchair) || conditional.some(key => tags[key])
const blocksNode = tags => deniesFoot(tags) || tags.locked === 'yes' ||
  (fixedBarriers.has(tags.barrier) && tags.wheelchair !== 'yes' && tags.wheelchair !== 'designated') ||
  (gates.has(tags.barrier) && !openFoot(tags.foot ?? tags.access) && tags.wheelchair !== 'yes' && tags.wheelchair !== 'designated')

function widthMetres(value) {
  const match = text(value)?.match(/^(\d+(?:\.\d+)?)\s*(m|cm)?$/)
  if (!match) return null
  const metres = Number(match[1]) / (match[2] === 'cm' ? 100 : 1)
  return metres > 0 && metres <= 50 ? metres : null
}
function gradePercent(value) {
  const match = text(value)?.match(/^([-+]?\d+(?:\.\d+)?)\s*(%|°)?$/)
  if (!match) return null
  const number = Number(match[1])
  const percent = match[2] === '°' ? Math.tan(number * Math.PI / 180) * 100 : number
  return Math.abs(percent) <= 100 && (match[2] !== '°' || Math.abs(number) < 90) ? Math.round(percent * 100) / 100 : null
}
function directionMask(tags) {
  const oneWay = tags['oneway:wheelchair'] ?? tags['oneway:foot']
  const forward = oneWay !== '-1' && !restricted.has(tags['foot:forward'] ?? tags['access:forward']) && !restricted.has(tags['wheelchair:forward'])
  const reverse = !['yes', '1', 'true'].includes(oneWay) && !restricted.has(tags['foot:backward'] ?? tags['access:backward']) && !restricted.has(tags['wheelchair:backward'])
  return Number(forward) + 2 * Number(reverse)
}
function acceptsWay(tags) {
  const highway = tags.highway
  if (deniesFoot(tags) || tags.indoor && tags.indoor !== 'no' || tags.tunnel === 'building_passage' ||
      tags.level && tags.level !== '0' || tags.area === 'yes' || tags.ford && tags.ford !== 'no' ||
      tags.construction && tags.construction !== 'no' || tags.disused === 'yes' || tags.abandoned === 'yes' || tags.smoothness === 'impassable' ||
      tags.sac_scale && tags.sac_scale !== 'hiking' || blocksNode(tags)) return false
  if (walkways.has(highway)) return !['parking_aisle', 'driveway', 'emergency_access'].includes(tags.service) || openFoot(tags.foot)
  // An explicit foot permission is needed on cycleways and larger carriageways.
  return ['cycleway', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link'].includes(highway) &&
    openFoot(tags.foot) && tags.sidewalk !== 'separate'
}

export function normalizeRoutingNetwork(payload, { sourceUrl, now = new Date() }) {
  if (!Array.isArray(payload?.elements) || payload.remark) throw new Error('不完整的 OSM 路網回應')
  const byId = new Map(payload.elements.filter(row => row.type === 'node' &&
    Number.isSafeInteger(row.id) && inBbox([row.lon, row.lat], BOUNDS)).map(row => [row.id, row]))
  const nodes = [], ways = [], indices = new Map()
  const indexOf = id => {
    if (!indices.has(id)) {
      const node = byId.get(id)
      indices.set(id, nodes.push([node.lon, node.lat]) - 1)
    }
    return indices.get(id)
  }
  const exclusions = { steps: 0, other: 0, blockedNodes: [...byId.values()].filter(row => blocksNode(row.tags ?? {})).length }
  for (const row of payload.elements) {
    const tags = row.tags ?? {}
    if (row.type !== 'way' || !tags.highway || !Number.isSafeInteger(row.id) || row.id < 1 || !Array.isArray(row.nodes)) continue
    if (tags.highway === 'steps') { exclusions.steps++; continue }
    const direction = directionMask(tags)
    if (!direction || !acceptsWay(tags)) { exclusions.other++; continue }
    const common = {
      osmId: row.id, direction, highway: tags.highway, name: text(tags['name:zh']) ?? text(tags.name),
      surface: text(tags.surface), smoothness: text(tags.smoothness), wheelchair: text(tags.wheelchair),
      inclinePercent: gradePercent(tags.incline), widthM: widthMetres(tags.width),
      crossing: tags.footway === 'crossing', ramp: tags.ramp === 'yes' || tags.ramp === 'wheelchair',
      separateLevel: Boolean(tags.bridge && tags.bridge !== 'no' || tags.tunnel && tags.tunnel !== 'no' || tags.layer && tags.layer !== '0'),
    }
    let run = []
    const append = () => {
      if (run.length > 1) ways.push({ ...common, nodes: run.map(indexOf) })
      run = []
    }
    for (const id of row.nodes) {
      const node = byId.get(id)
      if (!node || blocksNode(node.tags ?? {})) append()
      else if (run.at(-1) !== id) run.push(id)
    }
    append()
  }
  if (!nodes.length || !ways.length) throw new Error('下載內容沒有可用的校園路網')
  const sourceDate = payload.osm3s?.timestamp_osm_base ?? payload.dataAsOf
  return { version: 1, bounds: BOUNDS, sourceUrl, retrievedAt: now.toISOString(),
    dataAsOf: Number.isFinite(Date.parse(sourceDate)) ? sourceDate : null,
    license: 'ODbL-1.0', nodes, ways, exclusions }
}

async function downloadNetwork() {
  let lastError
  for (const endpoint of overpass) {
    try {
      const response = await fetch(`${endpoint}?${new URLSearchParams({ data: routingQuery })}`,
        { signal: AbortSignal.timeout(27_000), headers: { 'User-Agent': 'NTU-Wheelway/3 (bounded campus routing snapshot)' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const snapshot = normalizeRoutingNetwork(await response.json(), { sourceUrl: endpoint })
      if (snapshot.ways.length < 100) throw new Error('路網數量異常少')
      return snapshot
    } catch (error) { lastError = error }
  }
  throw lastError
}

async function main() {
  const [option, input, ...rest] = process.argv.slice(2)
  if (rest.length || (option && (option !== '--input' || !input))) throw new Error('Usage: node scripts/refresh-routing.mjs [--input campus-osm.json]')
  const payload = input ? JSON.parse((await readFile(input, 'utf8')).replace(/^\uFEFF/, '')) : null
  const snapshot = payload
    ? normalizeRoutingNetwork(payload, { sourceUrl: payload.source ?? 'https://www.openstreetmap.org/copyright' })
    : await downloadNetwork()
  if (snapshot.ways.length < 100) throw new Error('路網數量異常少')
  const temp = `${target}.${process.pid}.tmp`
  try { await writeFile(temp, JSON.stringify(snapshot) + '\n', 'utf8'); await rename(temp, target) }
  finally { await rm(temp, { force: true }).catch(() => {}) }
  const measurements = Object.fromEntries(['inclinePercent', 'widthM', 'surface', 'smoothness', 'wheelchair'].map(key => [
    key, snapshot.ways.filter(way => way[key] !== null).length,
  ]))
  console.log(JSON.stringify({ nodes: snapshot.nodes.length, ways: snapshot.ways.length,
    dataAsOf: snapshot.dataAsOf, source: snapshot.sourceUrl, measurements, exclusions: snapshot.exclusions }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(`保留前一版快照。${error.message}`)
  process.exitCode = 1
})
