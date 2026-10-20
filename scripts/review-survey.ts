import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isEligible, validSurveyDate } from '../src/routes'
import { MAX_IMPORT_BYTES, MAX_PHOTO_BYTES, parseSurveyData, routeGeometryIssues, safePhotoSrc, verificationIssues } from '../src/survey'
import type { Entrance, Route, Segment, SurveyData } from '../src/types'

export interface ReviewIssue { code: string; path: string; message: string }
export interface ItemReview {
  id: string; name: string; type: 'entrance' | 'segment'; path: string
  verifiedAt: string | null; issues: ReviewIssue[]
}
export interface RouteReview {
  id: string; name: string; path: string; eligible: boolean; accepted: boolean
  oldestVerifiedAt: string | null; missingDateCount: number
  items: ItemReview[]; issues: ReviewIssue[]; warnings: ReviewIssue[]
}
export interface SurveyReview {
  version: 1; generatedAt: string; input: string | null; valid: boolean
  routeCount: number; publishableCount: number; recheckAfterDays: number
  oldestVerifiedAt: string | null; issues: ReviewIssue[]; warnings: ReviewIssue[]
  routes: RouteReview[]
  publication: { status: 'not-requested' | 'blocked' | 'unchanged' | 'published'; backupPath?: string }
}
interface ReviewOptions { now?: Date; recheckDays?: number }
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const issue = (code: string, path: string, text: string): ReviewIssue => ({ code, path, message: text })
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
const label = (v: unknown, fallback: string) => typeof v === 'string' ? v : fallback
const oldest = (values: (string | null)[]) => values.filter((v): v is string => !!v).sort()[0] ?? null
const evidenceMarker = /QA[ _-]?FIXTURE|TEST[ _-]?FIXTURE|test evidence only|automated test evidence|程式測試證據|測試用證據|(?:^|[/.])(?:test|fixture|qa)[-_.](?:photo|pixel|image)|(?:example\.(?:com|org|net)|\.invalid)(?:[/:]|$)/i
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  const object = record(value)
  return object ? Object.fromEntries(Object.keys(object).sort().map(key => [key, canonical(object[key])])) : value
}

// These are rejection markers, not proof that unmarked evidence is authentic.
// A named team reviewer must still inspect the original measurements and photos.
function evidenceIssues(value: unknown, path: string): ReviewIssue[] {
  if (typeof value === 'string') return evidenceMarker.test(value) ? [issue('TEST_EVIDENCE', path, '含程式測試或保留的範例證據，請替換為實際實勘來源與照片')] : []
  if (Array.isArray(value)) return value.flatMap((v, i) => evidenceIssues(v, `${path}[${i}]`))
  const object = record(value)
  return object ? Object.entries(object).flatMap(([key, v]) => evidenceIssues(v, `${path}.${key}`)) : []
}

function rawRouteIssues(raw: unknown, path: string): ReviewIssue[] {
  const route = record(raw)
  if (!route) return []
  const result = evidenceIssues(raw, path)
  const seen = new Map<string, string>()
  const items: [unknown, string][] = [[route.originEntrance, `${path}.originEntrance`], [route.destinationEntrance, `${path}.destinationEntrance`]]
  if (Array.isArray(route.segments)) items.push(...route.segments.map((s, i): [unknown, string] => [s, `${path}.segments[${i}]`]))
  for (const [rawItem, itemPath] of items) {
    const item = record(rawItem)
    if (!item) continue
    if (typeof item.id === 'string') {
      const previous = seen.get(item.id)
      if (previous || ['origin', 'destination'].includes(item.id)) result.push(issue('DUPLICATE_ID', `${itemPath}.id`, `識別碼 ${item.id} 重複或保留${previous ? `，已出現於 ${previous}` : ''}`))
      seen.set(item.id, itemPath)
    }
    if (!validSurveyDate(typeof item.verifiedAt === 'string' ? item.verifiedAt : null)) result.push(issue('INVALID_DATE', `${itemPath}.verifiedAt`, item.verifiedAt === null ? '實勘日期未知，取得圖資的日期不能代替查核日期' : '實勘日期無效或在未來，請填實際完成查核的 YYYY-MM-DD 日期'))
    if (Array.isArray(item.photos)) item.photos.forEach((rawPhoto, i) => {
      const photo = record(rawPhoto), p = `${itemPath}.photos[${i}]`
      if (photo && (typeof photo.src !== 'string' || !photo.src.trim() || !safePhotoSrc(photo.src))) result.push(issue('PHOTO_SOURCE', `${p}.src`, '照片須使用 HTTPS、本站路徑或 JPEG / PNG / WebP 內嵌資料，且不能空白'))
      if (photo && (!String(photo.alt ?? '').trim() || !String(photo.caption ?? '').trim())) result.push(issue('PHOTO_DESCRIPTION', p, '照片需要替代文字及說明'))
    })
  }
  return result
}

