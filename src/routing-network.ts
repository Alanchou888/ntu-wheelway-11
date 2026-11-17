import { fetchSnapshot } from './data-client'
import type { Coordinate } from './types'

export const networkUrl = '/data/routing-network.json'
export type RoutingBounds = [west: number, south: number, east: number, north: number]

export interface RoadWay {
  osmId: number
  nodes: number[]
  direction: 1 | 2 | 3
  highway: string
  name: string | null
  surface: string | null
  smoothness: string | null
  wheelchair: string | null
  inclinePercent: number | null
  widthM: number | null
  crossing: boolean
  ramp: boolean
  separateLevel: boolean
}

export interface RoutingNetwork {
  version: 1
  bounds: RoutingBounds
  sourceUrl: string
  retrievedAt: string
  dataAsOf: string | null
  license: 'ODbL-1.0'
  nodes: Coordinate[]
  ways: RoadWay[]
}

export function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90
}

export function inRoutingBounds([lon, lat]: Coordinate, [west, south, east, north]: RoutingBounds) {
  return lon >= west && lon <= east && lat >= south && lat <= north
}

export function parseRoutingNetwork(value: unknown): RoutingNetwork {
  const invalid = () => new Error('路網快照格式不完整，請更新或稍後重試。')
  if (!value || typeof value !== 'object') throw invalid()
  const net = value as RoutingNetwork
  if (net.version !== 1 || net.license !== 'ODbL-1.0' || !Array.isArray(net.bounds) || net.bounds.length !== 4 ||
      !isCoordinate(net.bounds.slice(0, 2)) || !isCoordinate(net.bounds.slice(2)) ||
      net.bounds[0] >= net.bounds[2] || net.bounds[1] >= net.bounds[3] ||
      typeof net.sourceUrl !== 'string' || !net.sourceUrl.startsWith('https://') ||
      !Number.isFinite(Date.parse(net.retrievedAt)) || (net.dataAsOf !== null && !Number.isFinite(Date.parse(net.dataAsOf))) ||
      !Array.isArray(net.nodes) || !net.nodes.length || net.nodes.length > 65_000 ||
      !Array.isArray(net.ways) || !net.ways.length || net.ways.length > 25_000) throw invalid()
  if (!net.nodes.every(point => isCoordinate(point) && inRoutingBounds(point, net.bounds))) throw invalid()
  let references = 0
  const nullableText = (s: unknown) => s === null || typeof s === 'string' && s.length <= 140
  for (const way of net.ways) {
    if (!way || !Number.isSafeInteger(way.osmId) || way.osmId < 1 ||
        ![1, 2, 3].includes(way.direction) || !Array.isArray(way.nodes) || way.nodes.length < 2 ||
        !way.nodes.every(n => Number.isSafeInteger(n) && n >= 0 && n < net.nodes.length) ||
        typeof way.highway !== 'string' || !way.highway || way.highway === 'steps' ||
        way.wheelchair === 'no' || way.smoothness === 'impassable' ||
        ![way.name, way.surface, way.smoothness, way.wheelchair].every(nullableText) ||
        ![way.crossing, way.ramp, way.separateLevel].every(v => typeof v === 'boolean') ||
        (way.widthM !== null && (!Number.isFinite(way.widthM) || way.widthM <= 0 || way.widthM > 50)) ||
        (way.inclinePercent !== null && (!Number.isFinite(way.inclinePercent) || Math.abs(way.inclinePercent) > 100))) throw invalid()
    references += way.nodes.length
    if (references > 150_000) throw invalid()
  }
  return net
}

export const loadRoutingNetwork = (signal?: AbortSignal) => fetchSnapshot(networkUrl, parseRoutingNetwork, signal)
