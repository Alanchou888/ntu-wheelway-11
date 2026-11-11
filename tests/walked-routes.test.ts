import { describe, expect, it } from 'vitest'
import { buildWalkedRoutes } from '../src/walked-routes'
import { isEligible, metrics } from '../src/routes'

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
})
