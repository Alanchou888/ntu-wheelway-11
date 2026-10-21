import type { Coordinate } from './types'

export const categories = {
  parking: '違停佔用', rough: '路面顛簸', construction: '施工封路', water: '積水',
  traffic: '車流較大', lighting: '照明不足', other: '其他路況',
} as const
export const impacts = { passable: '仍可通行', difficult: '通行困難', blocked: '無法通行' } as const
export const reactions = { exists: '仍然存在', resolved: '已排除', different: '現場不同' } as const
export type ReportCategory = keyof typeof categories
export type ReportImpact = keyof typeof impacts
export type Reaction = keyof typeof reactions
export interface CommunityReport {
  id: string; segmentId: string; category: ReportCategory; impact: ReportImpact
  message: string; authorName: string; observedAt: string; createdAt: string
  photoUrl: string | null; own: boolean
  counts: Record<Reaction, number>; lastExistsAt: string | null; lastResolvedAt: string | null; lastDifferentAt: string | null
  myReaction: Reaction | null; updates: { reaction: Reaction; note: string; name: string; at: string }[]
}
export interface CommunitySession { signedIn: boolean; available: boolean }
export interface ReportInput {
  segmentId: string; category: ReportCategory; impact: ReportImpact; message: string; authorName: string; observedAt: string
}
export interface CommunitySegment { id: string; name: string; routeName: string; coordinate: Coordinate }
const hours: Record<ReportCategory, number> = { parking: 6, rough: 24 * 30, construction: 72, water: 12, traffic: 3, lighting: 24 * 7, other: 24 }

export function reportState(report: CommunityReport, now = Date.now()): { label: string; kind: 'active' | 'stale' | 'resolved' | 'disputed' } {
  const observed = Date.parse(report.observedAt)
  const exists = report.lastExistsAt ? Date.parse(report.lastExistsAt) : 0
  const last = Math.max(observed, exists)
  const resolved = report.lastResolvedAt ? Date.parse(report.lastResolvedAt) : 0
  const different = report.lastDifferentAt ? Date.parse(report.lastDifferentAt) : 0
  if (different >= last && different > 0) return { label: '現場有不同回報', kind: 'disputed' }
  if (resolved >= last && resolved > 0) return { label: '有人回報已排除', kind: 'resolved' }
  if (!Number.isFinite(last) || now - last > hours[report.category] * 3_600_000) return { label: '待重新確認', kind: 'stale' }
  return { label: '近期回報', kind: 'active' }
}

export function validateReport(input: unknown, segmentIds: ReadonlySet<string>, now = Date.now()): ReportInput {
  if (!input || typeof input !== 'object') throw new Error('請填寫路況內容。')
  const value = input as Record<string, unknown>
  const text = (key: string, min: number, max: number) => {
    const s = typeof value[key] === 'string' ? value[key].trim() : ''
    if (s.length < min || s.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) throw new Error(`請檢查${key === 'message' ? '路況說明，需為 5 至 500 字' : '暱稱，最多 24 字'}。`)
    return s
  }
  const segmentId = String(value.segmentId ?? '')
  if (!segmentIds.has(segmentId)) throw new Error('請選擇目前地圖中的路段。')
  if (!Object.hasOwn(categories, String(value.category))) throw new Error('請選擇問題類型。')
  if (!Object.hasOwn(impacts, String(value.impact))) throw new Error('請選擇通行影響。')
  const timestamp = typeof value.observedAt === 'string' ? Date.parse(value.observedAt) : NaN
  if (!Number.isFinite(timestamp) || timestamp > now + 120_000 || now - timestamp > 30 * 86_400_000) throw new Error('發現時間需在最近 30 天內，且不能晚於目前時間。')
  return { segmentId, category: value.category as ReportCategory, impact: value.impact as ReportImpact, message: text('message', 5, 500), authorName: text('authorName', 0, 24) || '校園使用者', observedAt: new Date(timestamp).toISOString() }
}

export function communitySummary(reports: CommunityReport[], ids: ReadonlySet<string>, now = Date.now()) {
  const selected = reports.filter(r => ids.has(r.segmentId))
  return { total: selected.length, recent: selected.filter(r => reportState(r, now).kind === 'active').length,
    blocked: selected.filter(r => r.impact === 'blocked' && reportState(r, now).kind === 'active').length }
}

export function relativeTime(value: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60_000))
  if (!Number.isFinite(minutes)) return '時間不詳'
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`
  return `${Math.floor(minutes / 1440)} 天前`
}
