import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { buildOffline, offlineEntries, serviceWorkerSource } from '../scripts/build-offline.mjs'
import { hasPendingSurveyChanges, offlineDate, updateAllowed } from '../src/offline'

const PINNED_HTML = '<html><script src="/assets/app-hash123.js"></script></html>'
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wheelway-offline-'))
  await Promise.all(['assets', 'data', '.openai', 'tiles'].map(path => mkdir(join(directory, path))))
  await Promise.all([
    writeFile(join(directory, 'index.html'), PINNED_HTML),
    writeFile(join(directory, 'assets/app-hash123.js'), 'window.app = true'),
    writeFile(join(directory, 'assets/app-hash123.css'), 'body { color: green }'),
    writeFile(join(directory, 'data/campus.json'), JSON.stringify({ retrievedAt: '2026-10-19T10:00:00Z' })),
    writeFile(join(directory, 'data/surveyed-routes.json'), '{"version":1,"routes":[]}'),
    writeFile(join(directory, 'manifest.webmanifest'), '{"name":"Wheelway"}'),
    writeFile(join(directory, '.openai/hosting.json'), '{"project_id":"exclude-me"}'),
    writeFile(join(directory, 'tiles/1.png'), 'never-cache-tiles'),
    writeFile(join(directory, 'assets/app-hash123.js.map'), 'never-cache-debug'),
  ])
  return directory
}

type Handler = (event: Record<string, unknown>) => void
function workerHarness(source: string) {
  const handlers = new Map<string, Handler>()
  const stores = new Map<string, Map<string, Response>>()
  const fetchImpl = vi.fn<(request: Request) => Promise<Response>>(async () => { throw new Error('offline') })
  const addAll = vi.fn(async (requests: Request[]) => {
    for (const request of requests) stores.get(cacheName)!.set(new URL(request.url).pathname, new Response('cached:' + new URL(request.url).pathname))
  })
  let cacheName = ''
  let skipWaitingCalls = 0
  const clientMessage = vi.fn()
  const self = {
    location: { origin: 'https://wheelway.example' },
    addEventListener: (name: string, handler: Handler) => handlers.set(name, handler),
    skipWaiting: async () => { skipWaitingCalls++ },
    clients: { claim: vi.fn(async () => {}), matchAll: async () => [{ postMessage: clientMessage }] },
  }
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map())
      cacheName = name
      return { addAll, match: async (path: string) => stores.get(name)!.get(path), put: async (path: string, response: Response) => { stores.get(name)!.set(path, response) } }
    },
    keys: async () => [...stores.keys()],
    delete: vi.fn(async (name: string) => stores.delete(name)),
  }
  class LocalRequest extends Request { constructor(input: string | Request, options: RequestInit) { super(typeof input === 'string' ? new URL(input, 'https://wheelway.example') : input, options) } }
  runInNewContext(source, { self, caches, Request: LocalRequest, Response, URL, fetch: fetchImpl, Set })
  const lifecycle = async (name: string, extra: Record<string, unknown> = {}) => {
    const pending: Promise<unknown>[] = []
    handlers.get(name)!({ waitUntil: (promise: Promise<unknown>) => pending.push(promise), ...extra })
    await Promise.all(pending)
  }
  const request = (url: string, method = 'GET') => {
    let response: Promise<Response> | null = null
    handlers.get('fetch')!({ request: new Request(url, { method }), respondWith: (promise: Promise<Response>) => { response = promise } })
    return response
  }
  return { stores, fetchImpl, addAll, caches, lifecycle, request, clientMessage, skipWaitingCalls: () => skipWaitingCalls }
}

