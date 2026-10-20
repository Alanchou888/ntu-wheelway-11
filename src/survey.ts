import type { Campus, Entrance, Photo, Route, Segment, SurveyData } from './types'
import { buildDemoRoutes, distance, isEligible, lineDistance, placeNames, validSurveyDate } from './routes'

export const MAX_IMPORT_BYTES = 20_000_000
export const MAX_PHOTO_BYTES = 2_000_000
export const MAX_MEASUREMENT = 100_000
export function measurementInput(text: string, positive = false): number | null {
  if (!text.trim()) return null
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > MAX_MEASUREMENT || (positive && value === 0)) throw new Error(positive ? '請填寫大於 0 且不超過 100000 的數值' : '請填寫 0 至 100000 的數值')
  return value
}
export function obstacleInput(text: string): string[] {
  const lines = text ? text.split('\n') : []
  if (lines.length > 30 || lines.some(line => line.length > 500)) throw new Error('最多 30 項障礙，每項上限 500 字。請縮短後再填寫，原有內容已保留。')
  return lines
}
export type SurveyItem = Entrance | Segment
export const isSegment = (item: SurveyItem): item is Segment => 'coordinates' in item
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })

// Only the public road geometry is reused. Every simulated condition and piece of
// evidence is explicitly discarded before a team starts its own field record.
export function createSurveyDrafts(campus: Campus): SurveyData {
  return { version: 1, routes: buildDemoRoutes(campus).map((route, index) => ({
    ...route, id: `survey-${route.id}`, name: `實勘動線 ${index + 1}`, description: '公開道路幾何供參考，入口與通行條件待實勘', kind: 'survey',
    originEntrance: blankEntrance(route.originEntrance, route.id), destinationEntrance: blankEntrance(route.destinationEntrance, route.id),
    segments: route.segments.map((s, i) => ({
      ...s, id: `survey-${s.id}`, name: `路段 ${i + 1}`, status: 'unverified', maxSlopePercent: null, minWidthM: null,
      stepHeightCm: null, hasStairs: null, surface: null, rampLengthM: null, closed: null,
      obstacles: [], photos: [], source: '', sourceUrl: undefined, verifiedAt: null,
    })),
  })) }
}
function blankEntrance(entrance: Entrance, routeId: string): Entrance {
  return { ...entrance, id: `survey-${routeId}-${entrance.placeId}`, name: `${placeNames[entrance.placeId]}入口（待確認）`, status: 'unverified', source: '', photos: [], verifiedAt: null }
}

export function verificationIssues(item: SurveyItem): string[] {
  const issues: string[] = []
  if (!item.name.trim()) issues.push('名稱')
  if (!validSurveyDate(item.verifiedAt)) issues.push('有效的實勘日期')
  if (item.source.trim().length < 3 || ['待團隊實勘', '待實勘'].includes(item.source.trim())) issues.push('實勘者與量測方式')
  if (!item.photos.length || item.photos.some(p => !p.alt.trim() || !p.caption.trim())) issues.push('照片與照片說明')
  if (isSegment(item)) {
    for (const [key, label] of [['maxSlopePercent', '最大坡度'], ['minWidthM', '有效路寬'], ['stepHeightCm', '最大階差'], ['rampLengthM', '坡道長度']] as const) {
      const n = item[key]
      if (n === null || !Number.isFinite(n) || n < 0 || n > MAX_MEASUREMENT || (key === 'minWidthM' && n <= 0)) issues.push(label)
    }
    if (!item.surface?.trim()) issues.push('路面條件')
    if (item.hasStairs === null) issues.push('階梯狀況')
    if (item.closed === null) issues.push('封閉狀況')
  }
  return issues
}

