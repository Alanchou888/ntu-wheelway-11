import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Campus, Route } from '../src/types'
import { buildDemoRoutes, reverseRoute } from '../src/routes'
import { createTour, positionAt } from '../src/route-tour'
import type { TourController } from '../src/useRouteTour'
import RouteExplorer, { RouteTimeline } from '../src/RouteExplorer'

const campus = JSON.parse(readFileSync(new URL('../public/data/campus.json', import.meta.url), 'utf8')) as Campus
const route = buildDemoRoutes(campus).find(r => r.id === 'gentle')!
const fixture = (input: Route, reducedMotion = false): TourController => {
  const model = createTour(input)
  const noop = () => {}
  return { key: model.key, model, position: positionAt(model, 0), distanceM: 0,
    playing: false, engaged: false, speed: 1, pauseEach: true, following: true, notice: '', reducedMotion,
    seek: noop, selectSegment: noop, toggle: noop, step: noop, reset: noop, pause: noop,
    setFollowing: noop, setPauseEach: noop, setSpeed: noop }
}

describe('preview presentation preserves evidence semantics', () => {
  it('renders unknown measurements as unknown and suppresses unsupported route-wide extrema', () => {
    const input = structuredClone(route)
    input.segments[0].maxSlopePercent = null
    input.segments[1].minWidthM = null
    const html = renderToStaticMarkup(createElement(RouteTimeline, { tour: fixture(input) }))
    expect(html).toContain('最大坡度 尚無資料')
    expect(html).toContain('最窄路寬 尚無資料')
    expect(html.match(/>未知</g)).toHaveLength(2)
    expect(html).not.toContain('全程最高')
    expect(html).not.toContain('全程最窄')
    expect(html).not.toContain('最大坡度 0%')
  })
  it('retains tied extrema and exposes separate slope and width controls', () => {
    const html = renderToStaticMarkup(createElement(RouteTimeline, { tour: fixture(route) }))
    expect(html.match(/全程最窄/g)).toHaveLength(2)
    expect(html).toContain('各路段最大坡度')
    expect(html).toContain('各路段最窄路寬')
    expect(html.match(/<button/g)).toHaveLength(8)
  })
  it('shows the reversed first segment and keeps the simulated positioning label visible', () => {
    const input = reverseRoute(route)
    const html = renderToStaticMarkup(createElement(RouteExplorer, { route: input, tour: fixture(input), onInspect: () => {} }))
    expect(html).toContain('第 1 段 博雅入口銜接段')
    expect(html).toContain('示範路況與入口')
    expect(html).toContain('非即時定位')
    expect(html).toContain('待補實景照片')
    expect(html).toContain('播放進度與實際行進時間無關')
  })
  it('disables animated playback for reduced motion while keeping manual segment controls', () => {
    const html = renderToStaticMarkup(createElement(RouteExplorer, { route, tour: fixture(route, true), onInspect: () => {} }))
    expect(html).toMatch(/disabled="" aria-label="播放預演"/)
    expect(html).toContain('aria-label="下一個預演路段"')
    expect(html).toContain('aria-label="預演進度"')
    expect(html).toContain('已依系統設定減少動態')
  })
})
