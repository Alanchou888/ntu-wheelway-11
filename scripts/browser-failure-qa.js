async (page) => {
  const base = 'http://localhost:5173/'
  const results = []
  const assert = (value, name) => { if (!value) throw new Error(name); results.push({ name, pass: true }) }
  const errors = []
  const onError = error => errors.push(String(error))
  page.on('pageerror', onError)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.route('**/data/campus.json', r => r.fulfill({ status: 503, body: 'simulated outage' }))
  await page.goto(base)
  await page.getByRole('heading', { name: '圖資暫時無法載入' }).waitFor()
  await page.unroute('**/data/campus.json')
  await page.getByRole('button', { name: '重新載入圖資' }).click()
  await page.getByRole('heading', { name: '下一段，往哪裡？' }).waitFor()
  assert(true, 'Snapshot load error and retry recovery')

  await page.route('**/data/surveyed-routes.json', r => r.fulfill({ status: 503, body: 'simulated outage' }))
  await page.goto(base)
  await page.getByRole('heading', { name: '下一段，往哪裡？' }).waitFor()
  await page.getByRole('button', { name: '已查核路線', exact: true }).click()
  await page.getByRole('button', { name: '查詢候選路線' }).click()
  await page.getByRole('heading', { name: '查核資料暫時無法載入' }).waitFor()
  assert(await page.locator('button.route-card').count() === 0, 'Survey snapshot failure does not substitute demo routes')
  await page.unroute('**/data/surveyed-routes.json')

  await page.route('**/data/campus.json', async r => {
    const response = await r.fetch()
    const data = await response.json()
    data.paths = data.paths.filter(p => p.id === 'direct')
    await r.fulfill({ json: data })
  })
  await page.goto(base)
  await page.getByRole('heading', { name: '下一段，往哪裡？' }).waitFor()
  await page.getByRole('button', { name: '查詢候選路線' }).click()
  await page.getByRole('heading', { name: '每一段，都看得到' }).waitFor()
  assert(page.url().includes('screen=detail'), 'Single candidate opens route detail directly')
  await page.unroute('**/data/campus.json')

  await page.route('https://tile.openstreetmap.org/**', r => r.abort())
  await page.route('https://map.ntu.edu.tw/geoNtuPublic/wms**', r => r.abort())
  await page.route('**/data/campus.json', async r => {
    const response = await r.fetch()
    const data = await response.json()
    data.paths.forEach(p => { p.photos = [{ src: '/missing-photo-for-qa.jpg', alt: '故障測試圖片', caption: '測試用圖片' }] })
    await r.fulfill({ json: data })
  })
  await page.goto(base)
  await page.getByRole('heading', { name: '下一段，往哪裡？' }).waitFor()
  await page.getByRole('button', { name: '查詢候選路線' }).click()
  await page.getByRole('button', { name: '查看較平緩的動線' }).click()
  await page.getByText('照片暫時無法載入', { exact: true }).waitFor()
  await page.getByText('底圖暫時無法載入，仍可查看動線與清單。', { exact: true }).waitFor()
  assert(await page.locator('.map-canvas svg path').count() > 100, 'Vector context and routes survive external tile/WMS failure')
  assert(await page.getByRole('button', { name: /路段 2：/ }).isVisible(), 'Segment list remains operable with map and photo failures')
  await page.getByRole('button', { name: /路段 2：/ }).click()
  assert(await page.locator('.leaflet-overlay-pane path[stroke="#e09c37"]').count() === 1, 'List selection highlights matching map segment')
  const mapSegment = page.locator('.leaflet-overlay-pane path[stroke="#1b7160"]').last()
  const point = await mapSegment.evaluate(el => {
    const p = el.getPointAtLength(el.getTotalLength() / 2)
    const matrix = el.getScreenCTM()
    return { x: matrix.a * p.x + matrix.c * p.y + matrix.e, y: matrix.b * p.x + matrix.d * p.y + matrix.f }
  })
  await page.mouse.click(point.x, point.y)
  assert(await page.getByRole('button', { name: /路段 4：/ }).getAttribute('aria-pressed') === 'true', 'Map segment click updates the accessible list')
  await page.screenshot({ path: 'output/playwright/desktop-map-fallback.png' })
  await page.getByRole('button', { name: '選擇這條路線' }).click()
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('simulated clipboard denial') } }, configurable: true }))
  await page.getByRole('button', { name: '複製路線連結' }).click()
  await page.getByRole('textbox', { name: '路線連結', exact: true }).waitFor()
  assert((await page.getByRole('textbox', { name: '路線連結', exact: true }).inputValue()).includes('screen=confirm'), 'Clipboard denial provides selectable link')
  await page.unroute('**/data/campus.json')
  await page.unroute('https://tile.openstreetmap.org/**')
  await page.unroute('https://map.ntu.edu.tw/geoNtuPublic/wms**')

  const accessibility = []
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
    for (const screen of ['setup', 'compare', 'detail', 'confirm']) {
      await page.goto(`${base}#screen=${screen}&mode=demo&from=library&chair=manual&prefer=gentle&route=gentle&segment=gentle-1`)
      await page.locator('#panel-heading').waitFor()
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
      const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } })
        return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))
      })
      accessibility.push({ width, screen, violations })
    }
  }
  page.off('pageerror', onError)
  assert(errors.length === 0, 'No uncaught JavaScript errors during fault scenarios')
  assert(accessibility.every(item => item.violations.length === 0), 'No automated WCAG A/AA violations across eight screen/viewport combinations')
  return { results, accessibility, errors }
}
