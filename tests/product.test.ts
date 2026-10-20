import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campus, NavigationState, RouteLimits } from '../src/types'
import { buildDemoRoutes, fromHash, toHash } from '../src/routes'
import { canOpenFavorite, daysSince, emptyLimits, favoriteFor, limitReasons, oldestVerification, readFavorites, readInitialNavigation, resolveSharedRoute, savePreferences, selectCandidates, writeFavorites } from '../src/product'

const campus = JSON.parse(readFileSync(new URL('../public/data/campus.json', import.meta.url), 'utf8')) as Campus
const demos = () => buildDemoRoutes(campus)
const state = (limits: Partial<RouteLimits> = {}): NavigationState => ({ ...fromHash(''), limits: { ...emptyLimits, ...limits } })
const surveyed = () => {
  const route = demos()[0]
  route.kind = 'survey'
  for (const item of [route.originEntrance, ...route.segments, route.destinationEntrance]) Object.assign(item, { status: 'verified', verifiedAt: '2026-10-20', source: 'Software fixture only', photos: [{ src: '/fixture.jpg', alt: 'Fixture', caption: 'Not actual survey evidence' }] })
  return route
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T03:00:00Z'))
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value) } })
  vi.stubGlobal('window', { location: { hash: '' } })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('personal route constraints', () => {
  it('returns two, one or zero candidates and keeps clear exclusion reasons', () => {
    expect(selectCandidates(demos(), state()).accepted).toHaveLength(2)
    const one = selectCandidates(demos(), state({ maxSlope: 3, minWidth: 1.8, maxStep: 0 }))
    expect(one.accepted.map(r => r.id)).toEqual(['gentle'])
    expect(one.excluded).toHaveLength(1)
    expect(one.excluded[0].reasons).toEqual(expect.arrayContaining([expect.stringContaining('最大坡度'), expect.stringContaining('最窄路寬')]))
    const none = selectCandidates(demos(), state({ maxSlope: 2 }))
    expect(none.accepted).toHaveLength(0)
    expect(none.excluded).toHaveLength(2)
  })
  it('accepts values exactly at each limit and excludes unknown measurements', () => {
    expect(selectCandidates(demos(), state({ maxSlope: 6, minWidth: 1.2, maxStep: 0 })).accepted).toHaveLength(2)
    for (const [field, limits, label] of [
      ['maxSlopePercent', { maxSlope: 6 }, '最大坡度尚無資料'],
      ['minWidthM', { minWidth: 1 }, '有效路寬尚無資料'],
      ['stepHeightCm', { maxStep: 0 }, '最大階差尚無資料'],
    ] as const) {
      const route = demos()[0]
      route.segments[0][field] = null
      const result = selectCandidates([route], state(limits))
      expect(result.accepted).toHaveLength(0)
      expect(result.excluded[0].reasons).toContain(label)
    }
  })
  it('uses the oldest entrance or segment check and accepts the recheck-day boundary', () => {
    const route = surveyed()
    route.destinationEntrance.verifiedAt = '2026-10-13'
    expect(oldestVerification(route)).toBe('2026-10-13')
    const navigation = { ...state({ recheckDays: 7 }), mode: 'survey' as const }
    expect(selectCandidates([route], navigation).accepted).toHaveLength(1)
    route.segments[0].verifiedAt = '2026-10-12'
    expect(selectCandidates([route], navigation).accepted).toHaveLength(0)
    expect(selectCandidates([route], navigation).excluded[0].reasons).toContain('最舊查核已過 8 天，超過設定 7 天')
  })
  it('does not invent field-check dates for demos and excludes incomplete surveyed evidence', () => {
    const demo = demos()[0]
    expect(oldestVerification(demo)).toBeNull()
    expect(limitReasons(demo, { ...emptyLimits, recheckDays: 0 })).toEqual([])
    const real = surveyed()
    real.originEntrance.verifiedAt = null
    expect(limitReasons(real, { ...emptyLimits, recheckDays: 7 })).toContain('查核日期尚未齊備')
    expect(selectCandidates([real], { ...state(), mode: 'survey' }).accepted).toHaveLength(0)
    expect(daysSince('2026-10-18', new Date('2026-10-19T16:00:01Z'))).toBe(2)
  })
  it('round trips valid constraints and rejects malformed URL limits', () => {
    const original = state({ maxSlope: 0, minWidth: 1.8, maxStep: 0.5, recheckDays: 30 })
    expect(fromHash(toHash(original))).toEqual(original)
    expect(fromHash('#maxSlope=-1&minWidth=Infinity&maxStep=1001&recheckDays=1.5').limits).toBeUndefined()
  })
})

