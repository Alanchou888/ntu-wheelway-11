async (page) => {
  const output = []
  const origin = new URL(page.url()).origin
  const outbound = '#screen=detail&from=library&route=walk-out&segment=walk-out-2'
  const views = [
    { label: '選擇方向', hash: '', selector: '.map-sheet h1:visible' },
    { label: '去程', hash: outbound, selector: '#route-attention-heading' },
    { label: '實勘卡', hash: outbound + '&place=field-curb-incline', selector: '.field-card h1' },
    { label: '照片放大', hash: outbound + '&place=field-curb-incline', selector: '.field-card h1', action: 'photo' },
    { label: '圖例', hash: '', selector: '.map-sheet h1:visible', action: 'legend' },
    { label: '定位', hash: outbound + '&place=field-curb-incline', selector: '.field-card h1', action: 'location' },
    { label: '飲水空結果', hash: '#category=water', selector: '.place-list-title h1' },
    { label: '分享', hash: '#screen=confirm&from=boya&route=walk-back', selector: '#panel-heading' },
  ]
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
    for (const view of views) {
      await page.goto(`${origin}/?qa=${width}-${encodeURIComponent(view.label)}${view.hash}`)
      await page.locator(view.selector).waitFor()
      if (view.action === 'photo') await page.getByRole('button', { name: /^放大照片 1/ }).click()
      if (view.action === 'legend') await page.getByRole('button', { name: '地圖圖例與圖層' }).click()
      if (view.action === 'location') await page.getByRole('button', { name: '定位我', exact: true }).click()
      await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))
      })
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa'] } })
        return r.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))
      })
      output.push({ width, screen: view.label, violations })
      if (view.action) await page.keyboard.press('Escape')
    }
  }
  if (output.some(item => item.violations.length)) throw new Error(JSON.stringify(output.filter(item => item.violations.length)))
  return output
}
