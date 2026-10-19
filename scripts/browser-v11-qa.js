async (page) => {
  const base = 'http://localhost:5173/'
  const results = [], errors = []
  const assert = (v, name) => { if (!v) throw new Error(name); results.push({ name, pass: true }) }
  const errorHandler = e => errors.push(String(e))
  page.on('pageerror', errorHandler)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${base}#screen=compare&mode=demo&prefer=gentle&route=gentle`)
  await page.getByRole('heading', { name: '兩條路，差在哪裡？' }).waitFor()
  assert(await page.locator('.difference-list').innerText().then(t => t.includes('210 m') && t.includes('降低 3 個百分點') && t.includes('增加 0.6 m')), 'Comparison shows signed distance, slope percentage points, and width differences')
  await page.screenshot({ path: 'output/playwright/v11-comparison.png' })
  const mapSlope = page.getByRole('button', { name: /博雅周邊緩行段：最陡路段/ })
  await mapSlope.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: '每一段，都看得到' }).waitFor()
  assert(page.url().includes('segment=gentle-3'), 'Map bottleneck is keyboard-operable and opens its route segment')
  assert(await page.locator('.bottleneck-buttons button').count() === 3, 'Tied narrowest segments are both listed')
  await page.getByRole('button', { name: '最窄路段 · 1.8 m 校園連接步道', exact: true }).click()
  assert(page.url().includes('segment=gentle-2'), 'Bottleneck list updates the selected segment')
  await page.screenshot({ path: 'output/playwright/v11-bottlenecks.png' })

  await page.getByRole('button', { name: '實勘編輯', exact: true }).click()
  await page.getByRole('combobox', { name: '選擇實勘動線' }).waitFor()
  // This is an isolated automation browser. All subsequent records are software
  // fixtures, are exported only under output/, and never enter public data.
  await page.getByRole('button', { name: '從公開幾何重建空白草稿' }).click()
  await page.getByRole('button', { name: '確認重建空白草稿' }).click()
  await page.getByRole('textbox', { name: '動線名稱', exact: true }).fill('QA 草稿（程式測試）')
  await page.getByRole('button', { name: '1 路段 1 待查核', exact: true }).click()
  assert(await page.getByRole('spinbutton', { name: '最大坡度（%）', exact: true }).inputValue() === '', 'Fresh survey measurements stay empty rather than copying demo values')
  assert(await page.getByRole('button', { name: '標記本項已查核', exact: true }).isDisabled(), 'Incomplete evidence cannot be marked verified')
  await page.getByRole('spinbutton', { name: '最大坡度（%）', exact: true }).fill('3.5')
  await page.getByRole('spinbutton', { name: '有效路寬（m）', exact: true }).fill('1.6')
  await page.getByRole('spinbutton', { name: '最大階差（cm）', exact: true }).fill('0')
  await page.getByRole('spinbutton', { name: '坡道長度（m）', exact: true }).fill('0')
  await page.getByRole('combobox', { name: '階梯狀況', exact: true }).selectOption('false')
  await page.getByRole('combobox', { name: '封閉狀況', exact: true }).selectOption('false')
  await page.getByRole('textbox', { name: '路面條件', exact: true }).fill('QA fixture, not a real measurement')
  await page.getByLabel('實勘日期', { exact: true }).fill('2026-10-18')
  await page.getByRole('textbox', { name: '實勘者與量測方式', exact: true }).fill('QA_FIXTURE_ONLY, no real field survey')
  await page.locator('.survey-photos input[type=file]').setInputFiles({ name: 'qa-pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD18AAAAASUVORK5CYII=', 'base64') })
  await page.getByRole('textbox', { name: '照片 1 說明與替代文字' }).fill('程式測試圖片，非實景')
  await page.getByRole('checkbox', { name: '我已於上述日期在現場查核，本項照片與量測為實際紀錄。' }).check()
  await page.getByRole('button', { name: '標記本項已查核', exact: true }).click()
  await page.getByText('1 / 6 項已查核', { exact: true }).waitFor()
  assert(true, 'Field values, photo, caption, date and explicit confirmation complete a single record')
  await page.getByRole('spinbutton', { name: '最大坡度（%）', exact: true }).fill('4')
  await page.getByText('0 / 6 項已查核', { exact: true }).waitFor()
  assert(await page.getByRole('checkbox', { name: '我已於上述日期在現場查核，本項照片與量測為實際紀錄。' }).isChecked() === false, 'Changing evidence revokes prior verification and confirmation')
  await page.getByRole('checkbox', { name: '我已於上述日期在現場查核，本項照片與量測為實際紀錄。' }).check()
  await page.getByRole('button', { name: '標記本項已查核', exact: true }).click()
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click()
  await page.getByText('已儲存在此瀏覽器', { exact: true }).waitFor()
  await page.reload()
  await page.getByRole('combobox', { name: '選擇實勘動線' }).waitFor()
  assert(await page.getByRole('textbox', { name: '動線名稱', exact: true }).inputValue() === 'QA 草稿（程式測試）', 'IndexedDB draft survives a full reload including StrictMode')
  await page.getByRole('button', { name: '1 路段 1 已查核', exact: true }).click()
  assert(await page.getByRole('spinbutton', { name: '最大坡度（%）', exact: true }).inputValue() === '4', 'Saved measurements restored')
  assert(await page.locator('.survey-photo img').getAttribute('src').then(s => s.startsWith('data:image/png;base64,')), 'Local photo restored with the field record')
  await page.screenshot({ path: 'output/playwright/v11-editor-desktop.png' })

  const exported = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 JSON', exact: true }).click()
  const download = await exported
  await download.saveAs('output/playwright/qa-survey-export.json')
  const stream = await download.createReadStream()
  let raw = ''
  for await (const chunk of stream) raw += chunk.toString('utf8')
  const parsed = JSON.parse(raw)
  assert(parsed.routes[0].segments[0].status === 'verified' && parsed.routes[0].segments[0].photos.length === 1 && parsed.routes[0].originEntrance.status === 'unverified', 'JSON export preserves evidence and individual statuses without promoting the route')
  const csvEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 CSV', exact: true }).click()
  const csvDownload = await csvEvent
  await csvDownload.saveAs('output/playwright/qa-survey-export.csv')
  let csv = ''
  for await (const chunk of await csvDownload.createReadStream()) csv += chunk.toString('utf8')
  assert(csv.startsWith('\ufeff') && csv.includes('slope_percent') && csv.includes('QA_FIXTURE_ONLY'), 'CSV download has UTF-8 BOM and field evidence')
  const importFile = async (name, text) => {
    await page.locator('.survey-panel input[type=file]').first().setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') })
  }
  await importFile('broken.json', '{"version":1,"routes":[{}]}')
  await page.getByRole('alert').filter({ hasText: '匯入失敗' }).waitFor()
  assert(await page.getByRole('textbox', { name: '動線名稱', exact: true }).inputValue() === 'QA 草稿（程式測試）', 'Invalid import preserves the current draft')
  await importFile('roundtrip.json', raw)
  await page.getByText(/已匯入 2 條實勘草稿/).waitFor()
  assert(await page.getByText('1 / 6 項已查核', { exact: true }).count() === 1, 'Valid JSON imports all records without changing their statuses')

  await page.getByRole('spinbutton', { name: '入口經度', exact: true }).fill('121.5409')
  await page.getByRole('spinbutton', { name: '入口緯度', exact: true }).focus()
  await page.getByText(/起點入口距路段端點超過 2 m/).waitFor()
  await page.getByRole('button', { name: '將相鄰路段端點移至此入口', exact: true }).click()
  assert(await page.getByText(/起點入口距路段端點超過 2 m/).count() === 0, 'Keyboard-editable entrance coordinates flag geometry mismatch and support explicit endpoint synchronization')
  await page.getByText('0 / 6 項已查核', { exact: true }).waitFor()
  assert(true, 'Changing route geometry revokes the adjacent segment verification')

  await page.evaluate(() => {
    window.__wheelwayIdbDescriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB')
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open: () => { throw new DOMException('QA storage denied', 'QuotaExceededError') } } })
  })
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click()
  await page.getByText('尚未儲存，請匯出備份', { exact: true }).waitFor()
  assert(await page.getByRole('textbox', { name: '動線名稱', exact: true }).inputValue() === 'QA 草稿（程式測試）', 'Storage denial retains the in-memory draft and offers export')
  await page.evaluate(() => { Object.defineProperty(window, 'indexedDB', window.__wheelwayIdbDescriptor); delete window.__wheelwayIdbDescriptor })
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click()
  await page.getByText('已儲存在此瀏覽器', { exact: true }).waitFor()
  assert(await page.getByRole('alert').filter({ hasText: '本機儲存失敗' }).count() === 0, 'Successful storage retry clears the obsolete failure message')

  const accessibility = []
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
    for (const form of ['entrance', 'segment']) {
      await page.getByRole('group', { name: '選擇實勘項目', exact: true }).getByRole('button').nth(form === 'entrance' ? 0 : 1).click()
      await page.evaluate(async () => { await document.fonts.ready })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Editor has no horizontal overflow: ${width}px ${form}`)
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
        return r.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))
      })
      accessibility.push({ width, form, violations })
    }
  }
  await page.setViewportSize({ width: 360, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Editor layout fits 360px mobile viewport')
  await page.getByRole('button', { name: '儲存草稿', exact: true }).scrollIntoViewIfNeeded()
  const targetSize = await page.getByRole('button', { name: '儲存草稿', exact: true }).boundingBox()
  assert(targetSize.width >= 44 && targetSize.height >= 44, 'Mobile editor primary controls meet 44px target size')
  await page.screenshot({ path: 'output/playwright/v11-editor-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '返回選路', exact: true }).click()
  await page.getByRole('button', { name: '已查核路線', exact: true }).click()
  await page.getByRole('button', { name: '查詢候選路線', exact: true }).click()
  await page.getByRole('heading', { name: '目前無已查核路線', exact: true }).waitFor()
  assert(await page.locator('.route-card').count() === 0, 'Local draft never silently enters the public surveyed route collection')
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('wheelway-field-survey', 1)
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction('drafts', 'readwrite')
        tx.objectStore('drafts').put({ version: 1, routes: [{ id: 'damaged-QA-record' }] }, 'current-v1')
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = reject
      }
      req.onerror = reject
    })
  })
  await page.getByRole('button', { name: '實勘編輯', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '已暫停自動儲存' }).waitFor()
  // Wait beyond the auto-save debounce to prove a damaged stored record is not
  // overwritten by the newly rendered blank template.
  await page.waitForTimeout(900)
  const preserved = await page.evaluate(async () => new Promise((resolve, reject) => {
    const req = indexedDB.open('wheelway-field-survey', 1)
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('drafts', 'readonly'), get = tx.objectStore('drafts').get('current-v1')
      get.onsuccess = () => resolve(get.result.routes[0].id)
      tx.oncomplete = () => db.close()
      tx.onerror = reject
    }
    req.onerror = reject
  }))
  assert(preserved === 'damaged-QA-record', 'Unreadable local records pause automatic storage and preserve the previous contents')
  await page.getByRole('button', { name: '從公開幾何重建空白草稿' }).click()
  await page.getByRole('button', { name: '確認重建空白草稿' }).click()
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click()
  await page.getByText('已儲存在此瀏覽器', { exact: true }).waitFor()
  page.off('pageerror', errorHandler)
  assert(errors.length === 0, 'No uncaught JavaScript errors across editor and import/export flow')
  assert(accessibility.every(item => item.violations.length === 0), `Editor has no automated WCAG A/AA violations: ${JSON.stringify(accessibility)}`)
  return { results, accessibility, errors }
}
