import type { Coordinate, Route, Segment } from './types'
import { distance, lineDistance } from './routes'

export interface TourLeg {
  segment: Segment
  index: number
  startM: number
  endM: number
  distanceM: number
}
export interface RouteTour { key: string; legs: TourLeg[]; distanceM: number }
export interface TourPosition { leg: TourLeg; coordinate: Coordinate; distanceM: number }

export function createTour(route: Route | null): RouteTour {
  if (!route) return { key: '', legs: [], distanceM: 0 }
  let accumulated = 0
  const legs = route.segments.map((segment, index) => {
    const length = lineDistance(segment.coordinates)
    const distanceM = Number.isFinite(length) && length > 0 ? length : 0
    const startM = accumulated
    accumulated += distanceM
    return { segment, index, startM, endM: accumulated, distanceM }
  })
  return {
    key: JSON.stringify([route.id, route.originEntrance.id, legs.map(l => [l.segment.id, l.segment.coordinates])]),
    legs, distanceM: accumulated,
  }
}

export function clampDistance(value: number, total: number): number {
  const upper = Number.isFinite(total) ? Math.max(0, total) : 0
  return Number.isFinite(value) ? Math.max(0, Math.min(upper, value)) : 0
}

/** Follow each original polyline edge. Never interpolate across a bend or a segment gap. */
export function positionAt(tour: RouteTour, value: number): TourPosition | null {
  const positive = tour.legs.filter(l => l.distanceM > 0)
  if (!positive.length) return null
  const target = clampDistance(value, tour.distanceM)
  const leg = positive.find(l => target < l.endM - 1e-7) ?? positive[positive.length - 1]
  const points = leg.segment.coordinates
  let remaining = Math.max(0, target - leg.startM)
  for (let i = 1; i < points.length; i++) {
    const edge = distance(points[i - 1], points[i])
    if (edge <= 0) continue
    if (remaining <= edge) {
      const t = remaining / edge
      return { leg, distanceM: target, coordinate: [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ] }
    }
    remaining -= edge
  }
  return { leg, distanceM: target, coordinate: points[points.length - 1] }
}

export function advanceTour(tour: RouteTour, current: number, delta: number, pauseEach: boolean) {
  const start = clampDistance(current, tour.distanceM)
  let next = clampDistance(start + Math.max(0, Number.isFinite(delta) ? delta : 0), tour.distanceM)
  let stopped = false
  if (pauseEach) {
    const boundary = tour.legs.find(l => l.endM > start + 1e-6 && l.endM <= next)
    if (boundary) { next = boundary.endM; stopped = true }
  }
  const complete = next >= tour.distanceM
  return { distanceM: next, stopped: stopped || complete, complete }
}