describe('production offline shell', () => {
  it('uses the real hashed build files and excludes metadata, source maps and tile directories', async () => {
    const directory = await fixture()
    try {
      const { entries } = await offlineEntries(directory)
      const paths = entries.map((entry: { url: string }) => entry.url)
      expect(paths).toContain('/assets/app-hash123.js')
      expect(paths).toContain('/data/campus.json')
      expect(paths).toContain('/')
      expect(paths.some((path: string) => /\.openai|\.map$|tiles|https?:/.test(path))).toBe(false)
      const asset = entries.find((entry: { url: string }) => entry.url === '/assets/app-hash123.js')
      expect(asset.revision).toBe(createHash('sha256').update('window.app = true').digest('hex'))
      expect(asset.integrity).toBe('sha256-' + createHash('sha256').update('window.app = true').digest('base64'))
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('generates deterministic releases and changes release identity when a same-name snapshot changes', async () => {
    const directory = await fixture()
    try {
      const first = await buildOffline({ directory })
      const source = await readFile(join(directory, 'sw.js'), 'utf8')
      expect(first.snapshotDate).toBe('2026-10-19T10:00:00Z')
      expect((await buildOffline({ directory })).version).toBe(first.version)
      expect(await readFile(join(directory, 'sw.js'), 'utf8')).toBe(source)
      await writeFile(join(directory, 'data/surveyed-routes.json'), '{"version":1,"routes":[{"id":"new"}]}')
      expect((await buildOffline({ directory })).version).not.toBe(first.version)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('rejects an incomplete production build before writing a worker', async () => {
    const directory = await fixture()
    try {
      await rm(join(directory, 'data/surveyed-routes.json'))
      await expect(buildOffline({ directory })).rejects.toThrow('必要檔案')
      await expect(readFile(join(directory, 'sw.js'))).rejects.toThrow()
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('serves the shell, hashed assets and snapshots offline while excluding every external map or font request', async () => {
    const directory = await fixture()
    try {
      const { entries } = await offlineEntries(directory)
      const worker = workerHarness(serviceWorkerSource(entries, '2026-10-19', PINNED_HTML))
      await worker.lifecycle('install')
      expect(await (await worker.request('https://wheelway.example/'))!.text()).toBe(PINNED_HTML)
      expect(await (await worker.request('https://wheelway.example/data/campus.json?retry=1'))!.text()).toBe('cached:/data/campus.json')
      expect(await (await worker.request('https://wheelway.example/assets/app-hash123.js'))!.text()).toBe('cached:/assets/app-hash123.js')
      for (const url of ['https://tile.openstreetmap.org/17/123/456.png', 'https://map.ntu.edu.tw/geoNtuPublic/wms?LAYERS=gis:ntu_road', 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC', 'https://fonts.gstatic.com/font.woff2', 'https://photos.example/entry.jpg', 'https://wheelway.example/unknown-api', 'https://wheelway.example/tiles/1.png']) expect(worker.request(url)).toBeNull()
      expect(worker.request('https://wheelway.example/data/campus.json', 'POST')).toBeNull()
      expect(worker.fetchImpl).not.toHaveBeenCalled()
      expect(worker.addAll.mock.calls[0][0].every((request: Request) => request.cache === 'reload' && request.integrity.startsWith('sha256-'))).toBe(true)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('embeds the build HTML instead of downloading hosting-injected or newer HTML during installation', async () => {
    const directory = await fixture()
    try {
      const { entries } = await offlineEntries(directory)
      const worker = workerHarness(serviceWorkerSource(entries, '2026-10-19', PINNED_HTML))
      worker.fetchImpl.mockResolvedValue(new Response('<html><script src="/assets/new-release.js"></script><script>hosting-challenge()</script></html>'))
      await worker.lifecycle('install')
      const downloads = worker.addAll.mock.calls[0][0]
      expect(downloads.some(request => ['/', '/index.html'].includes(new URL(request.url).pathname))).toBe(false)
      expect(downloads.some(request => new URL(request.url).pathname === '/data/campus.json' && request.integrity.startsWith('sha256-'))).toBe(true)
      for (const path of ['/', '/index.html']) {
        const response = await worker.request('https://wheelway.example' + path)!
        expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
        expect(await response.text()).toBe(PINNED_HTML)
      }
      expect(worker.fetchImpl).not.toHaveBeenCalled()
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('recreates missing root and index cache entries from the same embedded release without a network request', async () => {
    const directory = await fixture()
    try {
      const { entries } = await offlineEntries(directory)
      const worker = workerHarness(serviceWorkerSource(entries, '2026-10-19', PINNED_HTML))
      await worker.lifecycle('install')
      for (const store of worker.stores.values()) { store.delete('/'); store.delete('/index.html') }
      worker.fetchImpl.mockResolvedValue(new Response('<html>another release with mutable hosting scripts</html>'))
      for (const path of ['/', '/index.html']) {
        const response = await worker.request('https://wheelway.example' + path)!
        expect(await response.text()).toBe(PINNED_HTML)
        expect([...worker.stores.values()].some(store => store.has(path))).toBe(true)
      }
      expect(worker.fetchImpl).not.toHaveBeenCalled()
      const reply = vi.fn()
      await worker.lifecycle('message', { data: { type: 'WHEELWAY_OFFLINE_STATUS' }, ports: [{ postMessage: reply }] })
      expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ready: true, snapshotDate: '2026-10-19' }))
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('waits for an explicit update message and preserves one previous release and unrelated caches', async () => {
    const worker = workerHarness(serviceWorkerSource([{ url: '/index.html', revision: 'test', integrity: '' }], '2026-10-19', PINNED_HTML))
    worker.stores.set('unrelated-app', new Map())
    worker.stores.set('wheelway-offline-oldest', new Map())
    worker.stores.set('wheelway-offline-previous', new Map([['/assets/old-hash.js', new Response('old chunk')]]))
    await worker.lifecycle('install')
    expect(worker.skipWaitingCalls()).toBe(0)
    await worker.lifecycle('message', { data: { type: 'unrelated-message' } })
    expect(worker.skipWaitingCalls()).toBe(0)
    await worker.lifecycle('message', { data: { type: 'WHEELWAY_ACTIVATE_UPDATE' } })
    expect(worker.skipWaitingCalls()).toBe(1)
    await worker.lifecycle('activate')
    expect(worker.stores.has('unrelated-app')).toBe(true)
    expect(worker.stores.has('wheelway-offline-oldest')).toBe(false)
    expect(worker.stores.has('wheelway-offline-previous')).toBe(true)
    expect(await (await worker.request('https://wheelway.example/assets/old-hash.js'))!.text()).toBe('old chunk')
    expect(worker.clientMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'WHEELWAY_OFFLINE_READY', snapshotDate: '2026-10-19' }))
  })
  it('does not claim readiness when required cached snapshots have been evicted', async () => {
    const worker = workerHarness(serviceWorkerSource([{ url: '/index.html', revision: 'test', integrity: '' }], null, PINNED_HTML))
    await worker.lifecycle('install')
    const reply = vi.fn()
    await worker.lifecycle('message', { data: { type: 'WHEELWAY_OFFLINE_STATUS' }, ports: [{ postMessage: reply }] })
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ready: false }))
  })
  it('rolls back a failed precache without deleting a previous release', async () => {
    const worker = workerHarness(serviceWorkerSource([{ url: '/index.html', revision: 'test', integrity: '' }], null, PINNED_HTML))
    worker.stores.set('wheelway-offline-previous', new Map())
    worker.addAll.mockRejectedValueOnce(new Error('asset integrity failure'))
    await expect(worker.lifecycle('install')).rejects.toThrow('asset integrity failure')
    expect([...worker.stores.keys()]).toEqual(['wheelway-offline-previous'])
  })
  it('recovers an evicted snapshot only when the response matches this release and caches the recovered bytes', async () => {
    const directory = await fixture()
    try {
      const { entries } = await offlineEntries(directory)
      const source = serviceWorkerSource(entries, '2026-10-19', PINNED_HTML)
      const worker = workerHarness(source)
      await worker.lifecycle('install')
      for (const store of worker.stores.values()) store.delete('/data/campus.json')
      const campusText = await readFile(join(directory, 'data/campus.json'), 'utf8')
      worker.fetchImpl.mockImplementation(async request => {
        const actual = 'sha256-' + createHash('sha256').update(campusText).digest('base64')
        if (request.integrity !== actual) throw new Error('Integrity check failed')
        return new Response(campusText, { headers: { 'Content-Type': 'application/json' } })
      })
      const recovered = await worker.request('https://wheelway.example/data/campus.json')!
      expect(await recovered.json()).toEqual({ retrievedAt: '2026-10-19T10:00:00Z' })
      expect(worker.fetchImpl.mock.calls[0][0].cache).toBe('no-store')
      expect(await (await worker.request('https://wheelway.example/data/campus.json'))!.json()).toEqual({ retrievedAt: '2026-10-19T10:00:00Z' })
      expect(worker.fetchImpl).toHaveBeenCalledTimes(1)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('rejects a newer network snapshot after partial eviction while preserving the usable shell and original source date', async () => {
    const directory = await fixture()
    try {
      const { entries } = await offlineEntries(directory)
      const worker = workerHarness(serviceWorkerSource(entries, '2026-10-19', PINNED_HTML))
      await worker.lifecycle('install')
      for (const store of worker.stores.values()) store.delete('/data/campus.json')
      const newer = '{"retrievedAt":"2026-10-20T10:00:00Z"}'
      worker.fetchImpl.mockImplementation(async request => {
        if (request.integrity !== 'sha256-' + createHash('sha256').update(newer).digest('base64')) throw new Error('Integrity check failed')
        return new Response(newer)
      })
      const failure = await worker.request('https://wheelway.example/data/campus.json')!
      expect(failure.status).toBe(503)
      expect(failure.headers.get('X-Wheelway-Offline-Error')).toBe('snapshot-unavailable')
      expect(await failure.json()).toEqual(expect.objectContaining({ error: 'WHEELWAY_SNAPSHOT_UNAVAILABLE' }))
      expect(await (await worker.request('https://wheelway.example/'))!.text()).toBe(PINNED_HTML)
      expect(await (await worker.request('https://wheelway.example/assets/app-hash123.js'))!.text()).toBe('cached:/assets/app-hash123.js')
      expect([...worker.stores.values()].every(store => !store.has('/data/campus.json'))).toBe(true)
      const reply = vi.fn()
      await worker.lifecycle('message', { data: { type: 'WHEELWAY_OFFLINE_STATUS' }, ports: [{ postMessage: reply }] })
      expect(reply).toHaveBeenCalledWith(expect.objectContaining({ ready: false, snapshotDate: '2026-10-19' }))
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})

describe('offline status and update guard', () => {
  it('blocks updates while edits are unsaved or a previous update is running', () => {
    expect(updateAllowed(true, false)).toBe(false)
    expect(updateAllowed(false, true)).toBe(false)
    expect(updateAllowed(false, false)).toBe(true)
  })
  it('rechecks the live editor signal after asynchronous saving and again after worker activation', async () => {
    const dataset: { surveyUnsaved?: string } = { surveyUnsaved: 'true' }
    vi.stubGlobal('document', { documentElement: { dataset } })
    try {
      expect(hasPendingSurveyChanges(false)).toBe(true)
      await Promise.resolve().then(() => { dataset.surveyUnsaved = 'false' })
      expect(hasPendingSurveyChanges(false)).toBe(false)
      // More input arrives after the update was requested and before controllerchange.
      dataset.surveyUnsaved = 'true'
      expect(hasPendingSurveyChanges(false)).toBe(true)
      delete dataset.surveyUnsaved
      expect(hasPendingSurveyChanges(false)).toBe(false)
      expect(hasPendingSurveyChanges(true)).toBe(true)
    } finally { vi.unstubAllGlobals() }
  })
  it('shows the snapshot date without assigning a field verification date to it', () => {
    expect(offlineDate('2026-10-19T23:10:00Z')).toBe('2026/10/19')
    expect(offlineDate(null)).toBe('尚無日期')
    expect(offlineDate('garbage')).toBe('尚無日期')
  })
})
