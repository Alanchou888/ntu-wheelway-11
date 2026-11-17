import createGraph from 'ngraph.graph'
import { aStar } from 'ngraph.path'
import { categories, reportState } from './community-model'
import type { CommunityReport, CommunitySegment } from './community-model'
import type { FieldObservation } from './field-observations'
import { reportMatchesSegment } from './road-conditions'
import { distance } from './routes'
import type { PlanningPreference } from './planning-params'
import { inRoutingBounds } from './routing-network'
import type { RoadWay, RoutingNetwork } from './routing-network'
import type { Coordinate, Route } from './types'

export const maxSnapM = 40
export const estimateSpeedKmh = 3
const maxSharedRatio = 0.84
const roughSurfaces = new Set(['unpaved', 'gravel', 'fine_gravel', 'cobblestone', 'sett', 'dirt', 'earth', 'ground', 'grass', 'sand', 'mud', 'woodchips', 'grass_paver'])
const roughSmoothness = new Set(['intermediate', 'bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'])

export interface RoutingWeights {
  grade: number; ramp: number; rough: number; narrow: number
  reported: number; limited: number; unknown: number; sharedRoad: number
}
export const routingWeights: Record<PlanningPreference, RoutingWeights> = {
  short: { grade: 0, ramp: 0, rough: 0, narrow: 0, reported: 0, limited: 0, unknown: 0, sharedRoad: 0 },
  gentle: { grade: .19, ramp: .08, rough: .10, narrow: .2, reported: .35, limited: .25, unknown: .06, sharedRoad: .05 },
  comfort: { grade: .045, ramp: .04, rough: .6, narrow: .75, reported: 1.25, limited: .55, unknown: .11, sharedRoad: .18 },
}

export interface RoadAccess { coordinate: Coordinate; offsetM: number }
export interface PlannedLeg {
  id: string
  way: RoadWay
  name: string
  coordinates: Coordinate[]
  distanceM: number
  teamSegmentNames: string[]
  fieldPointIds: string[]
  reports: CommunityReport[]
}
export interface PlannedRoute {
  id: string
  legs: PlannedLeg[]
  coordinates: Coordinate[]
  distanceM: number
  estimateMinutes: number
  markedSlopeMax: number | null
  markedWidthMin: number | null
  roughM: number
  missingM: number
  teamM: number
  fieldPointIds: string[]
  reports: CommunityReport[]
}
export interface PlanningContext {
  walkedRoutes?: Route[]
  fieldPoints?: FieldObservation[]
  reports?: CommunityReport[]
  reportSegments?: CommunitySegment[]
  now?: number
}
type RouteFailure = 'outside-a' | 'outside-b' | 'unsnapped-a' | 'unsnapped-b' | 'same-access' | 'disconnected'
export type PlanningResult =
  | { status: 'ok'; access: [RoadAccess, RoadAccess]; routes: PlannedRoute[] }
  | { status: RouteFailure }

interface Edge {
  id: number; key: string; from: number; to: number; way: RoadWay
  line: [Coordinate, Coordinate]; distanceM: number; reports: CommunityReport[]
}
interface Snap extends RoadAccess { edge: Edge; t: number }
interface Arc { edge: Edge; coordinates: [Coordinate, Coordinate]; distanceM: number }
type Candidate = { arcs: Arc[]; distanceM: number; keys: Map<string, number> }

function project(point: Coordinate, a: Coordinate, b: Coordinate) {
  const scale = Math.cos(point[1] * Math.PI / 180)
  const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * scale * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  const coordinate: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  return { t, coordinate, offsetM: distance(point, coordinate) }
}

function roadEdges(network: RoutingNetwork, context: PlanningContext) {
  const segments = new Map(context.reportSegments?.map(segment => [segment.id, segment]))
  const active = (context.reports ?? []).filter(report => reportState(report, context.now).kind === 'active')
  const edges: Edge[] = []
  for (const way of network.ways) {
    for (let index = 1; index < way.nodes.length; index++) {
      const from = way.nodes[index - 1], to = way.nodes[index]
      const line: [Coordinate, Coordinate] = [network.nodes[from], network.nodes[to]]
      const distanceM = distance(...line)
      if (distanceM < .05) continue
      const id = edges.length
      const reports = way.separateLevel ? [] : active.filter(report => {
        const source = segments.get(report.segmentId)
        if (source?.approximate) return false
        if (report.coordinate) return reportMatchesSegment(report, { id: `osm-${way.osmId}`, coordinates: line })
        return !!source?.coordinates && isSharedLine(...line, source.coordinates)
      })
      if (reports.some(report => report.impact === 'blocked')) continue
      // Share a key for coincident mapped edges, even if they have different node IDs.
      const key = line.map(point => point.map(value => value.toFixed(6)).join(',')).sort().join('|')
      edges.push({ id, key, from, to, way, line, distanceM, reports })
    }
  }
  return edges
}

