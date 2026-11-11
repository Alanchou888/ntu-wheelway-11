import { describe, expect, it } from 'vitest'
import { buildWalkedRoutes } from '../src/walked-routes'
import { fieldObservation } from '../src/field-observations'
import { groupFieldMarkers } from '../src/field-marker-groups'
import { isEligible, metrics } from '../src/routes'
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
      expect(route.segments.every(segment => segment.hasStairs === null)).toBe(true)
    }
    expect(buildWalkedRoutes()[0].segments.at(-1)).toMatchObject({
      name: '博雅館內至西側出口', approximate: true,
    })
  })

  it('links all field records to nearby segments while keeping spot values out of route metrics', () => {
    const ids = buildWalkedRoutes().flatMap(route => route.segments.flatMap(segment => segment.fieldPointIds ?? []))
    expect(new Set(ids).size).toBe(12)
    expect(ids.every(id => !!fieldObservation(id))).toBe(true)
    expect(fieldObservation('field-boya-indoor-ramp')?.readings?.map(reading => reading.value)).toEqual(['89 公分', '1W'])
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
