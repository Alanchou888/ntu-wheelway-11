import type { Mode, NavigationState, Route, RouteLimits } from './types'
import { candidateRoutes, fromHash, isEligible, metrics, toHash, validSurveyDate } from './routes'

export const emptyLimits: RouteLimits = { maxSlope: null, minWidth: null, maxStep: null, recheckDays: null }
export function oldestVerification(route: Route): string | null {
  const items = [route.originEntrance, ...route.segments, route.destinationEntrance]
  if (items.some(item => !validSurveyDate(item.verifiedAt))) return null
  return items.map(item => item.verifiedAt!.slice(0, 10)).sort()[0] ?? null
}
export function daysSince(date: string, now = new Date()): number {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / 86400000)
}
export function limitReasons(route: Route, limits: RouteLimits, now = new Date()): string[] {
  const m = metrics(route), reasons: string[] = []
  if (limits.maxSlope !== null && (m.maxSlopePercent === null || m.maxSlopePercent > limits.maxSlope)) reasons.push(m.maxSlopePercent === null ? '最大坡度尚無資料' : `最大坡度 ${m.maxSlopePercent}%，超過設定 ${limits.maxSlope}%`)
  if (limits.minWidth !== null && (m.minWidthM === null || m.minWidthM < limits.minWidth)) reasons.push(m.minWidthM === null ? '有效路寬尚無資料' : `最窄路寬 ${m.minWidthM} m，低於設定 ${limits.minWidth} m`)
  if (limits.maxStep !== null && (m.maxStepCm === null || m.maxStepCm > limits.maxStep)) reasons.push(m.maxStepCm === null ? '最大階差尚無資料' : `最大階差 ${m.maxStepCm} cm，超過設定 ${limits.maxStep} cm`)
  if (limits.recheckDays !== null && route.kind === 'survey') {
    const date = oldestVerification(route)
    if (!date) reasons.push('查核日期尚未齊備')
    else if (daysSince(date, now) > limits.recheckDays) reasons.push(`最舊查核已過 ${daysSince(date, now)} 天，超過設定 ${limits.recheckDays} 天`)
  }
  return reasons
}
export function selectCandidates(routes: Route[], state: NavigationState, now = new Date()) {
  const all = candidateRoutes(routes, state.mode, state.preference)
  const limits = state.limits ?? emptyLimits
  return { accepted: all.filter(r => !limitReasons(r, limits, now).length), excluded: all.flatMap(route => {
    const reasons = limitReasons(route, limits, now)
    return reasons.length ? [{ route, reasons }] : []
  }) }
}
export function resolveSharedRoute(routes: Route[], state: NavigationState): { route?: Route; problem?: 'route' | 'segment' } {
  const requiresSelection = state.screen === 'detail' || state.screen === 'confirm'
  const route = state.routeId ? routes.find(r => r.id === state.routeId) : requiresSelection ? undefined : routes[0]
  if (requiresSelection && !route) return { problem: 'route' }
  if (route && state.screen === 'detail' && state.segmentId && !route.segments.some(s => s.id === state.segmentId)) return { route, problem: 'segment' }
  return { route }
}

export interface Favorite { key: string; name: string; hash: string; savedAt: string; mode: Mode; origin: string }
const favoritesKey = 'wheelway:favorites:v1'
const preferencesKey = 'wheelway:preferences:v1'
export function readFavorites(): Favorite[] {
  try {
    const value = JSON.parse(localStorage.getItem(favoritesKey) ?? 'null')
    if (value?.version !== 1 || !Array.isArray(value.items)) return []
    return value.items.slice(0, 20).filter((v: unknown): v is Favorite => {
      if (!v || typeof v !== 'object') return false
      const item = v as Favorite
      return typeof item.key === 'string' && item.key.length < 300 && typeof item.name === 'string' && item.name.length <= 200 && typeof item.hash === 'string' && item.hash.startsWith('#') && item.hash.length < 3000 && ['survey', 'demo'].includes(item.mode) && ['library', 'boya'].includes(item.origin) && typeof item.savedAt === 'string' && item.savedAt.length <= 40 && Number.isFinite(Date.parse(item.savedAt))
    })
  } catch { return [] }
}
export function writeFavorites(items: Favorite[]) { localStorage.setItem(favoritesKey, JSON.stringify({ version: 1, items: items.slice(0, 20) })) }
export function favoriteFor(route: Route, state: NavigationState): Favorite {
  return { key: `${state.mode}:${state.origin}:${route.id}`, name: route.name, mode: state.mode, origin: state.origin, hash: toHash({ ...state, routeId: route.id, screen: 'confirm', segmentId: '' }), savedAt: new Date().toISOString() }
}
export function readInitialNavigation(): NavigationState {
  if (window.location.hash) return fromHash(window.location.hash)
  const initial = fromHash('')
  try {
    const data = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null')
    if (data?.version === 1 && typeof data.hash === 'string') {
      const preferences = fromHash(data.hash)
      return { ...initial, wheelchair: preferences.wheelchair, preference: preferences.preference, limits: preferences.limits }
    }
  } catch { /* A blocked browser storage must not prevent ordinary route planning. */ }
  return initial
}
export function savePreferences(state: NavigationState) { localStorage.setItem(preferencesKey, JSON.stringify({ version: 1, hash: toHash({ ...state, routeId: '', segmentId: '', screen: 'setup' }) })) }
export function canOpenFavorite(favorite: Favorite, routes: Route[]): boolean {
  const state = fromHash(favorite.hash)
  return routes.some(r => r.id === state.routeId && isEligible(r, state.mode) && !limitReasons(r, state.limits ?? emptyLimits).length)
}

export async function flushSurveyDraft(): Promise<void> {
  const pending: Promise<unknown>[] = []
  window.dispatchEvent(new CustomEvent('wheelway:survey-flush', { detail: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } }))
  await Promise.all(pending)
}