export function reviewSurvey(value: unknown, options: ReviewOptions = {}): SurveyReview {
  const now = options.now ?? new Date(), days = options.recheckDays ?? 30
  if (!Number.isInteger(days) || days <= 0) throw new Error('複查提醒天數須為正整數')
  const result: SurveyReview = {
    version: 1, generatedAt: now.toISOString(), input: null, valid: false,
    routeCount: 0, publishableCount: 0, recheckAfterDays: days, oldestVerifiedAt: null,
    issues: [], warnings: [], routes: [], publication: { status: 'not-requested' },
  }
  try { parseSurveyData(value) } catch (error) { result.issues.push(issue('SCHEMA', '$', message(error))) }
  const data = record(value), routes = data && Array.isArray(data.routes) ? data.routes : []
  result.routeCount = routes.length
  if (!routes.length) result.issues.push(issue('NO_ROUTES', '$.routes', '沒有路線可檢查，為避免清空公開資料，此工具不發布空集合'))
  const routeIds = new Map<string, string>()
  const sharedIds = new Map<string, { signature: string; path: string; routeIndex: number }>()
  routes.forEach((raw, i) => {
    const path = `$.routes[${i}]`, source = record(raw)
    const reviewed: RouteReview = { id: label(source?.id, `路線 ${i + 1}`), name: label(source?.name, ''), path, eligible: false, accepted: false, oldestVerifiedAt: null, missingDateCount: 0, items: [], issues: rawRouteIssues(raw, path), warnings: [] }
    result.routes.push(reviewed)
    if (routeIds.has(reviewed.id)) reviewed.issues.push(issue('DUPLICATE_ROUTE_ID', `${path}.id`, `路線識別碼重複，已出現於 ${routeIds.get(reviewed.id)}`))
    routeIds.set(reviewed.id, path)
    let route: Route
    try { route = parseSurveyData({ version: 1, routes: [raw] }).routes[0] } catch (error) {
      reviewed.issues.push(issue('SCHEMA', path, message(error)))
      if (source) {
        const rawItems = [source.originEntrance, ...(Array.isArray(source.segments) ? source.segments : []), source.destinationEntrance]
        reviewed.missingDateCount = rawItems.filter(item => !validSurveyDate(typeof record(item)?.verifiedAt === 'string' ? record(item)!.verifiedAt as string : null)).length
        reviewed.oldestVerifiedAt = oldest(rawItems.map(item => { const date = record(item)?.verifiedAt; return typeof date === 'string' && validSurveyDate(date) ? date.slice(0, 10) : null }))
      }
      return
    }
    reviewed.eligible = isEligible(route, 'survey')
    for (const text of routeGeometryIssues(route)) reviewed.issues.push(issue('GEOMETRY', path, text))
    const items: [Entrance | Segment, string, ItemReview['type']][] = [
      [route.originEntrance, `${path}.originEntrance`, 'entrance'],
      ...route.segments.map((s, j): [Segment, string, 'segment'] => [s, `${path}.segments[${j}]`, 'segment']),
      [route.destinationEntrance, `${path}.destinationEntrance`, 'entrance'],
    ]
    for (const [item, itemPath, type] of items) {
      const entry: ItemReview = { id: item.id, name: item.name, type, path: itemPath, verifiedAt: validSurveyDate(item.verifiedAt) ? item.verifiedAt!.slice(0, 10) : null, issues: [] }
      reviewed.items.push(entry)
      for (const missing of verificationIssues(item)) entry.issues.push(issue('MISSING_EVIDENCE', itemPath, `缺少或需修正：${missing}`))
      if (item.status !== 'verified') entry.issues.push(issue('UNVERIFIED', `${itemPath}.status`, `狀態為 ${item.status}，需由團隊完成查核`))
      if (type === 'segment') {
        const segment = item as Segment
        if (segment.closed === true) entry.issues.push(issue('CLOSED', `${itemPath}.closed`, '路段封閉，禁止發布為候選路線'))
        if (segment.hasStairs === true) entry.issues.push(issue('STAIRS', `${itemPath}.hasStairs`, '路段包含階梯，禁止發布為無階梯候選路線'))
      }
      const signature = JSON.stringify(canonical([type, item])), existing = sharedIds.get(item.id)
      if (existing && existing.routeIndex !== i && existing.signature !== signature) entry.issues.push(issue('CONFLICTING_ID', `${itemPath}.id`, `跨路線共用識別碼 ${item.id} 的類型或內容不同，請統一或另建識別碼，先前位置 ${existing.path}`))
      if (!existing) sharedIds.set(item.id, { signature, path: itemPath, routeIndex: i })
      if (!entry.verifiedAt) reviewed.missingDateCount++
    }
    reviewed.oldestVerifiedAt = oldest(reviewed.items.map(item => item.verifiedAt))
    if (reviewed.oldestVerifiedAt) {
      const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
      const ageDays = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${reviewed.oldestVerifiedAt}T00:00:00Z`)) / 86_400_000)
      if (ageDays > days) reviewed.warnings.push(issue('RECHECK_SUGGESTED', path, `最舊查核 ${reviewed.oldestVerifiedAt} 已經過 ${ageDays} 天，團隊設定超過 ${days} 天建議複查。此提醒不影響資格，亦非通行或法律標準`))
    }
    if (!reviewed.eligible && !reviewed.issues.length && reviewed.items.every(item => !item.issues.length)) reviewed.issues.push(issue('INELIGIBLE', path, '未通過目前候選路線的完整性與通行條件檢查'))
    reviewed.accepted = reviewed.eligible && !reviewed.issues.length && reviewed.items.every(item => !item.issues.length)
  })
  return finalize(result)
}

function finalize(report: SurveyReview): SurveyReview {
  report.routes.forEach(route => { route.accepted = route.eligible && !route.issues.length && route.items.every(item => !item.issues.length) })
  report.publishableCount = report.routes.filter(route => route.accepted).length
  report.oldestVerifiedAt = oldest(report.routes.map(route => route.oldestVerifiedAt))
  report.valid = !report.issues.length && report.routeCount > 0 && report.publishableCount === report.routeCount
  return report
}

function rasterType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}
function contained(parent: string, child: string) { const rel = relative(parent, child); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)) }

async function checkPhotoFiles(data: SurveyData, report: SurveyReview, publicDir: string) {
  for (const [i, route] of data.routes.entries()) {
    const reviewed = report.routes[i]
    for (const [j, item] of [route.originEntrance, ...route.segments, route.destinationEntrance].entries()) {
      const entry = reviewed.items[j]
      for (const [k, photo] of item.photos.entries()) {
        const path = `${entry.path}.photos[${k}].src`
        if (/^https:\/\//i.test(photo.src)) {
          reviewed.warnings.push(issue('REMOTE_PHOTO_UNCHECKED', path, 'HTTPS 照片未連線檢查，發布前請人工確認可公開讀取、內容及使用授權'))
          continue
        }
        try {
          let bytes: Buffer, expected: string | undefined
          if (photo.src.startsWith('data:')) {
            const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(photo.src)
            if (!match) throw new Error('照片資料格式不支援')
            bytes = Buffer.from(match[2], 'base64'); expected = match[1]
          } else {
            const clean = decodeURIComponent(photo.src.split(/[?#]/)[0])
            if (!clean.startsWith('/') || clean.startsWith('//') || clean.includes('\\') || clean.includes('\0')) throw new Error('照片須為本站 public 內的路徑')
            const file = resolve(publicDir, `.${clean}`), actualPublic = await realpath(publicDir)
            if (!contained(publicDir, file) || !contained(actualPublic, await realpath(file))) throw new Error('照片路徑超出 public 目錄')
            const info = await stat(file)
            if (!info.isFile()) throw new Error('照片路徑不是檔案')
            if (info.size > MAX_PHOTO_BYTES) throw new Error('照片超過 2 MB 上限')
            bytes = await readFile(file)
            const extension = extname(file).toLowerCase()
            expected = extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : extension.slice(1)
          }
          if (bytes.length > MAX_PHOTO_BYTES) throw new Error('照片超過 2 MB 上限')
          const type = rasterType(bytes)
          if (!type || type !== expected) throw new Error('照片檔頭與 JPEG、PNG 或 WebP 格式不符，請檢查損壞或錯誤副檔名')
        } catch (error) { entry.issues.push(issue('PHOTO_FILE', path, `照片無法驗證：${message(error)}`)) }
      }
    }
  }
  finalize(report)
}

export function readableSummary(report: SurveyReview): string {
  const lines = [`實勘發布檢查：${report.valid ? '通過' : '未通過'}`, `路線 ${report.routeCount} 條，合格 ${report.publishableCount} 條`, `最舊查核日期：${report.oldestVerifiedAt ?? '未知'}`]
  for (const item of [...report.issues, ...report.warnings]) lines.push(`  [${item.code}] ${item.path} ${item.message}`)
  for (const route of report.routes) {
    lines.push(`\n${route.accepted ? '通過' : '未通過'} ${route.name || route.id} (${route.id})`, `  最舊查核：${route.oldestVerifiedAt ?? '未知'}，日期未知 ${route.missingDateCount} 筆`)
    for (const item of [...route.issues, ...route.items.flatMap(item => item.issues), ...route.warnings]) lines.push(`  [${item.code}] ${item.path} ${item.message}`)
  }
  lines.push(`\n本地發布：${report.publication.status}${report.publication.backupPath ? `，備份 ${report.publication.backupPath}` : ''}`, '檢查不會取代人工實勘與證據審核。此工具不會部署網站。')
  return lines.join('\n')
}

export interface FileReviewOptions extends ReviewOptions { inputPath: string; reportPath: string; projectRoot: string; publish?: boolean }
async function atomicWrite(path: string, bytes: string) {
  const temporary = resolve(dirname(path), `.${randomUUID()}.tmp`)
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, path) } finally { await rm(temporary, { force: true }) }
}
async function regularFileOrMissing(path: string) {
  try { const s = await lstat(path); if (!s.isFile() || s.isSymbolicLink()) throw new Error(`拒絕覆寫非一般檔案：${path}`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

export async function reviewSurveyFile(options: FileReviewOptions): Promise<SurveyReview> {
  const root = resolve(options.projectRoot), inputPath = resolve(options.inputPath), reportPath = resolve(options.reportPath)
  const publicDir = resolve(root, 'public'), target = resolve(publicDir, 'data/surveyed-routes.json')
  if (inputPath === reportPath || contained(publicDir, reportPath) || extname(reportPath).toLowerCase() !== '.json') throw new Error('報告須另存 .json，不能覆寫輸入檔或 public 內的公開資料')
  await mkdir(dirname(reportPath), { recursive: true })
  await regularFileOrMissing(reportPath)
  const reportParent = await realpath(dirname(reportPath)), actualPublic = await realpath(publicDir)
  if (contained(actualPublic, reportParent)) throw new Error('報告目錄指向 public，拒絕覆寫公開資料')
  const actualReport = await realpath(reportPath).catch(() => resolve(reportParent, reportPath.slice(dirname(reportPath).length + 1)))
  const actualInput = await realpath(inputPath).catch(() => inputPath)
  if (actualInput.toLowerCase() === actualReport.toLowerCase()) throw new Error('報告不能覆寫輸入檔')
  let data: unknown, report: SurveyReview
  try {
    if ((await stat(inputPath)).size > MAX_IMPORT_BYTES) throw new Error('輸入超過 20 MB 上限')
    data = JSON.parse((await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, ''))
    report = reviewSurvey(data, options)
  } catch (error) {
    report = reviewSurvey(null, options)
    report.issues = [issue('INPUT', inputPath, `無法讀取實勘 JSON：${message(error)}`)]
  }
  report.input = inputPath
  // File checks only run after the complete schema passes. Invalid drafts still
  // receive per-route field diagnostics from reviewSurvey above.
  try { const parsed = parseSurveyData(data); await checkPhotoFiles(parsed, report, publicDir) } catch { /* Schema errors are already in the report. */ }
  if (options.publish) {
    report.publication.status = 'blocked'
    if (report.valid) {
      await regularFileOrMissing(target)
      if (!contained(await realpath(root), await realpath(dirname(target)))) throw new Error('公開資料目錄超出專案範圍')
      const canonical = `${JSON.stringify(parseSurveyData(data), null, 2)}\n`
      const previous = await readFile(target, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error })
      let same = previous === canonical
      if (!same && previous !== null) { try { same = JSON.stringify(JSON.parse(previous)) === JSON.stringify(JSON.parse(canonical)) } catch { /* Preserve malformed old data in the backup. */ } }
      if (same) report.publication.status = 'unchanged'
      else {
        if (previous !== null) {
          const backupDir = resolve(root, 'output/survey-backups')
          await mkdir(backupDir, { recursive: true })
          if (!contained(await realpath(root), await realpath(backupDir))) throw new Error('備份目錄超出專案範圍')
          const stamp = (options.now ?? new Date()).toISOString().replaceAll(':', '-').replaceAll('.', '-')
          const hash = createHash('sha256').update(previous).digest('hex').slice(0, 12)
          const backup = resolve(backupDir, `surveyed-routes-${stamp}-${hash}.json`)
          await writeFile(backup, previous, { flag: 'wx' })
          report.publication.backupPath = backup
        }
        await atomicWrite(target, canonical)
        report.publication.status = 'published'
      }
    }
  }
  await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  return report
}

async function main(args: string[]) {
  if (args.includes('--help')) { console.log('tsx scripts/review-survey.ts --input <實勘.json> [--report output/survey-review.json] [--publish] [--recheck-days 30]\n預設只檢查。--publish 僅備份並更新本地 public/data/surveyed-routes.json，不部署網站。'); return }
  let input = '', output = 'output/survey-review.json', publish = false, recheckDays = 30
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--publish') publish = true
    else if (['--input', '--report', '--recheck-days'].includes(arg)) {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少值`)
      if (arg === '--input') input = value
      if (arg === '--report') output = value
      if (arg === '--recheck-days') recheckDays = Number(value)
    } else throw new Error(`未知參數 ${arg}`)
  }
  if (!input) throw new Error('請用 --input 指定團隊匯出的實勘 JSON')
  const report = await reviewSurveyFile({ inputPath: resolve(input), reportPath: resolve(output), projectRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..'), publish, recheckDays })
  console.log(readableSummary(report))
  console.log(`報告：${resolve(output)}`)
  if (!report.valid) process.exitCode = 1
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(`實勘檢查失敗：${message(error)}`); process.exitCode = 2 })