function nearbyAccesses(point: Coordinate, edges: Edge[], component?: (node: number) => number) {
  const nearest = new Map<number, Snap>()
  for (const edge of edges) {
    // A 2D selection does not identify which level of a bridge or tunnel the user is on.
    if (edge.way.separateLevel) continue
    const projected = project(point, ...edge.line)
    if (projected.offsetM > maxSnapM) continue
    const key = component?.(edge.from) ?? 0
    if (projected.offsetM < (nearest.get(key)?.offsetM ?? Infinity)) nearest.set(key, { edge, ...projected })
  }
  return nearest
}

function connectedAccessPairs(network: RoutingNetwork, edges: Edge[], a: Coordinate, b: Coordinate, from: Snap, to: Snap) {
  const parents = network.nodes.map((_, index) => index)
  const component = (node: number) => {
    while (parents[node] !== node) {
      parents[node] = parents[parents[node]]
      node = parents[node]
    }
    return node
  }
  for (const edge of edges) parents[component(edge.from)] = component(edge.to)
  // Keep a selection on a mapped path. Only off-path selections may seek another outdoor access.
  const options = (point: Coordinate, snap: Snap) => snap.offsetM <= 1
    ? new Map([[component(snap.edge.from), snap]]) : nearbyAccesses(point, edges, component)
  const fromOptions = options(a, from), toOptions = options(b, to)
  return [...fromOptions].flatMap(([key, start]) => {
    const end = toOptions.get(key)
    if (!end || start.edge === from.edge && end.edge === to.edge || distance(start.coordinate, end.coordinate) < .8) return []
    return [[start, end] as const]
  }).sort(([a, b], [c, d]) => a.offsetM + b.offsetM - c.offsetM - d.offsetM)
}

const rough = (way: RoadWay) => roughSurfaces.has(way.surface ?? '') || roughSmoothness.has(way.smoothness ?? '')
const missing = (way: RoadWay) => way.inclinePercent === null || way.widthM === null || way.surface === null
const sharedRoad = (way: RoadWay) => !['footway', 'path', 'pedestrian'].includes(way.highway)

function edgeCost(arc: Arc, weights: RoutingWeights) {
  const { way, reports } = arc.edge
  const uphill = Math.abs(way.inclinePercent ?? 0)
  const narrow = way.widthM !== null ? Math.max(0, 1.2 - way.widthM) : 0
  return arc.distanceM * (1 + weights.grade * uphill + weights.ramp * Number(way.ramp) +
    weights.rough * Number(rough(way)) + weights.narrow * narrow + weights.limited * Number(way.wheelchair === 'limited') +
    weights.unknown * Number(missing(way)) + weights.sharedRoad * Number(sharedRoad(way)) +
    weights.reported * Number(reports.some(report => report.impact === 'difficult')))
}

function makeGraph(network: RoutingNetwork, edges: Edge[], a: Snap, b: Snap) {
  const graph = createGraph<Coordinate, Arc>({ multigraph: true })
  const accesses = [a, b].map((snap, index) => {
    const atFrom = snap.t <= 1e-8, atTo = snap.t >= 1 - 1e-8
    const id = atFrom ? snap.edge.from : atTo ? snap.edge.to : network.nodes.length + index
    graph.addNode(id, snap.coordinate)
    return { id, t: snap.t, edgeId: snap.edge.id }
  })
  const link = (edge: Edge, from: number, to: number, a: Coordinate, b: Coordinate) => {
    const distanceM = distance(a, b)
    if (distanceM >= .00001) graph.addLink(from, to, { edge, coordinates: [a, b], distanceM })
  }
  for (const edge of edges) {
    if (!graph.hasNode(edge.from)) graph.addNode(edge.from, edge.line[0])
    if (!graph.hasNode(edge.to)) graph.addNode(edge.to, edge.line[1])
    const chain = [{ id: edge.from, t: 0 }, ...accesses.filter(snap => snap.edgeId === edge.id &&
      snap.id >= network.nodes.length).sort((a, b) => a.t - b.t), { id: edge.to, t: 1 }]
    for (let i = 1; i < chain.length; i++) {
      const from = chain[i - 1].id, to = chain[i].id
      const a = graph.getNode(from)!.data, b = graph.getNode(to)!.data
      if (edge.way.direction & 1) link(edge, from, to, a, b)
      if (edge.way.direction & 2) link(edge, to, from, b, a)
    }
  }
  return { graph, from: accesses[0].id, to: accesses[1].id }
}

