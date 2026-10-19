import type { Campus, Coordinate, Entrance, Mode, NavigationState, Preference, Route, RouteMetrics, Segment } from './types'

export const placeNames = { library: '總圖書館', boya: '博雅教學館' }
export const initialState: NavigationState = { screen: 'setup', mode: 'demo', origin: 'library', wheelchair: 'manual', preference: 'gentle', routeId: 'gentle', segmentId: '' }

export function distance(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180
  const p = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(p), Math.sqrt(Math.max(0, 1 - p)))
}
export function lineDistance(points: Coordinate[]): number { return points.slice(1).reduce((n, p, i) => n + distance(points[i], p), 0) }
export function routeCoordinates(route: Route): Coordinate[] { return route.segments.flatMap((s, i) => i ? s.coordinates.slice(1) : s.coordinates) }

// Insert boundaries on the original polyline so splitting never cuts across a bend.
export function splitLine(points: Coordinate[], count = 4): Coordinate[][] {
  if (points.length < 2) return []
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]))
  const total = cumulative.at(-1)!
  const at = (target: number): Coordinate => {
    const i = cumulative.findIndex(v => v >= target)
    if (i <= 0) return points[0]
    const t = (target - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1] || 1)
    return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t]
  }
  return Array.from({ length: count }, (_, i) => {
    const start = total * i / count, end = total * (i + 1) / count
    return [at(start), ...points.filter((_, j) => cumulative[j] > start && cumulative[j] < end), at(end)]
  })
}

export function buildDemoRoutes(campus: Campus): Route[] {
  return campus.paths.map(path => {
    const gentle = path.id === 'gentle'
    const entrance = (id: 'library' | 'boya', coordinate: Coordinate): Entrance => ({
      id: `demo-${id}`, placeId: id, name: `${placeNames[id]}示範入口`, coordinate,
      status: 'demo', verifiedAt: null, source: '示範入口位置，尚待團隊實地確認', photos: [],
    })
    const slopes = gentle ? [1.5, 2.5, 3, 2] : [2.2, 6, 3.3, 2.4]
    const widths = gentle ? [2.2, 1.8, 2, 1.8] : [1.8, 1.2, 1.5, 1.6]
    const names = gentle ? ['總圖周邊通道', '校園連接步道', '博雅周邊緩行段', '博雅入口銜接段'] : ['總圖周邊通道', '校園捷徑坡道', '建物側邊通道', '博雅入口銜接段']
    return {
      id: path.id, name: gentle ? '較平緩的動線' : '距離較短的動線',
      description: gentle ? '多走一點，換取較小的示範坡度。' : '路程較短，請留意局部坡度與路寬。', kind: 'demo',
      originEntrance: entrance('library', path.coordinates[0]), destinationEntrance: entrance('boya', path.coordinates.at(-1)!),
      segments: splitLine(path.coordinates).map((coordinates, i) => ({
        id: `${path.id}-${i + 1}`, name: names[i], coordinates, status: 'demo',
        maxSlopePercent: slopes[i], minWidthM: widths[i], stepHeightCm: 0, hasStairs: false,
        surface: i % 2 ? '平整鋪面磚' : '平整瀝青', rampLengthM: i === 1 ? (gentle ? 24 : 18) : 0,
        closed: false, obstacles: i === 1 ? [gentle ? '留意行人共用通道（示範）' : '轉角有效路寬較窄（示範）'] : [],
        photos: i === 0 ? path.photos ?? [] : [], source: '路況數值為課程示範，路徑幾何參考 OpenStreetMap',
        sourceUrl: 'https://www.openstreetmap.org/copyright', retrievedAt: campus.retrievedAt, verifiedAt: null,
      })),
    }
  })
}

export function metrics(route: Route): RouteMetrics {
  const complete = (key: 'maxSlopePercent' | 'minWidthM' | 'stepHeightCm') => route.segments.length > 0 && route.segments.every(s => typeof s[key] === 'number' && Number.isFinite(s[key]) && s[key]! >= 0)
  return {
    distanceM: route.segments.reduce((n, s) => n + lineDistance(s.coordinates), 0),
    maxSlopePercent: complete('maxSlopePercent') ? Math.max(...route.segments.map(s => s.maxSlopePercent!)) : null,
    minWidthM: complete('minWidthM') ? Math.min(...route.segments.map(s => s.minWidthM!)) : null,
    maxStepCm: complete('stepHeightCm') ? Math.max(...route.segments.map(s => s.stepHeightCm!)) : null,
    surfaces: [...new Set(route.segments.map(s => s.surface ?? '尚無資料'))].sort(),
  }
}

export interface Bottleneck { kind: 'slope' | 'width'; value: number; segmentIds: string[] }
export function bottlenecks(route: Route): Bottleneck[] {
  const m = metrics(route)
  const result: Bottleneck[] = []
  if (m.maxSlopePercent !== null) result.push({ kind: 'slope', value: m.maxSlopePercent, segmentIds: route.segments.filter(s => s.maxSlopePercent === m.maxSlopePercent).map(s => s.id) })
  if (m.minWidthM !== null && m.minWidthM > 0) result.push({ kind: 'width', value: m.minWidthM, segmentIds: route.segments.filter(s => s.minWidthM === m.minWidthM).map(s => s.id) })
  return result
}
export function lineMidpoint(points: Coordinate[]): Coordinate {
  const half = lineDistance(points) / 2
  let traversed = 0
  for (let i = 1; i < points.length; i++) {
    const length = distance(points[i - 1], points[i])
    if (traversed + length >= half && length > 0) {
      const t = (half - traversed) / length
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t]
    }
    traversed += length
  }
  return points[0]
}
export function comparisonDifference(a: Route, b: Route) {
  const am = metrics(a), bm = metrics(b)
  return {
    distanceM: Math.round(bm.distanceM) - Math.round(am.distanceM),
    slopePoints: am.maxSlopePercent === null || bm.maxSlopePercent === null ? null : Number((bm.maxSlopePercent - am.maxSlopePercent).toFixed(2)),
    widthM: am.minWidthM === null || bm.minWidthM === null ? null : Number((bm.minWidthM - am.minWidthM).toFixed(2)),
  }
}

