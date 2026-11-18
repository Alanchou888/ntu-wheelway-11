import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeRoutingNetwork } from '../scripts/refresh-routing.mjs'
import type { CommunityReport } from '../src/community-model'
import { planEndpoint } from '../src/planning-params'
import { publicHash } from '../src/public-navigation'
import { fromHash } from '../src/routes'
import { parseRoutingNetwork } from '../src/routing-network'
import type { RoadWay, RoutingNetwork } from '../src/routing-network'
import { planRoutes } from '../src/routing-plan'
import type { PlannedLeg } from '../src/routing-plan'
import { routeMeasurementRequests } from '../src/route-measurement-requests'
import type { Coordinate } from '../src/types'
import { buildWalkedRoutes } from '../src/walked-routes'

const a: Coordinate = [121.5368, 25.018]
const junction: Coordinate = [121.5373, 25.018]
const b: Coordinate = [121.5378, 25.018]
const north: Coordinate = [121.5373, 25.01835]
const south: Coordinate = [121.5373, 25.01765]
const now = Date.parse('2026-11-17T05:00:00Z')
const sourceUrl = 'https://download.geofabrik.de/asia/taiwan.html'

function road(osmId: number, nodes: number[], patch: Partial<RoadWay> = {}): RoadWay {
  return {
    osmId, nodes, direction: 3, highway: 'footway', name: null, surface: null, smoothness: null, wheelchair: null,
    inclinePercent: null, widthM: null, crossing: false, ramp: false, separateLevel: false, ...patch,
  }
}

function network(ways: RoadWay[], nodes = [a, junction, b, north, south]): RoutingNetwork {
  return {
    version: 1, sourceUrl, nodes, ways, dataAsOf: null, retrievedAt: new Date(now).toISOString(),
    license: 'ODbL-1.0', bounds: [121.5338, 25.0116, 121.5446, 25.022],
  }
}

function report(patch: Partial<CommunityReport> = {}): CommunityReport {
  return {
    id: 'closure', segmentId: 'field-section', category: 'construction', impact: 'blocked', coordinate: junction,
    message: 'Test closure', authorName: 'TEST', observedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString(),
    photoUrl: null, own: false, counts: { exists: 0, resolved: 0, different: 0 }, lastExistsAt: null,
    lastResolvedAt: null, lastDifferentAt: null, myReaction: null, updates: [], ...patch,
  }
}

