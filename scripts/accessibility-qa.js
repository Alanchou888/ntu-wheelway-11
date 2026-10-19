async (page) => {
  const output = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
    for (const screen of ['setup', 'compare', 'detail', 'confirm', 'survey', 'sources']) {
      await page.goto(`http://localhost:5173/#screen=${screen === 'survey' ? 'compare' : screen === 'sources' ? 'setup' : screen}&mode=${screen === 'survey' ? 'survey' : 'demo'}&from=library&chair=manual&prefer=gentle&route=gentle&segment=gentle-1`)
      await page.locator('#panel-heading').waitFor()
      if (screen === 'sources') await page.getByRole('button', { name: '資料來源', exact: true }).click()
      await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))
      })
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } })
        return r.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))
      })
      output.push({ width, screen, violations })
      if (screen === 'sources') await page.keyboard.press('Escape')
    }
  }
  if (output.some(item => item.violations.length)) throw new Error(JSON.stringify(output.filter(item => item.violations.length)))
  return output
}