function validLine(points: Coordinate[]): boolean { return points.length >= 2 && points.every(p => p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90) && lineDistance(points) > 0 }
export function validSurveyDate(value: string | null): boolean {
  if (!value || !Number.isFinite(Date.parse(value))) return false
  const day = value.slice(0, 10)
  const date = new Date(`${day}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day && day <= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
}
function hasEvidence(item: Entrance | Segment): boolean {
  return item.status === 'verified' && validSurveyDate(item.verifiedAt) && item.source.trim().length >= 3 && !['待團隊實勘', '待實勘'].includes(item.source.trim()) && item.photos.length > 0 && item.photos.every(p => !!p.src.trim() && !!p.alt.trim() && !!p.caption.trim())
}
function verifiedEntrance(entrance: Entrance): boolean { return hasEvidence(entrance) && entrance.coordinate.length === 2 && entrance.coordinate.every(Number.isFinite) && Math.abs(entrance.coordinate[0]) <= 180 && Math.abs(entrance.coordinate[1]) <= 90 }
export function isEligible(route: Route, mode: Mode): boolean {
  if (!route.segments.length || !route.segments.every(s => validLine(s.coordinates) && !s.closed && s.hasStairs === false && s.status !== 'blocked')) return false
  // Unknown data and demo flags never promote a route into the surveyed collection.
  if (mode === 'demo') return route.kind === 'demo' && route.originEntrance.status === 'demo' && route.destinationEntrance.status === 'demo' && route.segments.every(s => s.status === 'demo')
  if (route.kind !== 'survey' || !verifiedEntrance(route.originEntrance) || !verifiedEntrance(route.destinationEntrance)) return false
  const m = metrics(route)
  if (m.maxSlopePercent === null || m.minWidthM === null || m.minWidthM <= 0 || m.maxStepCm === null) return false
  if (!route.segments.every(s => hasEvidence(s) && !!s.surface?.trim() && s.closed === false && s.rampLengthM !== null && Number.isFinite(s.rampLengthM) && s.rampLengthM >= 0)) return false
  const points = routeCoordinates(route)
  if (distance(points[0], route.originEntrance.coordinate) > 2 || distance(points.at(-1)!, route.destinationEntrance.coordinate) > 2) return false
  return route.segments.slice(1).every((s, i) => distance(route.segments[i].coordinates.at(-1)!, s.coordinates[0]) <= 1)
}
export function candidateRoutes(routes: Route[], mode: Mode, preference: Preference): Route[] {
  return routes.filter(r => isEligible(r, mode)).sort((a, b) => {
    const am = metrics(a), bm = metrics(b)
    if (preference === 'gentle') {
      const difference = (am.maxSlopePercent ?? Infinity) - (bm.maxSlopePercent ?? Infinity)
      if (difference) return difference
    }
    return am.distanceM - bm.distanceM || a.id.localeCompare(b.id)
  })
}
export function reverseRoute(route: Route): Route {
  return { ...route, originEntrance: route.destinationEntrance, destinationEntrance: route.originEntrance,
    segments: [...route.segments].reverse().map(s => ({ ...s, coordinates: [...s.coordinates].reverse() })) }
}
export function formatDistance(m: number): string { return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m` }
export function formatDate(value: string | null): string {
  if (!value) return '尚未查核'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '日期待確認' : date.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
}
export function toHash(state: NavigationState): string { return `#${new URLSearchParams({ screen: state.screen, mode: state.mode, from: state.origin, chair: state.wheelchair, prefer: state.preference, route: state.routeId, segment: state.segmentId })}` }
export function fromHash(hash: string): NavigationState {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const screen = p.get('screen')
  return { screen: ['setup', 'compare', 'detail', 'confirm', 'editor'].includes(screen ?? '') ? screen as NavigationState['screen'] : 'setup',
    mode: p.get('mode') === 'survey' ? 'survey' : 'demo', origin: p.get('from') === 'boya' ? 'boya' : 'library',
    wheelchair: p.get('chair') === 'electric' ? 'electric' : 'manual', preference: p.get('prefer') === 'short' ? 'short' : 'gentle',
    routeId: p.get('route') ?? 'gentle', segmentId: p.get('segment') ?? '' }
}

export function isCampus(value: unknown): value is Campus {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<Campus>
  return data.version === 1 && Array.isArray(data.places) && ['library', 'boya'].every(id => data.places!.some(p => p.id === id && p.coordinate?.length === 2 && p.coordinate.every(Number.isFinite))) && Array.isArray(data.paths) && data.paths.every(p => typeof p.id === 'string' && validLine(p.coordinates)) && Array.isArray(data.sources) && Array.isArray(data.facilities)
}
export function routeSurface(route: Route): string { return metrics(route).surfaces.join('、') }
export function segmentLabel(segment: Segment): string { return segment.status === 'demo' ? '示範路況' : segment.status === 'verified' ? '已查核' : segment.status === 'blocked' ? '暫停通行' : '待查核' }
