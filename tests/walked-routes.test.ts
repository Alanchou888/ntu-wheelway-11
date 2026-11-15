import { describe, expect, it } from 'vitest'
import { buildWalkedRoutes, walkedDistanceLabel } from '../src/walked-routes'
import { fieldObservation, formatFieldAngle } from '../src/field-observations'
import { groupFieldMarkers } from '../src/field-marker-groups'
import { formatDistance, isEligible, lineDistance, metrics } from '../src/routes'
import type { Coordinate } from '../src/types'

describe('field walk records', () => {
  it('joins the outbound and return at Boya west and at the library plaza', () => {
    const [out, back] = buildWalkedRoutes()
    expect(out.originEntrance.name).toBe('總圖前廣場')
    expect(out.destinationEntrance.name).toBe('博雅教學館西側')
    expect(back.originEntrance.coordinate).toEqual(out.destinationEntrance.coordinate)
    expect(back.destinationEntrance.coordinate).toEqual(out.originEntrance.coordinate)
    for (const route of [out, back]) {
      route.segments.slice(1).forEach((segment, index) => {
        expect(segment.coordinates[0]).toEqual(route.segments[index].coordinates.at(-1))
      })
    }
  })

  it('keeps unknown accessibility measurements out of checked routes', () => {
    for (const route of buildWalkedRoutes()) {
      expect(isEligible(route, 'demo')).toBe(true)
      expect(isEligible(route, 'survey')).toBe(false)
      expect(metrics(route)).toMatchObject({ maxSlopePercent: null, minWidthM: null, maxStepCm: null })
      for (const segment of route.segments) {
        expect(segment).toMatchObject({
          maxSlopePercent: null, minWidthM: null, stepHeightCm: null, hasStairs: null, surface: null, closed: null,
        })
      }
    }
    expect(buildWalkedRoutes()[0].segments.at(-1)).toMatchObject({
      name: '博雅館內至西側出口', approximate: true,
    })
  })

  it('keeps the unmeasured indoor distance out of the public estimate', () => {
    const [out, back] = buildWalkedRoutes()
    const outdoors = out.segments.filter(segment => !segment.approximate).reduce((sum, s) => sum + lineDistance(s.coordinates), 0)
    expect(walkedDistanceLabel(out)).toBe(`圖上估算約 ${formatDistance(outdoors)}（室外）`)
    expect(walkedDistanceLabel(back)).toBe(`圖上估算約 ${formatDistance(metrics(back).distanceM)}`)
  })

  it('links all field records to nearby segments while keeping spot values out of route metrics', () => {
    const ids = buildWalkedRoutes().flatMap(route => route.segments.flatMap(segment => segment.fieldPointIds ?? []))
    expect(new Set(ids).size).toBe(12)
    expect(ids.every(id => !!fieldObservation(id))).toBe(true)
    expect(fieldObservation('field-boya-indoor-ramp')?.width?.cm).toBe(89)
    expect(fieldObservation('field-boya-restroom')?.width?.cm).toBe(78)
    expect(fieldObservation('field-boya-ramp')?.width?.cm).toBe(98)
    expect(fieldObservation('field-boya-indoor-ramp')?.level).toBe('一樓')
    expect(fieldObservation('field-boya-restroom')?.level).toBe('一樓')
  })

  it('keeps original instruments and provenance for independently read angles', () => {
    expect(fieldObservation('field-library-ramp')?.angles).toEqual([
      { instrument: 'GeoClino', degrees: -5, source: expect.stringContaining('IMG_0964 左側手機') },
      { instrument: '手機水平儀', degrees: -6, source: expect.stringContaining('IMG_0964 右側手機') },
      { instrument: '手機水平儀', degrees: -7, source: expect.stringContaining('IMG_0961、IMG_0963') },
    ])
    const angles = [
      ['field-road-incline', 1, 'IMG_9230、IMG_9231'],
      ['field-curb-incline', -15, 'IMG_0972'],
      ['field-boya-indoor-ramp', -4, 'IMG_9238'],
      ['field-tile-incline', -4, 'IMG_9243'],
      ['field-redline-incline', -2, 'IMG_9244'],
    ] as const
    for (const [id, degrees, source] of angles) {
      expect(fieldObservation(id)?.angles?.[0]).toMatchObject({ instrument: 'GeoClino', degrees, source: expect.stringContaining(source) })
    }
    expect(formatFieldAngle(-15)).toBe('−15°')
    expect(formatFieldAngle(0)).toBe('0°')
    expect(formatFieldAngle(null)).toBe('待確認')
  })

  it('clusters overlapping targets and separates them when zoomed in', () => {
    const places = [
      { id: 'east', coordinate: [0, 0] as Coordinate },
      { id: 'indoor', coordinate: [30, 36] as Coordinate },
      { id: 'west', coordinate: [60, 70] as Coordinate },
      { id: 'library', coordinate: [150, 0] as Coordinate },
    ]
    expect(groupFieldMarkers(places, ([x, y]) => ({ x, y })).map(group => group.map(place => place.id)))
      .toEqual([['east'], ['indoor', 'west'], ['library']])
    expect(groupFieldMarkers(places, ([x, y]) => ({ x: x * 2, y: y * 2 }))).toHaveLength(4)
  })
})
