import type { Entrance, Route, Segment } from './types'
import { fieldObservation } from './field-observations'
import { walkedSections } from './walked-geometry'

const fieldIds = {
  out: [
    ['field-library-ramp'],
    ['field-curb-incline', 'field-road-incline'],
    [],
    ['field-boya-ramp'],
    ['field-boya-indoor-ramp', 'field-boya-restroom'],
  ],
  back: [
    ['field-boya-west-ramp', 'field-covered-walkway', 'field-tile-incline'],
    ['field-redline-incline'],
    ['field-bricks', 'field-bicycles'],
  ],
}

export function buildWalkedRoutes(): Route[] {
  return (['out', 'back'] as const).map(direction => {
    const outbound = direction === 'out'
    const id = `walk-${direction}`
    const segments: Segment[] = walkedSections[direction].map((section, index) => {
      const fieldPointIds = fieldIds[direction][index]
      return {
        ...section, id: `${id}-${index + 1}`, status: 'unverified',
        maxSlopePercent: null, minWidthM: null, stepHeightCm: null, rampLengthM: null,
        hasStairs: null, closed: null, surface: null,
        photos: fieldPointIds.length ? fieldObservation(fieldPointIds[0])?.photos ?? [] : [],
        obstacles: [], fieldPointIds,
        source: section.approximate
          ? '依第 11 組試走紀錄連接博雅東、西側，館內線為約略示意，樓層與轉折待核對。'
          : '第 11 組 2026/11/10 試走，依口述地標與 OpenStreetMap 步道重繪。',
        sourceUrl: section.approximate ? undefined : 'https://www.openstreetmap.org/copyright',
        retrievedAt: '2026-11-10', verifiedAt: null,
      }
    })
    const endpoint = (library: boolean, coordinate: Entrance['coordinate']): Entrance => ({
      id: library ? 'walk-library-plaza' : 'walk-boya-west',
      placeId: library ? 'library' : 'boya',
      name: library ? '總圖前廣場' : '博雅教學館西側',
      coordinate, status: 'unverified', verifiedAt: null,
      source: '第 11 組試走的起終點，圖上位置依地標與拍攝資料估定。',
      photos: library ? [] : fieldObservation('field-boya-west-ramp')?.photos ?? [],
    })
    return {
      id, kind: 'demo', walked: true, name: outbound ? '去程｜總圖到博雅西側' : '回程｜博雅西側到總圖',
      description: outbound
        ? '經保健中心、小椰林道、土木系館前與小福廣場，穿過博雅至西側。'
        : '經普通教學館、蒲葵道、水杉道與第一學生活動中心旁。',
      originEntrance: endpoint(outbound, segments[0].coordinates[0]),
      destinationEntrance: endpoint(!outbound, segments.at(-1)!.coordinates.at(-1)!),
      segments,
    }
  })
}