function overlaps(candidate: Candidate, existing: Candidate) {
  const [shorter, longer] = candidate.distanceM < existing.distanceM ? [candidate, existing] : [existing, candidate]
  const limit = shorter.distanceM * maxSharedRatio
  let shared = 0
  const unmatched: Arc[] = []
  for (const arc of shorter.arcs) {
    if (longer.keys.has(arc.edge.key)) shared += Math.min(arc.distanceM, longer.keys.get(arc.edge.key)!)
    else unmatched.push(arc)
    if (shared > limit) return true
  }
  if (shared + unmatched.reduce((sum, arc) => sum + arc.distanceM, 0) <= limit) return false
  for (const arc of unmatched) {
    // Some parallel OSM features share the same path with different node spacing.
    const [a, b] = arc.coordinates, count = Math.ceil(arc.distanceM / 6)
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count
      const point: Coordinate = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
      if (longer.arcs.some(other => project(point, ...other.coordinates).offsetM <= 2)) shared += arc.distanceM / count
      if (shared > limit) return true
    }
  }
  return false
}

function selectCandidates(graphData: ReturnType<typeof makeGraph>, preference: PlanningPreference, weights: RoutingWeights) {
  const { graph, from, to } = graphData
  const search = (weights: RoutingWeights, penalty?: Set<string>, multiplier = 1): Candidate | undefined => {
    const cost = (arc: Arc) => edgeCost(arc, weights) * (penalty?.has(arc.edge.key) ? multiplier : 1)
    const path = aStar(graph, {
      oriented: true, heuristic: (a, b) => distance(a.data, b.data), distance: (_a, _b, link) => cost(link.data),
    }).find(from, to).reverse()
    const arcs: Arc[] = [], keys = new Map<string, number>()
    let distanceM = 0
    for (let i = 1; i < path.length; i++) {
      const next = path[i].id
      let best: Arc | undefined, weight = Infinity
      for (const link of graph.getLinks(path[i - 1].id) ?? []) {
        if (link.fromId !== path[i - 1].id || link.toId !== next) continue
        const value = cost(link.data)
        if (value < weight) { best = link.data; weight = value }
      }
      if (!best) return undefined
      arcs.push(best); distanceM += best.distanceM
      keys.set(best.edge.key, (keys.get(best.edge.key) ?? 0) + best.distanceM)
    }
    return arcs.length ? { arcs, keys, distanceM } : undefined
  }
  const primary = search(weights)
  if (!primary) return []
  const candidates = [primary]
  const include = (candidate?: Candidate) => {
    if (!candidate || candidate.distanceM > primary.distanceM * 1.65 + 40 || candidates.length >= 3) return
    if (!candidates.some(existing => overlaps(candidate, existing))) candidates.push(candidate)
  }
  for (const other of Object.keys(routingWeights) as PlanningPreference[]) {
    if (other !== preference) include(search(routingWeights[other]))
  }
  for (const multiplier of [1.65, 2.5, 4.5]) {
    if (candidates.length >= 3) break
    include(search(weights, new Set(candidates.flatMap(candidate => [...candidate.keys.keys()])), multiplier))
  }
  return candidates
}

const highwayLabels: Record<string, string> = {
  footway: '步道', path: '小徑', pedestrian: '行人通道', living_street: '生活街道',
  service: '服務道路', track: '通道', cycleway: '共用道路',
}
export function roadName(way: RoadWay) {
  return way.name ?? (way.crossing ? '行穿線' : highwayLabels[way.highway] ?? '道路')
}

const surfaceLabels: Record<string, string> = {
  asphalt: '柏油', paved: '鋪面', concrete: '混凝土', 'concrete:plates': '混凝土板',
  paving_stones: '地磚', sett: '石塊鋪面', cobblestone: '卵石鋪面', gravel: '碎石',
  fine_gravel: '細碎石', compacted: '夯實路面', grass_paver: '植草磚', unpaved: '未鋪面',
  ground: '土面', dirt: '土路', grass: '草地', wood: '木板', sand: '沙地', metal: '金屬',
}
const smoothnessLabels: Record<string, string> = {
  excellent: '極平整', good: '平整', intermediate: '一般', bad: '不平整', very_bad: '明顯不平整',
  horrible: '非常不平整', very_horrible: '極不平整', impassable: '圖資標為無法通行',
}
export function surfaceLabel(surface: string | null) { return surface ? surfaceLabels[surface] ?? surface : '未知' }
export function smoothnessLabel(value: string | null) { return value ? smoothnessLabels[value] ?? value : '未知' }
export const reportSummary = (report: CommunityReport) => `${categories[report.category]}${report.impact === 'difficult' ? '（通行困難）' : ''}`

