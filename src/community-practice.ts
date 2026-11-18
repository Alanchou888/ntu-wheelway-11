import type { CommunityReport, CommunitySegment, Reaction, ReportInput } from './community-model'

export const practiceWidthReportId = 'practice-example-1'

function practiceReport(id: string, input: ReportInput, now: number, own: boolean): CommunityReport {
  return { ...input, id: `practice-${id}`, own, createdAt: new Date(now).toISOString(), photoUrl: null,
    counts: { exists: 0, resolved: 0, different: 0 }, myReaction: null,
    lastExistsAt: null, lastResolvedAt: null, lastDifferentAt: null, updates: [] }
}

export function sampleCommunityReports(segments: CommunitySegment[], now: number): CommunityReport[] {
  const examples: { section: string; minutesAgo: number; report: Omit<ReportInput, 'segmentId' | 'authorName' | 'observedAt'> }[] = [
    { section: 'walk-out-4', minutesAgo: 40, report: {
      category: 'parking', impact: 'difficult', message: '廣場轉角停了幾輛腳踏車，轉彎時剩下的空間不多。',
      measurements: { widthCm: 82, stepCm: null, slopePercent: null, surface: null },
    } },
    { section: 'walk-back-3', minutesAgo: 180, report: {
      category: 'rough', impact: 'difficult', message: '人行道有幾塊地磚翹起來，小輪經過時會晃動。',
      measurements: { widthCm: null, stepCm: 2.5, slopePercent: null, surface: '地磚' },
    } },
    { section: 'walk-back-2', minutesAgo: 310, report: {
      category: 'traffic', impact: 'difficult', message: '下課時這個路口有不少單車經過，過街需要多等一下。',
    } },
  ]
  return examples.flatMap(({ section, minutesAgo, report }, index) => {
    const segment = segments.find(item => item.id === section)
    if (!segment) return []
    const time = now - minutesAgo * 60_000
    return practiceReport(`example-${index + 1}`, { ...report, segmentId: section,
      coordinate: segment.approximate ? null : segment.coordinate, authorName: '示範投稿', observedAt: new Date(time).toISOString() }, time, false)
  })
}

export function addPracticeReport(input: ReportInput, now = Date.now()) {
  return practiceReport(crypto.randomUUID(), { ...input, authorName: '你的示範投稿' }, now, true)
}

export function recordPracticeReaction(report: CommunityReport, reaction: Reaction, note: string, now = Date.now()): CommunityReport {
  if (report.own) return report
  const at = new Date(now).toISOString()
  // A visitor has one confirmation per practice example.
  return { ...report, myReaction: reaction,
    counts: { exists: Number(reaction === 'exists'), resolved: Number(reaction === 'resolved'), different: Number(reaction === 'different') },
    lastExistsAt: reaction === 'exists' ? at : null,
    lastResolvedAt: reaction === 'resolved' ? at : null,
    lastDifferentAt: reaction === 'different' ? at : null,
    updates: [{ reaction, note, at, name: '你的示範確認' }] }
}
