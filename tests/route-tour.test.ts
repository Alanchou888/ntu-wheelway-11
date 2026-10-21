import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Campus } from '../src/types'
import { buildDemoRoutes, distance, metrics, reverseRoute } from '../src/routes'
import { advanceTour, clampDistance, createTour, positionAt } from '../src/route-tour'

const campus = JSON.parse(readFileSync(new URL('../public/data/campus.json', import.meta.url), 'utf8')) as Campus
const route = buildDemoRoutes(campus).find(r => r.id === 'gentle')!
const tour = createTour(route)

describe('route preview geometry and checkpoints', () => {
  it('accounts for every original road edge and uses distance-based segment proportions', () => {
    expect(tour.distanceM).toBeCloseTo(metrics(route).distanceM, 6)
    expect(tour.legs.map(l => l.index)).toEqual([0, 1, 2, 3])
    expect(tour.legs[0].startM).toBe(0)
    expect(tour.legs.at(-1)!.endM).toBe(tour.distanceM)
    expect(tour.legs[1].startM).toBe(tour.legs[0].endM)
  })
  it('keeps the origin and destination exact at either end', () => {
    expect(positionAt(tour, -1)!.coordinate).toEqual(route.segments[0].coordinates[0])
    const end = positionAt(tour, tour.distanceM * 2)!.coordinate
    expect(distance(end, route.destinationEntrance.coordinate)).toBeLessThan(.001)
  })
  it('enters the next segment at the checkpoint and stays inside its original polyline', () => {
    const next = positionAt(tour, tour.legs[0].endM)!
    expect(next.leg.index).toBe(1)
    expect(next.coordinate).toEqual(route.segments[1].coordinates[0])
  })
  it('follows an L-shaped bend rather than cutting diagonally between endpoints', () => {
    const sample = structuredClone(route)
    sample.segments = [sample.segments[0]]
    sample.segments[0].coordinates = [[121, 25], [121.001, 25], [121.001, 25.001]]
    const bend = createTour(sample)
    const horizontal = distance([121, 25], [121.001, 25])
    const location = positionAt(bend, horizontal + (bend.distanceM - horizontal) / 2)!.coordinate
    expect(location[0]).toBeCloseTo(121.001, 9)
    expect(location[1]).toBeCloseTo(25.0005, 9)
  })
  it('does not invent a connecting path across a gap in input geometry', () => {
    const sample = structuredClone(route)
    sample.segments = sample.segments.slice(0, 2)
    sample.segments[0].coordinates = [[121, 25], [121.001, 25]]
    sample.segments[1].coordinates = [[122, 25], [122.001, 25]]
    const gap = createTour(sample)
    expect(positionAt(gap, gap.legs[0].endM)!.coordinate).toEqual([122, 25])
    expect(gap.distanceM).toBeLessThan(210)
  })
  it('reverses segment order and geometry together without reusing the old route identity', () => {
    const reversed = createTour(reverseRoute(route))
    expect(reversed.key).not.toBe(tour.key)
    expect(reversed.legs.map(l => l.segment.id)).toEqual([...route.segments].reverse().map(s => s.id))
    expect(distance(positionAt(reversed, 0)!.coordinate, route.destinationEntrance.coordinate)).toBeLessThan(.001)
    const a = positionAt(tour, 120)!, b = positionAt(reversed, reversed.distanceM - 120)!
    expect(distance(a.coordinate, b.coordinate)).toBeLessThan(.001)
  })
  it('pauses at the first crossed boundary even when a frame spans multiple segments', () => {
    const next = advanceTour(tour, 0, tour.distanceM, true)
    expect(next).toEqual({ distanceM: tour.legs[0].endM, stopped: true, complete: false })
    const continued = advanceTour(tour, next.distanceM, tour.distanceM, true)
    expect(continued.distanceM).toBe(tour.legs[1].endM)
  })
  it('can run continuously and always stops exactly at the destination', () => {
    expect(advanceTour(tour, 0, tour.distanceM * 10, false)).toEqual({ distanceM: tour.distanceM, stopped: true, complete: true })
  })
  it('handles empty and zero-length geometry without generating a marker or NaN', () => {
    expect(positionAt(createTour(null), 1)).toBeNull()
    const sample = structuredClone(route)
    sample.segments = [sample.segments[0]]
    sample.segments[0].coordinates = [[121, 25], [121, 25]]
    expect(positionAt(createTour(sample), 1)).toBeNull()
  })
  it('skips repeated vertices while preserving valid distance and coordinates', () => {
    const sample = structuredClone(route)
    sample.segments[0].coordinates.unshift(sample.segments[0].coordinates[0])
    const repeated = createTour(sample)
    expect(repeated.distanceM).toBeCloseTo(tour.distanceM, 8)
    expect(distance(positionAt(repeated, 50)!.coordinate, positionAt(tour, 50)!.coordinate)).toBeLessThan(.001)
  })
  it('rejects invalid movement values and never mutates source evidence', () => {
    const before = JSON.stringify(route)
    expect(clampDistance(Infinity, 100)).toBe(0)
    expect(clampDistance(NaN, 100)).toBe(0)
    expect(advanceTour(tour, 20, -10, true).distanceM).toBe(20)
    expect(advanceTour(tour, 20, NaN, true).distanceM).toBe(20)
    expect(JSON.stringify(route)).toBe(before)
  })
})