describe('outdoor routing', () => {
  it('prioritizes a ramp and a reported pinch point, and skips an already measured location', () => {
    const leg = (way: RoadWay, distanceM: number, reports: CommunityReport[] = []): PlannedLeg => ({
      id: String(way.osmId), name: '步道', way, coordinates: [a, b], distanceM,
      teamSegmentNames: [], fieldPointIds: [], reports,
    })
    const measured = report({ segmentId: 'osm-1', measurements: { widthCm: 98, slopePercent: 0, stepCm: null, surface: null } })
    const ramp = road(1, [0, 2], { ramp: true })
    const narrow = leg(road(2, [0, 2], { wheelchair: 'limited' }), 25)
    const ordinary = leg(road(3, [0, 2]), 100)
    const tunnel = leg(road(4, [0, 2], { separateLevel: true }), 120)
    const requests = routeMeasurementRequests([ordinary, narrow, tunnel, leg(ramp, 15)])
    expect(requests.map(({leg, field}) => [leg.id, field])).toEqual([['1', 'slopePercent'], ['2', 'widthCm'], ['3', 'widthCm']])
    expect(routeMeasurementRequests([leg(ramp, 20), leg(ramp, 15, [measured])])).toEqual([])
    expect(routeMeasurementRequests([leg(ramp, 15, [{ ...measured, coordinate: north }])])).toHaveLength(1)
  })

  it('snaps onto the real path, preserves bends and recalculates the reverse direction', () => {
    const data = network([road(1, [0, 3, 2])])
    const offRoad: Coordinate = [a[0], a[1] - .00008]
    const result = planRoutes(data, offRoad, b, 'short')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error(result.status)
    expect(result.routes[0].coordinates).toEqual([a, north, b])
    expect(result.access[0].offsetM).toBeGreaterThan(7)
    expect(result.routes[0].distanceM).toBeGreaterThan(120)
    expect(result.routes[0].estimateMinutes).toBeGreaterThan(1)
    const back = planRoutes(data, b, a, 'short')
    expect(back.status === 'ok' && back.routes[0].coordinates).toEqual([b, north, a])
  })

  it('respects walk direction even for points snapped to the middle of the same edge', () => {
    const data = network([road(1, [0, 2], { direction: 1 })])
    const left: Coordinate = [121.537, 25.018]
    const right: Coordinate = [121.53765, 25.018]
    const result = planRoutes(data, left, right, 'short')
    expect(result.status === 'ok' && result.routes[0].coordinates).toEqual([left, right])
    expect(planRoutes(data, right, left, 'short')).toEqual({ status: 'disconnected' })
    expect(planRoutes(data, left, left, 'short')).toEqual({ status: 'same-access' })
  })

  it('does not connect overlapping lines with distinct OSM nodes and explains unavailable endpoints', () => {
    const data = network([road(1, [0, 2]), road(2, [3, 4])])
    expect(planRoutes(data, a, north, 'comfort')).toEqual({ status: 'disconnected' })
    expect(planRoutes(data, a, [121.537, 25.020], 'comfort')).toEqual({ status: 'unsnapped-b' })
    expect(planRoutes(data, [121.55, 25.018], b, 'comfort')).toEqual({ status: 'outside-a' })
    expect(planRoutes(data, a, [121.55, 25.018], 'comfort')).toEqual({ status: 'outside-b' })
  })

  it('offers different geometries, deduplicates a coincident way and uses actual known tags for preferences', () => {
    const data = network([
      road(1, [0, 1, 2], { inclinePercent: 14, surface: 'gravel', widthM: .8 }),
      road(2, [0, 3, 2], { inclinePercent: 2, widthM: 1.4, surface: 'asphalt' }),
      road(3, [0, 4, 2]), road(4, [0, 1, 2]),
    ])
    const shortest = planRoutes(data, a, b, 'short')
    expect(shortest.status === 'ok' && shortest.routes[0].coordinates).toEqual([a, junction, b])
    const weighted = planRoutes(network(data.ways.slice(0, 3)), a, b, 'gentle')
    if (weighted.status !== 'ok') throw new Error(weighted.status)
    // Anonymous slope is unknown, so compare two tagged choices separately.
    const known = planRoutes(network(data.ways.slice(0, 2)), a, b, 'gentle')
    expect(known.status === 'ok' && known.routes[0].markedSlopeMax).toBe(2)
    expect(weighted.routes.map(route => JSON.stringify(route.coordinates)).length).toBe(3)
    expect(new Set(weighted.routes.map(route => JSON.stringify(route.coordinates))).size).toBe(3)
    expect(shortest.status === 'ok' && new Set(shortest.routes.map(route => JSON.stringify(route.coordinates))).size).toBe(3)
    const unknown = weighted.routes.find(route => route.coordinates[1] === south)
    expect(unknown?.markedSlopeMax).toBeNull()
    expect(unknown?.markedWidthMin).toBeNull()
    expect(unknown?.missingM).toBe(unknown?.distanceM)
  })

  it('offers only one route when alternate ways have the same geometry', () => {
    const data = network([road(1, [0, 1, 2]), road(2, [0, 2]), road(3, [0, 1, 2])])
    const result = planRoutes(data, a, b, 'short')
    expect(result.status === 'ok' && result.routes).toHaveLength(1)
  })

  it('keeps connected bridges routable without snapping a 2D point onto an elevated edge', () => {
    const c: Coordinate = [121.5388, 25.018]
    const inner: Coordinate = [121.5378, 25.018]
    const data = network([road(1, [0, 1]), road(2, [1, 2, 3], { separateLevel: true }), road(3, [3, 4])],
      [a, junction, inner, c, [121.5391, 25.018]])
    const end = data.nodes[4]
    const result = planRoutes(data, a, end, 'short')
    expect(result.status === 'ok' && result.routes[0].legs.some(leg => leg.way.separateLevel)).toBe(true)
    expect(planRoutes(data, a, inner, 'short')).toEqual({ status: 'unsnapped-b' })
  })

  it('finds a connected nearby access off a path without jumping from a mapped isolated line', () => {
    const isolated: Coordinate[] = [[121.5368, 25.01815], [121.537, 25.01815]]
    const data = network([road(1, [0, 1, 2]), road(2, [3, 4])], [a, junction, b, ...isolated])
    const point: Coordinate = [121.5369, 25.0182]
    const route = planRoutes(data, point, b, 'short')
    if (route.status !== 'ok') throw new Error(route.status)
    expect(route.access[0].coordinate).toEqual([121.5369, 25.018])
    expect(route.access[0].offsetM).toBeGreaterThan(20)
    expect(route.routes[0].coordinates[0]).toEqual(route.access[0].coordinate)
    expect(planRoutes(data, isolated[0], b, 'short')).toEqual({ status: 'disconnected' })
  })

  it('excludes active point and whole-segment closures and distinguishes difficult, resolved and indoor reports', () => {
    const data = network([road(1, [0, 1, 2]), road(2, [0, 3, 2])])
    const context = { now, reports: [report()] }
    const blocked = planRoutes(data, a, b, 'short', context)
    expect(blocked.status === 'ok' && blocked.routes.map(route => route.coordinates)).toEqual([[a, north, b]])
    const closedSection = planRoutes(data, a, b, 'short', {
      now, reports: [report({ coordinate: null })],
      reportSegments: [{ id: 'field-section', name: 'section', routeName: 'field', coordinate: junction, coordinates: [a, b] }],
    })
    expect(closedSection.status === 'ok' && closedSection.routes[0].coordinates).toEqual([a, north, b])
    const difficult = planRoutes(data, a, b, 'short', { now, reports: [report({ impact: 'difficult' })] })
    expect(difficult.status === 'ok' && difficult.routes[0].reports).toHaveLength(1)
    const resolved = planRoutes(data, a, b, 'short', { now, reports: [report({ lastResolvedAt: new Date(now).toISOString() })] })
    expect(resolved.status === 'ok' && resolved.routes[0].coordinates).toEqual([a, junction, b])
    const indoors = planRoutes(data, a, b, 'short', {
      ...context, reportSegments: [{ id: 'field-section', name: 'indoors', routeName: 'field', coordinate: junction, approximate: true }],
    })
    expect(indoors.status === 'ok' && indoors.routes[0].coordinates).toEqual([a, junction, b])
  })

  it('warns about a new road closure until a second user confirms, then avoids only the matched way', () => {
    const data = network([road(1, [0, 1, 2]), road(2, [0, 3, 2])])
    const closure = report({ segmentId: 'osm-1' })
    const unconfirmed = planRoutes(data, a, b, 'short', { now, reports: [closure] })
    if (unconfirmed.status !== 'ok') throw new Error(unconfirmed.status)
    expect(unconfirmed.routes[0].coordinates).toEqual([a, junction, b])
    expect(unconfirmed.routes[0].reports).toContainEqual(closure)
    const confirmed = { ...closure, counts: { exists: 1, resolved: 0, different: 0 } }
    const alternative = planRoutes(data, a, b, 'short', { now, reports: [confirmed] })
    expect(alternative.status === 'ok' && alternative.routes[0].coordinates).toEqual([a, north, b])
    const unrelated = planRoutes(data, a, b, 'short', { now, reports: [{ ...confirmed, segmentId: 'osm-99' }] })
    expect(unrelated.status === 'ok' && unrelated.routes[0].coordinates).toEqual([a, junction, b])
  })

  it('finds real alternatives around NTU from the checked-in snapshot in both directions', () => {
    const data = parseRoutingNetwork(JSON.parse(readFileSync('public/data/routing-network.json', 'utf8')))
    const [out] = buildWalkedRoutes()
    const from = out.originEntrance.coordinate, to = out.destinationEntrance.coordinate
    for (const [start, end] of [[from, to], [to, from]]) {
      const result = planRoutes(data, start, end, 'comfort')
      if (result.status !== 'ok') throw new Error(result.status)
      expect(result.routes.length).toBeGreaterThan(1)
      expect(new Set(result.routes.map(route => JSON.stringify(route.coordinates))).size).toBe(result.routes.length)
      for (const candidate of result.routes) {
        expect(candidate.coordinates.length).toBeGreaterThan(5)
        expect(candidate.distanceM).toBeGreaterThan(400)
        expect(candidate.legs.every(leg => leg.way.highway !== 'steps' && leg.way.wheelchair !== 'no')).toBe(true)
      }
    }
    expect(planRoutes(data, [121.539607, 25.016868], [121.53831, 25.017867], 'comfort').status).toBe('ok')
  })
})