describe('shared route resolution', () => {
  it('fails closed for missing or removed route IDs instead of selecting a different route', () => {
    for (const screen of ['detail', 'confirm'] as const) for (const routeId of ['', 'removed-route']) {
      const resolved = resolveSharedRoute(demos(), { ...state(), screen, routeId })
      expect(resolved.problem).toBe('route')
      expect(resolved.route).toBeUndefined()
    }
    expect(resolveSharedRoute(demos(), state()).route).toBeDefined()
  })
  it('flags a removed segment while preserving the matching route for an explicit recovery action', () => {
    const routes = demos(), route = routes[0]
    const navigation = { ...state(), screen: 'detail' as const, routeId: route.id, segmentId: 'removed-segment' }
    expect(resolveSharedRoute(routes, navigation)).toEqual({ route, problem: 'segment' })
    expect(resolveSharedRoute(routes, { ...navigation, segmentId: route.segments[0].id })).toEqual({ route })
    expect(resolveSharedRoute([], { ...navigation, screen: 'confirm' })).toEqual({ problem: 'route' })
  })
})

describe('saved routes and browser preferences', () => {
  it('preserves favorite direction and limits while refusing routes that became unavailable', () => {
    const routes = demos(), route = routes[0]
    const navigation = { ...state({ maxSlope: 6 }), origin: 'boya' as const, wheelchair: 'electric' as const }
    const favorite = favoriteFor(route, navigation)
    writeFavorites([favorite])
    expect(readFavorites()).toEqual([favorite])
    expect(fromHash(favorite.hash)).toEqual({ ...navigation, screen: 'confirm', routeId: route.id, segmentId: '' })
    expect(canOpenFavorite(favorite, routes)).toBe(true)
    route.segments[0].closed = true
    expect(canOpenFavorite(favorite, routes)).toBe(false)
    expect(canOpenFavorite(favorite, [])).toBe(false)
  })
  it('recovers from malformed storage and filters damaged favorites without removing valid entries', () => {
    const valid = favoriteFor(demos()[0], state())
    for (const raw of ['{bad json', '{"version":2,"items":[]}', '{"version":1,"items":{}}']) {
      localStorage.setItem('wheelway:favorites:v1', raw)
      expect(readFavorites()).toEqual([])
    }
    localStorage.setItem('wheelway:favorites:v1', JSON.stringify({ version: 1, items: [valid, null, { ...valid, hash: 'javascript:bad' }, { ...valid, origin: 'unknown' }, { ...valid, savedAt: 'bad date' }] }))
    expect(readFavorites()).toEqual([valid])
    localStorage.setItem('wheelway:preferences:v1', '{bad json')
    expect(readInitialNavigation()).toEqual(fromHash(''))
  })
  it('rejects a damaged favorite with a numeric timestamp instead of asserting the wrong runtime type', () => {
    const valid = favoriteFor(demos()[0], state())
    localStorage.setItem('wheelway:favorites:v1', JSON.stringify({ version: 1, items: [valid, { ...valid, savedAt: 1 }] }))
    expect(readFavorites()).toEqual([valid])
  })
  it('restores personal preferences without restoring a prior selection, and prioritizes explicit share links', () => {
    const previous = { ...state({ minWidth: 1.8 }), screen: 'confirm' as const, origin: 'boya' as const, routeId: 'direct', wheelchair: 'electric' as const, preference: 'short' as const }
    savePreferences(previous)
    expect(readInitialNavigation()).toEqual({ ...fromHash(''), wheelchair: 'electric', preference: 'short', limits: previous.limits })
    window.location.hash = '#screen=confirm&mode=demo&route=gentle&chair=manual'
    expect(readInitialNavigation()).toEqual(fromHash(window.location.hash))
  })
  it('keeps route planning usable when localStorage is blocked and lets callers report failed saves', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new DOMException('Blocked', 'SecurityError') }, setItem: () => { throw new DOMException('Blocked', 'SecurityError') } })
    expect(readFavorites()).toEqual([])
    expect(readInitialNavigation()).toEqual(fromHash(''))
    expect(() => writeFavorites([])).toThrow('Blocked')
    expect(() => savePreferences(state())).toThrow('Blocked')
  })
})
