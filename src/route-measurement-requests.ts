import { roadReportId } from './community-model'
import { distanceToLineM } from './road-conditions'
import type { PlannedLeg } from './routing-plan'

export type RequestedMeasurement = 'widthCm' | 'slopePercent'

export const measurementPrompts = {
  widthCm: '補淨寬',
  slopePercent: '補坡度',
} satisfies Record<RequestedMeasurement, string>

interface MeasurementRequest {
  leg: PlannedLeg
  field: RequestedMeasurement
  reason: string
  priority: number
}

export function routeMeasurementRequests(legs: PlannedLeg[]) {
  const observed = new Map<number, Set<RequestedMeasurement>>()
  for (const leg of legs) {
    const road = leg.way.osmId
    const fields = observed.get(road) ?? new Set<RequestedMeasurement>()
    for (const report of leg.reports) {
      if (report.segmentId !== roadReportId(road) || !report.coordinate ||
          distanceToLineM(report.coordinate, leg.coordinates) > 8) continue
      if (report.measurements?.widthCm != null) fields.add('widthCm')
      if (report.measurements?.slopePercent != null) fields.add('slopePercent')
    }
    observed.set(road, fields)
  }
  const requests = legs.flatMap<MeasurementRequest>(leg => {
    if (leg.way.separateLevel || leg.distanceM < 2) return []
    const fields = observed.get(leg.way.osmId)
    const needsWidth = leg.way.widthM === null && !fields?.has('widthCm')
    const needsSlope = leg.way.ramp && leg.way.inclinePercent === null &&
      !fields?.has('slopePercent')
    if (!needsWidth && !needsSlope) return []

    if (needsSlope) return [{ leg, field: 'slopePercent' as const, reason: '坡道缺坡度資料', priority: 0 }]
    if (leg.way.wheelchair === 'limited' || leg.reports.some(report => report.category === 'narrow' || report.category === 'parking')) {
      return [{ leg, field: 'widthCm' as const, reason: '有通行限制或占道回報，這一處仍缺淨寬', priority: 1 }]
    }
    if (leg.way.ramp || leg.way.crossing) {
      return [{ leg, field: 'widthCm' as const, reason: '坡道或路口缺淨寬資料', priority: 2 }]
    }
    return [{ leg, field: 'widthCm' as const, reason: '這一處缺淨寬資料', priority: 3 }]
  })
  requests.sort((a, b) => a.priority - b.priority || b.leg.distanceM - a.leg.distanceM)
  const seen = new Set<number>()
  return requests.filter(({ leg }) => {
    if (seen.has(leg.way.osmId)) return false
    seen.add(leg.way.osmId)
    return true
  }).slice(0, 3)
}
