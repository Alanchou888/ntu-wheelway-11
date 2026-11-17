import { roadReportId } from './community-model'
import type { CommunitySegment } from './community-model'
import { projectOntoLine } from './road-conditions'
import { lineMidpoint } from './routes'
import { roadName } from './routing-network'
import type { RoutingNetwork } from './routing-network'
import type { Coordinate } from './types'

export type ReportableRoad = CommunitySegment & { coordinates: Coordinate[] }
export const reportRoadReachM = 18

export function indexReportableRoads(network: RoutingNetwork): ReadonlyMap<string, ReportableRoad[]> {
  const index = new Map<string, ReportableRoad[]>()
  for (const way of network.ways) {
    if (way.separateLevel) continue
    const id = roadReportId(way.osmId)
    const coordinates = way.nodes.map(node => network.nodes[node])
    const road = { id, name: roadName(way), routeName: '校園路網', coordinate: lineMidpoint(coordinates), coordinates }
    const previous = index.get(id)
    if (previous) previous.push(road)
    else index.set(id, [road])
  }
  return index
}

export function nearestReportRoad(point: Coordinate, roads: Iterable<ReportableRoad[]>) {
  let best: { road: ReportableRoad; coordinate: Coordinate; offsetM: number } | undefined
  for (const fragments of roads) {
    for (const road of fragments) {
      const projection = projectOntoLine(point, road.coordinates)
      if (projection.offsetM <= reportRoadReachM && (!best || projection.offsetM < best.offsetM)) {
        best = { road, ...projection }
      }
    }
  }
  return best
}
