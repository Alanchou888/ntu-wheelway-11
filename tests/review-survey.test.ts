import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { readableSummary, reviewSurvey, reviewSurveyFile } from '../scripts/review-survey'
import type { Route, SurveyData } from '../src/types'

// All records below exist only in memory or disposable OS temp directories.
// They are software fixtures and never become public field-survey evidence.
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='
const now = new Date('2026-10-20T00:00:00Z')
function specimen(): SurveyData {
  const evidence = { status: 'verified' as const, source: '量測者與量測方式欄位', verifiedAt: '2026-10-18', photos: [{ src: pixel, alt: '入口視角欄位', caption: '照片說明欄位' }] }
  const route: Route = {
    id: 'r1', name: '路線名稱欄位', kind: 'survey', description: '路線描述欄位',
    originEntrance: { ...structuredClone(evidence), id: 'e1', name: '入口一', placeId: 'library', coordinate: [121.54, 25.018] },
    destinationEntrance: { ...structuredClone(evidence), id: 'e2', name: '入口二', placeId: 'boya', coordinate: [121.539, 25.018] },
    segments: [{ ...structuredClone(evidence), id: 's1', name: '路段一', coordinates: [[121.54, 25.018], [121.539, 25.018]], maxSlopePercent: 2, minWidthM: 1.5, stepHeightCm: 0, hasStairs: false, closed: false, rampLengthM: 0, surface: '路面欄位', obstacles: [], retrievedAt: null }],
  }
  return { version: 1, routes: [route] }
}
const temporary: string[] = []
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'wheelway-review-'))
  temporary.push(root)
  await mkdir(join(root, 'public/data'), { recursive: true })
  const original = '{"version":1,"routes":[]}\n'
  const target = join(root, 'public/data/surveyed-routes.json'), input = join(root, 'input.json'), report = join(root, 'output/review.json')
  await writeFile(target, original)
  return { root, original, target, input, report }
}
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('survey publication review', () => {
  it('reports all incomplete entrance and segment evidence without promoting a draft', () => {
    const data = specimen(), route = data.routes[0]
    route.originEntrance.verifiedAt = null
    route.originEntrance.photos = []
    Object.assign(route.segments[0], { status: 'unverified', minWidthM: null, surface: null, closed: null, hasStairs: null, source: '' })
    const result = reviewSurvey(data, { now })
    expect(result.valid).toBe(false)
    expect(result.routes[0].missingDateCount).toBe(1)
    expect(result.routes[0].items.flatMap(i => i.issues).map(i => i.message).join(' ')).toMatch(/照片.*有效路寬.*路面條件.*階梯狀況.*封閉狀況/)
    expect(readableSummary(result)).toContain('日期未知 1 筆')
  })
  it('checks closures, stairs and disconnected entrances independently', () => {
    const data = specimen()
    Object.assign(data.routes[0].segments[0], { closed: true, hasStairs: true })
    data.routes[0].originEntrance.coordinate = [121.53, 25.018]
    const result = reviewSurvey(data, { now })
    expect(result.valid).toBe(false)
    expect(result.routes[0].issues.some(i => i.code === 'GEOMETRY')).toBe(true)
    expect(result.routes[0].items.flatMap(i => i.issues).map(i => i.code)).toEqual(expect.arrayContaining(['CLOSED', 'STAIRS']))
  })
  it('clearly rejects duplicate IDs, future dates and photo-description errors', () => {
    const data = specimen(), route = data.routes[0]
    route.segments[0].id = route.originEntrance.id
    route.destinationEntrance.verifiedAt = '2999-01-01'
    route.originEntrance.photos[0].alt = ''
    const result = reviewSurvey(data, { now })
    expect(result.valid).toBe(false)
    expect(result.routes[0].issues.map(i => i.code)).toEqual(expect.arrayContaining(['DUPLICATE_ID', 'INVALID_DATE', 'PHOTO_DESCRIPTION', 'SCHEMA']))
  })
  it('retains diagnostics for every route even when one fails schema parsing', () => {
    const data = specimen()
    const bad = structuredClone(data.routes[0]); bad.id = 'r2'; bad.segments[0].photos[0].src = 'javascript:alert(1)'
    data.routes.unshift(bad)
    const result = reviewSurvey(data, { now })
    expect(result.routes).toHaveLength(2)
    expect(result.routes[0].issues.some(i => i.message.includes('照片'))).toBe(true)
    expect(result.routes[1].accepted).toBe(true)
    expect(result.valid).toBe(false)
  })
  it('rejects explicit demo or automated-test evidence and an empty collection', () => {
    const data = specimen()
    data.routes[0].originEntrance.source = 'QA_FIXTURE automated test evidence'
    expect(reviewSurvey(data, { now }).routes[0].issues.some(i => i.code === 'TEST_EVIDENCE')).toBe(true)
    data.routes[0].kind = 'demo'
    expect(reviewSurvey(data, { now }).valid).toBe(false)
    expect(reviewSurvey({ version: 1, routes: [] }, { now }).issues.some(i => i.code === 'NO_ROUTES')).toBe(true)
  })
  it('warns about old checks without rejecting them and supports a team-set reminder interval', () => {
    const data = specimen()
    data.routes[0].originEntrance.verifiedAt = '2026-09-01'
    const result = reviewSurvey(data, { now })
    expect(result.valid).toBe(true)
    expect(result.oldestVerifiedAt).toBe('2026-09-01')
    expect(result.routes[0].warnings.some(i => i.code === 'RECHECK_SUGGESTED')).toBe(true)
    expect(reviewSurvey(data, { now, recheckDays: 60 }).routes[0].warnings).toEqual([])
  })
  it('permits identical shared entrance records but rejects conflicting cross-route identities', () => {
    const data = specimen()
    const second = structuredClone(data.routes[0]); second.id = 'r2'
    data.routes.push(second)
    expect(reviewSurvey(data, { now }).valid).toBe(true)
    data.routes[1].originEntrance.name = '同識別碼的另一筆內容'
    expect(reviewSurvey(data, { now }).routes[1].items[0].issues.some(i => i.code === 'CONFLICTING_ID')).toBe(true)
  })
  it('permits the same segment ID with identical evidence regardless of JSON object-key order', () => {
    const data = specimen(), second = structuredClone(data.routes[0])
    second.id = 'r2'
    second.segments[0] = Object.fromEntries(Object.entries(second.segments[0]).reverse()) as typeof second.segments[0]
    second.segments[0].photos[0] = Object.fromEntries(Object.entries(second.segments[0].photos[0]).reverse()) as typeof second.segments[0]['photos'][0]
    data.routes.push(second)
    const report = reviewSurvey(data, { now })
    expect(report.valid).toBe(true)
    expect(report.publishableCount).toBe(2)
    expect(report.routes[1].items.find(i => i.type === 'segment')?.id).toBe('s1')
  })
  it('rejects shared segment IDs when evidence, geometry or measured attributes differ', () => {
    for (const patch of [
      { source: '另一位量測者與量測方式' },
      { coordinates: [[121.54, 25.018], [121.5395, 25.0181], [121.539, 25.018]] },
      { minWidthM: 2 },
    ]) {
      const data = specimen(), second = structuredClone(data.routes[0])
      second.id = 'r2'
      Object.assign(second.segments[0], patch)
      data.routes.push(second)
      const report = reviewSurvey(data, { now })
      expect(report.valid).toBe(false)
      expect(report.routes[1].eligible).toBe(true)
      expect(report.routes[1].items.find(i => i.type === 'segment')?.issues.some(i => i.code === 'CONFLICTING_ID')).toBe(true)
    }
  })
  it('rejects an entrance sharing an ID with a segment in another otherwise valid route', () => {
    const data = specimen(), second = structuredClone(data.routes[0])
    second.id = 'r2'
    second.originEntrance.id = 's1'
    second.segments[0].id = 's2'
    data.routes.push(second)
    const report = reviewSurvey(data, { now })
    expect(report.routes[1].eligible).toBe(true)
    expect(report.valid).toBe(false)
    expect(report.routes[1].items[0].issues.some(i => i.code === 'CONFLICTING_ID' && i.message.includes('類型'))).toBe(true)
  })
  it('defaults to check-only and produces a machine-readable report without changing public data', async () => {
    const w = await workspace()
    await writeFile(w.input, JSON.stringify(specimen()))
    const result = await reviewSurveyFile({ projectRoot: w.root, inputPath: w.input, reportPath: w.report, now })
    expect(result.valid).toBe(true)
    expect(result.publication.status).toBe('not-requested')
    expect(await readFile(w.target, 'utf8')).toBe(w.original)
    expect(JSON.parse(await readFile(w.report, 'utf8')).publishableCount).toBe(1)
    expect(await readdir(join(w.root, 'output'))).toEqual(['review.json'])
  })
  it('backs up the exact previous bytes and performs idempotent local publication', async () => {
    const w = await workspace()
    await writeFile(w.input, JSON.stringify(specimen()))
    const options = { projectRoot: w.root, inputPath: w.input, reportPath: w.report, publish: true, now }
    const first = await reviewSurveyFile(options)
    expect(first.publication.status).toBe('published')
    expect(await readFile(first.publication.backupPath!, 'utf8')).toBe(w.original)
    const published = await readFile(w.target, 'utf8')
    expect(JSON.parse(published).routes).toHaveLength(1)
    const second = await reviewSurveyFile(options)
    expect(second.publication.status).toBe('unchanged')
    expect(await readFile(w.target, 'utf8')).toBe(published)
    expect(await readdir(join(w.root, 'output/survey-backups'))).toHaveLength(1)
  })
  it('blocks missing, corrupt and escaped photo paths before backing up or publishing', async () => {
    const w = await workspace()
    for (const src of ['/photos/missing.jpg', 'data:image/png;base64,YWJj', '/%2e%2e/input.json']) {
      const data = specimen(); data.routes[0].segments[0].photos[0].src = src
      await writeFile(w.input, JSON.stringify(data))
      const report = await reviewSurveyFile({ projectRoot: w.root, inputPath: w.input, reportPath: w.report, publish: true, now })
      expect(report.valid).toBe(false)
      expect(report.publication.status).toBe('blocked')
      expect(report.routes[0].items.flatMap(i => i.issues).some(i => i.code === 'PHOTO_FILE')).toBe(true)
      expect(await readFile(w.target, 'utf8')).toBe(w.original)
    }
    expect(await readdir(join(w.root, 'output'))).toEqual(['review.json'])
  })
  it('reports remote photos as unchecked and does not fetch them', async () => {
    const w = await workspace(), data = specimen()
    data.routes[0].originEntrance.photos[0].src = 'https://photos.school.edu.tw/entrance.jpg'
    await writeFile(w.input, JSON.stringify(data))
    const report = await reviewSurveyFile({ projectRoot: w.root, inputPath: w.input, reportPath: w.report, now })
    expect(report.valid).toBe(true)
    expect(report.routes[0].warnings.some(i => i.code === 'REMOTE_PHOTO_UNCHECKED')).toBe(true)
  })
  it('protects public data from a mistaken report path and writes invalid-input diagnostics', async () => {
    const w = await workspace()
    await writeFile(w.input, '{broken')
    await expect(reviewSurveyFile({ projectRoot: w.root, inputPath: w.input, reportPath: w.target, now })).rejects.toThrow(/不能覆寫/)
    const report = await reviewSurveyFile({ projectRoot: w.root, inputPath: w.input, reportPath: w.report, publish: true, now })
    expect(report.valid).toBe(false)
    expect(report.issues[0].code).toBe('INPUT')
    expect(await readFile(w.target, 'utf8')).toBe(w.original)
  })
  it('runs the actual CLI with nonzero exit status for an incomplete input', async () => {
    const w = await workspace(), data = specimen()
    data.routes[0].originEntrance.verifiedAt = null
    await writeFile(w.input, JSON.stringify(data))
    const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/review-survey.ts'), '--input', w.input, '--report', w.report], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('未通過')
    expect(JSON.parse(await readFile(w.report, 'utf8')).valid).toBe(false)
  })
})
