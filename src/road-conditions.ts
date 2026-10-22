import type { Coordinate, Route, Segment } from './types'
import { categories, reportState } from './community-model'
import type { CommunityReport, CommunitySegment } from './community-model'

// Coordinates are [longitude, latitude]. Local projection is sufficient for campus distances.
export function distanceToLineM(point: Coordinate, line: Coordinate[]): number {
  if (line.length < 2) return Infinity
  const xScale = 111_320 * Math.cos(point[1] * Math.PI / 180)
  const yScale = 111_320
  let closest = Infinity
  for (let i = 1; i < line.length; i++) {
    const a = [(line[i - 1][0] - point[0]) * xScale, (line[i - 1][1] - point[1]) * yScale]
    const b = [(line[i][0] - point[0]) * xScale, (line[i][1] - point[1]) * yScale]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)))
    closest = Math.min(closest, Math.hypot(a[0] + t * dx, a[1] + t * dy))
  }
  return closest
}

export function validateReportPoint(coordinate: Coordinate | null | undefined, line?: Coordinate[]): void {
  if (coordinate && (!line || distanceToLineM(coordinate, line) > 30)) throw new Error('標記需在所選路段 30 公尺內，請調整位置或改選路段。')
}

export function reportMatchesSegment(report: CommunityReport, segment: Segment, segments: CommunitySegment[] = []): boolean {
  if (report.segmentId === segment.id) return true
  if (report.coordinate) return distanceToLineM(report.coordinate, segment.coordinates) <= 8
  // Legacy whole-segment reports also affect alternate routes sharing a length of that road.
  const source = segments.find(s => s.id === report.segmentId)?.coordinates
  if (!source) return false
  return source.slice(1).some((b, i) => {
    const a = source[i]
    const mid: Coordinate = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    return distanceToLineM(a, segment.coordinates) <= 4 && distanceToLineM(b, segment.coordinates) <= 4 && distanceToLineM(mid, segment.coordinates) <= 4 && Math.hypot((b[0] - a[0]) * 100_000, (b[1] - a[1]) * 111_320) >= 5
  })
}

export function routeReports(route: Route, reports: CommunityReport[], segments: CommunitySegment[] = []) {
  return reports.filter(report => route.segments.some(segment => reportMatchesSegment(report, segment, segments)))
}

export function conditionReasons(route: Route, reports: CommunityReport[], now = Date.now(), segments: CommunitySegment[] = []): string[] {
  const active = routeReports(route, reports, segments).filter(r => reportState(r, now).kind === 'active' && (r.impact === 'blocked' || r.impact === 'difficult'))
  return [...new Set(active.map(report => `近期${categories[report.category]}回報：${segments.find(s => s.id === report.segmentId)?.name ?? route.segments.find(s => s.id === report.segmentId)?.name ?? '共用道路'}（${report.impact === 'blocked' ? '回報無法通行' : '回報通行困難'}）`))]
}

export function conditionDataReady(fetchedAt: string | null, error: string, now = Date.now()): boolean {
  const at = Date.parse(fetchedAt ?? '')
  return !error && Number.isFinite(at) && now - at >= 0 && now - at <= 5 * 60_000
}

export function filterConditions(candidates: { accepted: Route[]; excluded: { route: Route; reasons: string[] }[] }, reports: CommunityReport[], options: { enabled: boolean; ready: boolean; now?: number; segments?: CommunitySegment[] }) {
  if (!options.enabled) return candidates
  const accepted: Route[] = [], excluded = [...candidates.excluded]
  for (const route of candidates.accepted) {
    const reasons = options.ready ? conditionReasons(route, reports, options.now, options.segments) : ['近期社群資料尚未取得或需要更新，暫無法確認避開條件']
    if (reasons.length) excluded.push({ route, reasons })
    else accepted.push(route)
  }
  return { accepted, excluded }
}

export function slopeStyle(value: number | null): { color: string; label: string; dashArray?: string } {
  if (value === null || !Number.isFinite(value)) return { color: '#67778a', label: '坡度未知', dashArray: '3 6' }
  if (value <= 3) return { color: '#205db6', label: '坡度 ≤ 3%' }
  if (value <= 5) return { color: '#98601e', label: '坡度 > 3% 至 5%', dashArray: '10 4' }
  return { color: '#973628', label: '坡度 > 5%', dashArray: '3 4' }
}