export function routeGeometryIssues(route: Route): string[] {
  const issues: string[] = []
  const first = route.segments[0], last = route.segments.at(-1)
  if (!first || !last || route.segments.some(s => lineDistance(s.coordinates) <= 0)) return ['路段幾何不完整']
  if (distance(first.coordinates[0], route.originEntrance.coordinate) > 2) issues.push('起點入口距路段端點超過 2 m')
  if (distance(last.coordinates.at(-1)!, route.destinationEntrance.coordinate) > 2) issues.push('終點入口距路段端點超過 2 m')
  if (route.segments.slice(1).some((s, i) => distance(route.segments[i].coordinates.at(-1)!, s.coordinates[0]) > 1)) issues.push('相鄰路段未連續銜接')
  return issues
}
export function surveyProgress(route: Route) {
  const items = [route.originEntrance, ...route.segments, route.destinationEntrance]
  return { verified: items.filter(i => i.status === 'verified' && verificationIssues(i).length === 0).length, total: items.length, eligible: isEligible(route, 'survey') }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} 必須是物件`)
  return value as Record<string, unknown>
}
function string(value: unknown, path: string, limit = 1000): asserts value is string {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`${path} 文字格式或長度不正確`)
}
function list(value: unknown, path: string, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${path} 清單格式或筆數不正確`)
}
function coordinate(value: unknown, path: string) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(v => typeof v === 'number' && Number.isFinite(v)) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error(`${path} 須為有效的 [經度, 緯度]`)
}
function nullableNumber(value: unknown, path: string) {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_MEASUREMENT)) throw new Error(`${path} 須為 0 至 ${MAX_MEASUREMENT} 的數值或 null`)
}
function date(value: unknown, path: string) {
  if (value !== null && (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value)))) throw new Error(`${path} 日期格式不正確`)
}
export function safePhotoSrc(src: string): boolean {
  return /^\/(?!\/)/.test(src) || /^https:\/\//i.test(src) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)
}
function photos(value: unknown, path: string) {
  list(value, path, 4)
  value.forEach((entry, i) => {
    const p = object(entry, `${path}[${i}]`)
    string(p.src, '照片網址', 2_800_000)
    if (!safePhotoSrc(p.src)) throw new Error('照片僅接受 HTTPS、本站路徑或 JPEG / PNG / WebP 資料')
    string(p.alt, '照片替代文字', 500)
    string(p.caption, '照片說明', 500)
    if (p.sourceUrl !== undefined) { string(p.sourceUrl, '照片來源'); if (!/^https:\/\//i.test(p.sourceUrl)) throw new Error('照片來源須使用 HTTPS') }
  })
}
function itemBase(value: unknown, path: string) {
  const item = object(value, path)
  string(item.id, `${path}.id`, 120)
  if (!item.id.trim()) throw new Error(`${path} 缺少識別碼`)
  string(item.name, `${path}.name`, 200)
  string(item.source, `${path}.source`, 1000)
  if (!['unverified', 'verified', 'blocked'].includes(String(item.status))) throw new Error(`${path} 僅接受實勘狀態，示範資料不可匯入`)
  date(item.verifiedAt, `${path}.verifiedAt`)
  photos(item.photos, `${path}.photos`)
  return item
}

// Validate the full shape before either import or public rendering. A successful
// parse does not confer verification or eligibility on any route.
export function parseSurveyData(value: unknown): SurveyData {
  const data = object(value, '資料')
  if (data.version !== 1) throw new Error('僅支援 version 1 的實勘 JSON')
  list(data.routes, 'routes', 20)
  const routeIds = new Set<string>()
  data.routes.forEach((entry, i) => {
    const path = `路線 ${i + 1}`, r = object(entry, path)
    string(r.id, `${path}.id`, 120)
    if (!r.id.trim() || routeIds.has(r.id)) throw new Error('路線識別碼空白或重複')
    routeIds.add(r.id)
    string(r.name, `${path}.name`, 200)
    string(r.description, `${path}.description`, 1000)
    if (r.kind !== 'survey') throw new Error('僅接受 kind 為 survey 的實勘資料，示範資料不可直接轉入')
    const a = itemBase(r.originEntrance, '起點入口'), b = itemBase(r.destinationEntrance, '終點入口')
    if (a.id === b.id) throw new Error('同一路線的入口識別碼不可重複')
    for (const e of [a, b]) {
      if (!['library', 'boya'].includes(String(e.placeId))) throw new Error('入口須屬於總圖或博雅')
      coordinate(e.coordinate, '入口座標')
    }
    if (a.placeId === b.placeId) throw new Error('起終點須分屬總圖與博雅')
    list(r.segments, `${path}.segments`, 100)
    if (!r.segments.length) throw new Error('每條路線至少需要一個路段')
    const ids = new Set<string>([a.id as string, b.id as string, 'origin', 'destination'])
    r.segments.forEach((entry, j) => {
      const s = itemBase(entry, `${path} 路段 ${j + 1}`)
      if (ids.has(s.id as string)) throw new Error('同一路線的路段識別碼重複')
      ids.add(s.id as string)
      list(s.coordinates, '路段座標', 5000)
      if (s.coordinates.length < 2) throw new Error('路段至少需要兩個座標')
      s.coordinates.forEach(c => coordinate(c, '路段座標'))
      for (const key of ['maxSlopePercent', 'minWidthM', 'stepHeightCm', 'rampLengthM']) nullableNumber(s[key], key)
      for (const key of ['closed', 'hasStairs']) if (s[key] !== null && typeof s[key] !== 'boolean') throw new Error(`${key} 須為 true、false 或 null`)
      if (s.surface !== null) string(s.surface, '路面條件', 500)
      list(s.obstacles, '障礙清單', 30)
      s.obstacles.forEach(v => string(v, '障礙描述', 500))
      date(s.retrievedAt, '圖資取得日期')
      if (s.sourceUrl !== undefined) { string(s.sourceUrl, '來源網址'); if (s.sourceUrl && !/^https:\/\//i.test(s.sourceUrl)) throw new Error('來源網址須使用 HTTPS') }
    })
  })
  // Browser storage metadata is deliberately kept out of team JSON exports.
  return { version: 1, routes: structuredClone(data.routes) as Route[] }
}

const csvCell = (v: unknown) => {
  let text = v === null || v === undefined ? '' : String(v)
  // Prevent formula evaluation when a teammate opens an exported CSV in Excel.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function surveyCsv(data: SurveyData): string {
  const rows: unknown[][] = [['route_id', 'route_name', 'type', 'id', 'name', 'status', 'slope_percent', 'width_m', 'step_cm', 'ramp_m', 'stairs', 'closed', 'surface', 'obstacles', 'source', 'verified_at', 'photo_count', 'geometry_wgs84']]
  data.routes.forEach(route => [route.originEntrance, ...route.segments, route.destinationEntrance].forEach(item => {
    const s = isSegment(item) ? item : null
    rows.push([route.id, route.name, s ? 'segment' : 'entrance', item.id, item.name, item.status, s?.maxSlopePercent, s?.minWidthM, s?.stepHeightCm, s?.rampLengthM, s?.hasStairs, s?.closed, s?.surface, s?.obstacles.join(' / '), item.source, item.verifiedAt, item.photos.length, JSON.stringify(s ? s.coordinates : (item as Entrance).coordinate)])
  }))
  return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
}

export function downloadFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface StoredSurvey { data: SurveyData | null; revision: number | null; savedAt: string | null }
export class SurveyConflictError extends Error {
  constructor(public readonly latest: StoredSurvey) { super('另一個分頁已儲存較新草稿。此頁內容已保留，請先下載目前版本，再載入較新草稿。'); this.name = 'SurveyConflictError' }
}
export class SurveyReadError extends Error {
  constructor(message: string, public readonly raw: unknown, public readonly revision: number | null) { super(message); this.name = 'SurveyReadError' }
}
function storedRevision(raw: unknown): number | null {
  if (raw === undefined) return null
  const metadata = raw && typeof raw === 'object' ? (raw as { _storage?: { revision?: unknown } })._storage : undefined
  if (metadata === undefined) return 0 // Existing v1 drafts are upgraded on the first intentional save.
  if (!metadata || !Number.isSafeInteger(metadata.revision) || (metadata.revision as number) < 1) throw new Error('本機草稿版本資訊損壞，請先下載備份')
  return metadata.revision as number
}
function storedSurvey(raw: unknown): StoredSurvey {
  let revision: number | null = null
  try {
    revision = storedRevision(raw)
    if (raw === undefined) return { data: null, revision, savedAt: null }
    const savedAt = (raw as { _storage?: { savedAt?: unknown } })?._storage?.savedAt
    return { data: parseSurveyData(raw), revision, savedAt: typeof savedAt === 'string' ? savedAt : null }
  } catch (e) { throw new SurveyReadError(e instanceof Error ? e.message : '無法讀取草稿', raw, revision) }
}
export async function readLocalSurvey(): Promise<SurveyData | null> { return (await readLocalSurveyRecord()).data }
export function readLocalSurveyRecord(): Promise<StoredSurvey> { return database('read') }
export async function writeLocalSurvey(data: SurveyData, expectedRevision: number | null): Promise<StoredSurvey> {
  const parsed = parseSurveyData(data)
  if (new Blob([JSON.stringify(parsed)]).size > MAX_IMPORT_BYTES) return Promise.reject(new Error('完整草稿超過 20 MB，請縮小照片後再儲存'))
  return database('write', parsed, expectedRevision)
}
function database(action: 'read' | 'write', data?: SurveyData, expectedRevision?: number | null): Promise<StoredSurvey> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wheelway-field-survey', 1)
    let settled = false
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts') }
    request.onerror = () => reject(new Error('無法開啟本機儲存空間'))
    request.onblocked = () => { settled = true; reject(new Error('本機資料庫被其他分頁占用，請關閉其他編輯分頁後重試')) }
    request.onsuccess = () => {
      const db = request.result
      if (settled) { db.close(); return }
      db.onversionchange = () => db.close()
      let tx: IDBTransaction
      try { tx = db.transaction('drafts', action === 'read' ? 'readonly' : 'readwrite') }
      catch { db.close(); reject(new Error('本機資料庫格式不符，請先保留備份並檢查網站儲存空間')); return }
      const store = tx.objectStore('drafts'), op = store.get('current-v1')
      let result: StoredSurvey = { data: null, revision: null, savedAt: null }
      let failure: unknown = null
      op.onsuccess = () => {
        try {
          if (action === 'read') result = storedSurvey(op.result)
          else {
            const actualRevision = storedRevision(op.result)
            if (actualRevision !== expectedRevision) throw new SurveyConflictError(storedSurvey(op.result))
            const revision = (actualRevision ?? 0) + 1, savedAt = new Date().toISOString()
            // Read, compare and put share one transaction, preventing a stale tab
            // from overwriting a newer draft between the comparison and the put.
            store.put({ ...data, _storage: { revision, savedAt } }, 'current-v1')
            result = { data: data!, revision, savedAt }
          }
        } catch (e) { failure = e; tx.abort() }
      }
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onerror = () => { db.close(); reject(failure ?? new Error('本機儲存失敗，請匯出 JSON 備份')) }
      tx.onabort = () => { db.close(); reject(failure ?? new Error('本機儲存未完成，請匯出 JSON 備份')) }
    }
  })
}

export function photoFromFile(file: File): Promise<Photo> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return Promise.reject(new Error('請選擇 JPEG、PNG 或 WebP 照片'))
  if (file.size > MAX_PHOTO_BYTES) return Promise.reject(new Error('每張照片上限 2 MB，請先縮小檔案'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('照片讀取失敗，請重新選擇'))
    reader.onload = () => resolve({ src: String(reader.result), alt: '', caption: '' })
    reader.readAsDataURL(file)
  })
}