describe('routing snapshot and links', () => {
  it('drops stairs, private, indoor and impassable ways, and splits at barriers without making new links', () => {
    const nodes = [a, junction, b, north, south].map(([lon, lat], i) => ({
      type: 'node', id: i + 1, lon, lat, tags: i === 1 ? { barrier: 'stile' } : {},
    }))
    const examples = [
      { highway: 'steps' }, { highway: 'footway', access: 'private' }, { highway: 'footway', indoor: 'yes' },
      { highway: 'footway', wheelchair: 'no' }, { highway: 'footway', smoothness: 'impassable' },
      { highway: 'footway' }, { highway: 'footway', 'oneway:foot': '-1', width: '98 cm', incline: '+7%' },
    ]
    const ways = examples.map((tags, i) => ({
      type: 'way', id: i + 10, tags, nodes: i === 5 ? [4, 1, 2, 3, 5] : [1, 3],
    }))
    const normalized = normalizeRoutingNetwork({ elements: [...nodes, ...ways] }, { sourceUrl, now: new Date(now) })
    const result = parseRoutingNetwork(normalized)
    expect(result.ways.map(way => way.osmId)).toEqual([15, 15, 16])
    expect(result.ways[2]).toMatchObject({ direction: 2, widthM: .98, inclinePercent: 7 })
    expect(result.nodes).not.toContainEqual(junction)
    expect(result.ways.slice(0, 2).map(way => way.nodes.map(i => result.nodes[i]))).toEqual([[north, a], [b, south]])
    expect(() => parseRoutingNetwork({ ...result, ways: [road(1, [0, 999])] })).toThrow()
  })

  it('keeps a planned link separate from existing walked routes and rejects invalid parameters', () => {
    const state = fromHash('#screen=plan')
    const plan = { start: planEndpoint('起點', a), end: planEndpoint('終點', b), preference: 'gentle' as const }
    expect(fromHash(publicHash({ ...state, plan, planChoice: 'plan-abc1' })))
      .toMatchObject({ screen: 'plan', plan, planChoice: 'plan-abc1' })
    expect(fromHash('#screen=plan&a=181,25&b=bad&style=invalid&choice=x').plan)
      .toEqual({ start: undefined, end: undefined, preference: 'comfort' })
    const older = fromHash('#screen=detail&route=walk-back&segment=walk-back-3')
    expect(fromHash(publicHash(older))).toMatchObject({ screen: 'detail', routeId: 'walk-back', segmentId: 'walk-back-3' })
  })
})