function isSharedLine(a: Coordinate, b: Coordinate, line: Coordinate[]) {
  return line.slice(1).some((end, i) => {
    const start = line[i]
    const p = project(a, start, end), q = project(b, start, end)
    return Math.max(p.offsetM, q.offsetM) <= 4 && Math.abs(p.t - q.t) * distance(start, end) >= distance(a, b) * .65
  })
}

function describeCandidate(candidate: Candidate, context: PlanningContext): PlannedRoute {
  const teamSegments = (context.walkedRoutes ?? []).flatMap(route => route.segments.filter(segment => !segment.approximate))
  const legs: PlannedLeg[] = []
  const reports = new Map<string, CommunityReport>()
  const slopes: number[] = [], widths: number[] = []
  let roughM = 0, missingM = 0, teamM = 0, hash = 2166136261
  for (const arc of candidate.arcs) {
    const [a, b] = arc.coordinates, { way } = arc.edge
    const team = way.separateLevel ? [] : teamSegments.filter(segment => isSharedLine(a, b, segment.coordinates))
    const teamNames = [...new Set(team.map(segment => segment.name))]
    const nearby = way.separateLevel ? [] : (context.fieldPoints ?? []).filter(point =>
      !point.level && project(point.coordinate, a, b).offsetM <= 8).map(point => point.id)
    const arcReports = arc.edge.reports
    const last = legs.at(-1)
    if (last && last.way === way && last.teamSegmentNames.join('|') === teamNames.join('|') &&
        last.reports.map(report => report.id).join('|') === arcReports.map(report => report.id).join('|')) {
      last.coordinates.push(b); last.distanceM += arc.distanceM
      last.fieldPointIds = [...new Set([...last.fieldPointIds, ...nearby])]
    } else {
      legs.push({ id: `leg-${legs.length + 1}`, way, name: roadName(way), coordinates: [a, b],
        distanceM: arc.distanceM, teamSegmentNames: teamNames, fieldPointIds: nearby, reports: arcReports })
    }
    if (way.inclinePercent !== null) slopes.push(Math.abs(way.inclinePercent))
    if (way.widthM !== null) widths.push(way.widthM)
    if (rough(way)) roughM += arc.distanceM
    if (missing(way)) missingM += arc.distanceM
    if (team.length) teamM += arc.distanceM
    for (const report of arcReports) reports.set(report.id, report)
    for (const char of `${way.osmId}:${a.join(',')}:${b.join(',')}|`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  }
  return {
    id: `plan-${(hash >>> 0).toString(36)}`, legs,
    coordinates: [candidate.arcs[0].coordinates[0], ...candidate.arcs.map(arc => arc.coordinates[1])],
    distanceM: candidate.distanceM, estimateMinutes: Math.max(1, Math.round(candidate.distanceM / (estimateSpeedKmh * 1000 / 60))),
    markedSlopeMax: slopes.length ? Math.max(...slopes) : null, markedWidthMin: widths.length ? Math.min(...widths) : null,
    roughM, missingM, teamM, reports: [...reports.values()], fieldPointIds: [...new Set(legs.flatMap(leg => leg.fieldPointIds))],
  }
}

export function planRoutes(network: RoutingNetwork, a: Coordinate, b: Coordinate, preference: PlanningPreference,
    context: PlanningContext = {}, weights = routingWeights[preference]): PlanningResult {
  if (!inRoutingBounds(a, network.bounds)) return { status: 'outside-a' }
  if (!inRoutingBounds(b, network.bounds)) return { status: 'outside-b' }
  const edges = roadEdges(network, context)
  const from = nearbyAccesses(a, edges).get(0)
  if (!from) return { status: 'unsnapped-a' }
  const to = nearbyAccesses(b, edges).get(0)
  if (!to) return { status: 'unsnapped-b' }
  if (distance(from.coordinate, to.coordinate) < .8 &&
      (from.edge.id === to.edge.id || distance(a, b) < .8)) return { status: 'same-access' }
  const choose = (start: Snap, end: Snap): PlanningResult => {
    const graph = makeGraph(network, edges, start, end)
    if (graph.from === graph.to) return { status: 'same-access' }
    const candidates = selectCandidates(graph, preference, weights)
    if (!candidates.length) return { status: 'disconnected' }
    return {
      status: 'ok',
      access: [start, end].map(({ coordinate, offsetM }) => ({ coordinate, offsetM })) as [RoadAccess, RoadAccess],
      routes: candidates.map(candidate => describeCandidate(candidate, context)),
    }
  }
  const nearest = choose(from, to)
  if (nearest.status !== 'disconnected' || from.offsetM <= 1 && to.offsetM <= 1) return nearest
  for (const [start, end] of connectedAccessPairs(network, edges, a, b, from, to)) {
    const result = choose(start, end)
    if (result.status === 'ok') return result
  }
  return nearest
}
