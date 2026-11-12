import { describe, expect, it } from 'vitest'
import { fromHash } from '../src/routes'
import { publicHash, publicNavigation } from '../src/public-navigation'

describe('public MVP navigation', () => {
  it('opens the direction picker for home and the former editor screen', () => {
    expect(publicNavigation(fromHash('')).screen).toBe('compare')
    expect(publicNavigation(fromHash('#screen=editor')).screen).toBe('compare')
  })

  it('discards inactive options without losing an existing walked route link', () => {
    const oldLink = '#screen=confirm&mode=survey&chair=electric&prefer=short&from=library&route=walk-back&segment=walk-back-1&minWidth=0.9&maxSlope=4&recheckDays=7&theme=slope&avoidReports=1'
    const normalized = publicNavigation(fromHash(oldLink))
    expect(normalized).toMatchObject({ screen: 'confirm', origin: 'boya', routeId: 'walk-back', segmentId: 'walk-back-1', mode: 'demo' })
    const share = publicHash(normalized)
    expect(share).not.toMatch(/chair=|prefer=|minWidth=|maxSlope=|recheckDays=|theme=|avoidReports=|mode=/)
    expect(publicNavigation(fromHash(share))).toEqual(normalized)
  })

  it('keeps facility and observation links reachable', () => {
    expect(publicNavigation(fromHash('#category=water')).category).toBe('water')
    expect(publicHash(fromHash('#place=field-boya-restroom'))).toContain('place=field-boya-restroom')
  })
})
