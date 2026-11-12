import { toHash } from './routes'
import type { NavigationState } from './types'

/** Keep legacy links usable while limiting public navigation to the two walked routes. */
export function publicNavigation(state: NavigationState): NavigationState {
  const screen = state.screen === 'setup' || state.screen === 'editor' ? 'compare' : state.screen
  const origin = state.routeId === 'walk-out' ? 'library' : state.routeId === 'walk-back' ? 'boya' : state.origin
  return {
    ...state,
    screen,
    origin,
    mode: 'demo',
    wheelchair: 'manual',
    preference: 'gentle',
    limits: undefined,
    avoidReports: undefined,
    mapTheme: state.mapTheme === 'slope' ? undefined : state.mapTheme,
  }
}

export function publicHash(state: NavigationState): string {
  const params = new URLSearchParams(toHash(publicNavigation(state)).slice(1))
  for (const key of ['mode', 'chair', 'prefer']) params.delete(key)
  for (const key of ['route', 'segment']) if (!params.get(key)) params.delete(key)
  return `#${params}`
}
