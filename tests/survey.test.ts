import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Campus, Route, SurveyData } from '../src/types'
import { bottlenecks, buildDemoRoutes, comparisonDifference, fromHash, isEligible, lineDistance, lineMidpoint, metrics, reverseRoute } from '../src/routes'
import { createSurveyDrafts, measurementInput, obstacleInput, parseSurveyData, routeGeometryIssues, safePhotoSrc, surveyCsv, surveyProgress, verificationIssues } from '../src/survey'

const campus = JSON.parse(readFileSync(new URL('../public/data/campus.json', import.meta.url), 'utf8')) as Campus
const demos = buildDemoRoutes(campus)
const surveyed = (): Route => {
  const route = createSurveyDrafts(campus).routes[0]
  for (const item of [route.originEntrance, ...route.segments, route.destinationEntrance]) Object.assign(item, { source: 'Test evidence only', verifiedAt: '2026-10-18', status: 'verified', photos: [{ src: '/test.jpg', alt: 'Test fixture', caption: 'Test fixture' }] })
  route.segments.forEach(s => Object.assign(s, { maxSlopePercent: 2, minWidthM: 1.5, stepHeightCm: 0, rampLengthM: 0, closed: false, hasStairs: false, surface: 'Test surface' }))
  return route
}
describe('field drafts and verification', () => {
  it('accepts unfinished blank measurements while rejecting values that would break saved drafts', () => {
    expect(measurementInput('')).toBeNull()
    expect(measurementInput('0')).toBe(0)
    expect(measurementInput('0.001', true)).toBe(0.001)
    expect(measurementInput('100000')).toBe(100000)
    for (const value of ['-1', '100001', 'Infinity', 'NaN', '1e']) expect(() => measurementInput(value)).toThrow()
    expect(() => measurementInput('0', true)).toThrow()
    expect(obstacleInput('')).toEqual([])
    expect(obstacleInput('已量測的障礙\n第二項')).toHaveLength(2)
    expect(() => obstacleInput('x'.repeat(501))).toThrow(/500/)
    expect(() => obstacleInput(Array(31).fill('item').join('\n'))).toThrow(/30/)
  })
  it('reuses only road geometry and discards every simulated measurement and photo', () => {
    const draft = createSurveyDrafts(campus)
    expect(draft.routes).toHaveLength(2)
    for (const route of draft.routes) {
      expect(isEligible(route, 'survey')).toBe(false)
      expect(routeGeometryIssues(route)).toEqual([])
      for (const item of [route.originEntrance, ...route.segments, route.destinationEntrance]) {
        expect(item.status).toBe('unverified')
        expect(item.verifiedAt).toBeNull()
        expect(item.photos).toEqual([])
        expect(item.source).toBe('')
      }
      for (const s of route.segments) for (const key of ['maxSlopePercent', 'minWidthM', 'stepHeightCm', 'rampLengthM', 'hasStairs', 'closed', 'surface']) expect(s[key as keyof typeof s]).toBeNull()
    }
    expect(demos[0].segments[0].status).toBe('demo')
  })
  it('requires evidence and explicit verification independently of field completeness', () => {
    const route = surveyed()
    expect(verificationIssues(route.segments[0])).toEqual([])
    expect(surveyProgress(route)).toEqual({ verified: 6, total: 6, eligible: true })
    route.segments[0].status = 'unverified'
    expect(surveyProgress(route).verified).toBe(5)
    expect(isEligible(route, 'survey')).toBe(false)
  })
  it('excludes future dates, placeholder sources, and empty photo descriptions', () => {
    for (const patch of [{ verifiedAt: '2999-01-01' }, { verifiedAt: '2026-02-30' }, { source: '待團隊實勘' }, { photos: [{ src: '/x.jpg', alt: '', caption: '' }] }]) {
      const route = surveyed()
      Object.assign(route.originEntrance, patch)
      expect(verificationIssues(route.originEntrance).length).toBeGreaterThan(0)
      expect(isEligible(route, 'survey')).toBe(false)
    }
  })
  it('keeps checked records with stairs or closures out of candidates', () => {
    for (const patch of [{ hasStairs: true }, { closed: true }]) {
      const route = surveyed()
      Object.assign(route.segments[0], patch)
      expect(verificationIssues(route.segments[0])).toEqual([])
      expect(isEligible(route, 'survey')).toBe(false)
    }
  })
  it('detects shifted entrances and disconnected adjacent segments', () => {
    const route = surveyed()
    route.originEntrance.coordinate = [121.53, 25.018]
    expect(routeGeometryIssues(route)).toContain('起點入口距路段端點超過 2 m')
    route.segments[1].coordinates[0] = [121.53, 25.018]
    expect(routeGeometryIssues(route)).toContain('相鄰路段未連續銜接')
  })
})
describe('survey import and export', () => {
  it('round trips incomplete drafts and complete evidence without promoting status', () => {
    const draft = createSurveyDrafts(campus)
    expect(parseSurveyData(JSON.parse(JSON.stringify(draft)))).toEqual(draft)
    expect(parseSurveyData({ version: 1, routes: [surveyed()] }).routes[0].kind).toBe('survey')
    expect(parseSurveyData({ version: 1, routes: [] }).routes).toEqual([])
  })
  it('rejects demos, malformed nested records, duplicate IDs and out-of-range geometry', () => {
    expect(() => parseSurveyData({ version: 1, routes: demos })).toThrow(/示範/)
    for (const mutate of [
      (d: SurveyData) => { d.routes[0].segments[0].coordinates[0] = [999, 25] },
      (d: SurveyData) => { d.routes[0].segments[0].closed = 'false' as unknown as boolean },
      (d: SurveyData) => { d.routes[0].segments[0].minWidthM = -1 },
      (d: SurveyData) => { d.routes[0].segments[0].photos = null as unknown as [] },
      (d: SurveyData) => { d.routes[1].id = d.routes[0].id },
      (d: SurveyData) => { d.routes[0].segments[0].id = 'origin' },
      (d: SurveyData) => { d.routes[0].destinationEntrance.id = d.routes[0].originEntrance.id },
    ]) {
      const draft = createSurveyDrafts(campus)
      mutate(draft)
      expect(() => parseSurveyData(draft)).toThrow()
    }
  })
  it('accepts raster evidence and blocks script or SVG image sources', () => {
    expect(safePhotoSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(safePhotoSrc('/photos/entrance.jpg')).toBe(true)
    for (const src of ['javascript:alert(1)', '//evil.example/x', 'data:image/svg+xml;base64,AAA']) {
      expect(safePhotoSrc(src)).toBe(false)
      const draft = createSurveyDrafts(campus)
      draft.routes[0].originEntrance.photos = [{ src, alt: 'x', caption: 'x' }]
      expect(() => parseSurveyData(draft)).toThrow(/照片/)
    }
  })
  it('exports BOM CSV with quoted evidence and neutralized spreadsheet formulas', () => {
    const draft = createSurveyDrafts(campus)
    draft.routes[0].name = '=1+1'
    draft.routes[0].originEntrance.source = 'Line one\n"quoted"'
    const csv = surveyCsv(draft)
    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(csv).toContain('"\'=1+1"')
    expect(csv).toContain('Line one\n""quoted""')
    expect(csv).toContain('geometry_wgs84')
  })
})
describe('route differences and bottleneck interpretation', () => {
  it('calculates signed differences in displayed distance, percentage points, and metres', () => {
    const a = demos.find(r => r.id === 'direct')!, b = demos.find(r => r.id === 'gentle')!
    const delta = comparisonDifference(a, b)
    expect(delta.distanceM).toBe(Math.round(metrics(b).distanceM) - Math.round(metrics(a).distanceM))
    expect(delta.slopePoints).toBe(-3)
    expect(delta.widthM).toBe(0.6)
    expect(comparisonDifference(b, a).widthM).toBe(-0.6)
  })
  it('retains tied bottleneck segments and route IDs after reversal', () => {
    const gentle = demos.find(r => r.id === 'gentle')!
    expect(bottlenecks(gentle).find(b => b.kind === 'width')?.segmentIds).toEqual(['gentle-2', 'gentle-4'])
    expect(bottlenecks(gentle).find(b => b.kind === 'slope')?.segmentIds).toEqual(['gentle-3'])
    expect(bottlenecks(reverseRoute(gentle)).find(b => b.kind === 'width')?.segmentIds.sort()).toEqual(['gentle-2', 'gentle-4'])
  })
  it('withholds extrema and differences if any corresponding measurement is unknown', () => {
    const route = surveyed()
    route.segments[0].maxSlopePercent = null
    route.segments[0].minWidthM = null
    expect(bottlenecks(route)).toEqual([])
    expect(comparisonDifference(route, demos[0]).widthM).toBeNull()
    expect(comparisonDifference(route, demos[0]).slopePoints).toBeNull()
  })
  it('positions representative markers on the line and supports an editor deep link', () => {
    const p = demos[0].segments[0].coordinates
    const midpoint = lineMidpoint(p)
    expect(midpoint.every(Number.isFinite)).toBe(true)
    expect(lineDistance([p[0], midpoint])).toBeLessThanOrEqual(lineDistance(p) / 2 + 0.01)
    expect(fromHash('#screen=editor').screen).toBe('editor')
  })
})
