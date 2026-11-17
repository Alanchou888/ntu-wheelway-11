import type { CatalogPlace, Coordinate } from './types'

export const planningPreferences = {
  short: '距離較短',
  gentle: '避開已知陡坡',
  comfort: '避開已知障礙與不平路面',
} as const
export type PlanningPreference = keyof typeof planningPreferences
export type EndpointSlot = 'start' | 'end'

export interface PlanEndpoint { name: string; coordinate: Coordinate }
export interface PlanRequest {
  start?: PlanEndpoint
  end?: PlanEndpoint
  preference: PlanningPreference
}
export const initialPlan: PlanRequest = { preference: 'comfort' }

export function canPlanToPlace(place: CatalogPlace) {
  return !!place.routePlaceId || ((!place.indoor || place.indoor === 'no') && (!place.level || place.level === '0'))
}

export function planEndpoint(name: string, coordinate: Coordinate): PlanEndpoint {
  return { name: name.trim().slice(0, 90), coordinate: [Number(coordinate[0].toFixed(6)), Number(coordinate[1].toFixed(6))] }
}

export function writePlanParams(params: URLSearchParams, plan: PlanRequest, choice?: string) {
  for (const [key, endpoint] of [['a', plan.start], ['b', plan.end]] as const) {
    if (!endpoint) continue
    params.set(key, endpoint.coordinate.join(','))
    params.set(`${key}Name`, endpoint.name)
  }
  params.set('style', plan.preference)
  if (choice) params.set('choice', choice)
}

export function readPlanParams(params: URLSearchParams): { plan: PlanRequest; planChoice?: string } {
  const read = (key: 'a' | 'b'): PlanEndpoint | undefined => {
    const fields = params.get(key)?.split(',')
    if (fields?.length !== 2 || fields.some(field => !/^-?\d{1,3}(?:\.\d{1,10})?$/.test(field))) return
    const [lon, lat] = fields.map(Number)
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return
    return planEndpoint(params.get(`${key}Name`)?.trim() || `地圖選點 ${key.toUpperCase()}`, [lon, lat])
  }
  const style = params.get('style')
  const choice = params.get('choice') ?? ''
  return {
    plan: { start: read('a'), end: read('b'),
      preference: style && Object.hasOwn(planningPreferences, style) ? style as PlanningPreference : initialPlan.preference },
    ...(/^plan-[a-z0-9]{1,12}$/.test(choice) ? { planChoice: choice } : {}),
  }
}
