import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Campus, Route } from '../src/types'
import { buildDemoRoutes, candidateRoutes, distance, formatDate, fromHash, isEligible, lineDistance, metrics, reverseRoute, routeCoordinates, splitLine, toHash } from '../src/routes'

const campus = JSON.parse(readFileSync(new URL('../public/data/campus.json', import.meta.url), 'utf8')) as Campus
const demos = buildDemoRoutes(campus)
const clone = <T,>(value: T): T => structuredClone(value)
const surveyFixture = (): Route => {
  const route = clone(demos[0])
  route.kind = 'survey'
  const evidence = { status: 'verified' as const, verifiedAt: '2026-10-19', source: 'Unit-test fixture only', photos: [{ src: '/test.jpg', alt: 'Test fixture', caption: 'Test fixture' }] }
  Object.assign(route.originEntrance, evidence)
  Object.assign(route.destinationEntrance, evidence)
  route.segments.forEach(s => Object.assign(s, evidence))
  return route
}

describe('route comparison and geometry', () => {
  it('uses actual public road geometry with two meaningful alternatives', () => {
    expect(demos).toHaveLength(2)
    const direct = demos.find(r => r.id === 'direct')!, gentle = demos.find(r => r.id === 'gentle')!
    expect(metrics(direct).distanceM).toBeGreaterThan(490)
    expect(metrics(direct).distanceM).toBeLessThan(535)
    expect(metrics(gentle).distanceM).toBeGreaterThan(700)
    expect(routeCoordinates(direct)[0]).toEqual(routeCoordinates(gentle)[0])
    expect(routeCoordinates(direct).at(-1)).toEqual(routeCoordinates(gentle).at(-1))
  })
  it('sorts by distance or maximum slope as requested', () => {
    expect(candidateRoutes(demos, 'demo', 'short').map(r => r.id)).toEqual(['direct', 'gentle'])
    expect(candidateRoutes(demos, 'demo', 'gentle').map(r => r.id)).toEqual(['gentle', 'direct'])
    expect(metrics(demos.find(r => r.id === 'gentle')!).maxSlopePercent).toBe(3)
  })
  it('breaks slope ties by distance', () => {
    const values = clone(demos)
    values.forEach(route => route.segments.forEach(s => { s.maxSlopePercent = 3 }))
    expect(candidateRoutes(values, 'demo', 'gentle')[0].id).toBe('direct')
  })
  it('preserves the full line and distance when splitting and reversing', () => {
    campus.paths.forEach(path => {
      const segments = splitLine(path.coordinates)
      expect(segments).toHaveLength(4)
      expect(segments.slice(1).every((s, i) => s[0][0] === segments[i].at(-1)![0] && s[0][1] === segments[i].at(-1)![1])).toBe(true)
      expect(segments.reduce((n, p) => n + lineDistance(p), 0)).toBeCloseTo(lineDistance(path.coordinates), 3)
    })
    const reversed = reverseRoute(demos[0])
    expect(reversed.originEntrance.placeId).toBe('boya')
    expect(routeCoordinates(reversed)[0]).toEqual(routeCoordinates(demos[0]).at(-1))
    expect(metrics(reversed)).toEqual(metrics(demos[0]))
    expect(distance([121.5, 25], [121.5, 25])).toBe(0)
  })
})

describe('evidence and candidate gates', () => {
  it('handles two, one, and zero candidates', () => {
    expect(candidateRoutes(demos, 'demo', 'short')).toHaveLength(2)
    expect(candidateRoutes(demos.slice(0, 1), 'demo', 'short')).toHaveLength(1)
    expect(candidateRoutes([], 'demo', 'short')).toHaveLength(0)
  })
  it('never converts demo or downloaded public data into verified evidence', () => {
    expect(candidateRoutes(demos, 'survey', 'short')).toHaveLength(0)
    expect(demos.every(r => r.segments.every(s => s.verifiedAt === null))).toBe(true)
    expect(campus.facilities.every(f => f.status === 'unverified')).toBe(true)
    const fakePromotion = clone(demos[0])
    fakePromotion.kind = 'survey'
    expect(isEligible(fakePromotion, 'survey')).toBe(false)
  })
  it('requires complete field evidence including both entrances', () => {
    const good = surveyFixture()
    expect(isEligible(good, 'survey')).toBe(true)
    good.destinationEntrance.verifiedAt = null
    expect(isEligible(good, 'survey')).toBe(false)
    const noPhoto = surveyFixture()
    noPhoto.originEntrance.photos = []
    expect(isEligible(noPhoto, 'survey')).toBe(false)
  })
  it.each(['maxSlopePercent', 'minWidthM', 'stepHeightCm', 'rampLengthM', 'surface', 'hasStairs', 'closed'] as const)('excludes unknown %s', key => {
    const route = surveyFixture()
    Object.assign(route.segments[1], { [key]: null })
    expect(isEligible(route, 'survey')).toBe(false)
  })
  it('does not hide a missing measurement in aggregate values', () => {
    const route = surveyFixture()
    route.segments[0].maxSlopePercent = null
    route.segments[0].minWidthM = null
    expect(metrics(route).maxSlopePercent).toBeNull()
    expect(metrics(route).minWidthM).toBeNull()
  })
  it('excludes closed, blocked, stair-containing, and disconnected routes', () => {
    for (const patch of [{ closed: true }, { status: 'blocked' }, { hasStairs: true }]) {
      const route = surveyFixture()
      Object.assign(route.segments[1], patch)
      expect(isEligible(route, 'survey')).toBe(false)
    }
    const disconnected = surveyFixture()
    disconnected.segments[1].coordinates[0] = [121.6, 25.1]
    expect(isEligible(disconnected, 'survey')).toBe(false)
    const closedDemo = clone(demos[0])
    closedDemo.segments[0].closed = true
    expect(isEligible(closedDemo, 'demo')).toBe(false)
    const invalidDate = surveyFixture()
    invalidDate.segments[0].verifiedAt = 'invalid date'
    expect(isEligible(invalidDate, 'survey')).toBe(false)
  })
})

describe('shareable navigation', () => {
  it('round trips route, segment, chair, mode, and direction', () => {
    const state = { screen: 'confirm' as const, mode: 'demo' as const, origin: 'boya' as const, wheelchair: 'electric' as const, preference: 'short' as const, routeId: 'direct', segmentId: 'direct-3' }
    expect(fromHash(toHash(state))).toEqual(state)
  })
  it('validates URL values and keeps survey mode explicit', () => {
    expect(fromHash('#screen=bad&chair=bad&from=bad&prefer=bad').screen).toBe('setup')
    const state = fromHash('#screen=confirm&mode=survey&route=gentle')
    expect(candidateRoutes(demos, state.mode, state.preference)).toHaveLength(0)
    expect(formatDate(null)).toBe('尚未查核')
  })
})
