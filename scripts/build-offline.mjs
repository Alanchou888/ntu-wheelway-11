import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWED_EXTENSION = /\.(?:html|js|css|json|webmanifest|svg|png|jpe?g|webp|ico|woff2?|csv)$/i
const CACHE_PREFIX = 'wheelway-offline-'
const MAX_PRECACHE_BYTES = 12 * 1024 * 1024

/** Read the actual production files, including Vite's hashed chunks. */
export async function offlineEntries(directory) {
  const root = resolve(directory)
  const entries = []
  let bytes = 0
  const visit = async path => {
    for (const item of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (item.isSymbolicLink()) throw new Error('離線建置不接受符號連結')
      if (item.name.startsWith('.')) continue
      const full = join(path, item.name)
      const local = relative(root, full).split(sep).join('/')
      if (item.isDirectory()) {
        // Only controlled, local files. Tile caches and deployment metadata are excluded.
        if (['assets', 'data', 'templates', 'icons'].includes(local.split('/')[0])) await visit(full)
        continue
      }
      if (!item.isFile() || local === 'sw.js' || !ALLOWED_EXTENSION.test(local)) continue
      if (local.includes('/') && !/^(assets|data|templates|icons)\//.test(local)) continue
      const content = await readFile(full)
      bytes += content.length
      if (bytes > MAX_PRECACHE_BYTES) throw new Error('離線外殼超過 12 MB，請先檢查本站快照與圖示大小')
      entries.push({ url: '/' + local.split('/').map(encodeURIComponent).join('/'), revision: createHash('sha256').update(content).digest('hex'), integrity: 'sha256-' + createHash('sha256').update(content).digest('base64') })
    }
  }
  await visit(root)
  const index = entries.find(entry => entry.url === '/index.html')
  if (!index || !entries.some(entry => /^\/assets\/.+\.js$/.test(entry.url))) throw new Error('請先完成 Vite build，再建立離線外殼')
  for (const path of ['/data/campus.json', '/data/surveyed-routes.json', '/manifest.webmanifest']) {
    if (!entries.some(entry => entry.url === path)) throw new Error('離線建置缺少必要檔案：' + path)
  }
  entries.unshift({ ...index, url: '/' })
  return { entries, bytes }
}

export function serviceWorkerSource(entries, snapshotDate = null, shellHtml) {
  if (typeof shellHtml !== 'string' || !shellHtml.trim()) throw new Error('離線外殼缺少建置後 HTML')
  const source = `/* Generated from the production build. No external resources or map tiles are cached. */
const CACHE_PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const VERSION = "__WHEELWAY_BUILD_VERSION__";
const CACHE_NAME = CACHE_PREFIX + VERSION;
const PRECACHE = ${JSON.stringify(entries)};
const SNAPSHOT_DATE = ${JSON.stringify(snapshotDate)};
// Hosting may inject dynamic challenge scripts into HTML. Keep this release's own shell.
const SHELL_HTML = ${JSON.stringify(shellHtml)};
const SHELL_PATHS = new Set(['/', '/index.html']);
const shellResponse = () => new Response(SHELL_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
const LOCAL_PATHS = new Set(PRECACHE.map(entry => entry.url));
const ENTRY_BY_PATH = new Map(PRECACHE.map(entry => [entry.url, entry]));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Never download mutable hosting HTML. Other files retain their exact build integrity.
      await cache.addAll(PRECACHE.filter(entry => !SHELL_PATHS.has(entry.url)).map(entry => new Request(entry.url, { cache: 'reload', credentials: 'same-origin', integrity: entry.integrity })));
      await Promise.all([...SHELL_PATHS].map(path => cache.put(path, shellResponse())));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    // Updates remain waiting until the user explicitly asks to activate them.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep the previous release for tabs that still run its hashed chunks.
    const previous = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    for (const name of previous.slice(0, -1)) await caches.delete(name);
    await self.clients.claim();
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      client.postMessage({ type: 'WHEELWAY_OFFLINE_READY', version: VERSION, snapshotDate: SNAPSHOT_DATE });
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'WHEELWAY_ACTIVATE_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
  if (event.data?.type === 'WHEELWAY_OFFLINE_STATUS' && event.ports?.[0]) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const required = ['/index.html', '/data/campus.json', '/data/surveyed-routes.json'];
      const ready = (await Promise.all(required.map(path => cache.match(path)))).every(Boolean);
      event.ports[0].postMessage({ ready, version: VERSION, snapshotDate: SNAPSHOT_DATE });
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never intercept OSM tiles, NTU WMS, Google fonts, APIs, or third-party photos.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = url.pathname;
  // Use a closed allowlist. Unknown same-origin URLs keep their normal HTTP behavior.
  if (!LOCAL_PATHS.has(path) && !/^\\/assets\\/[^/]+$/.test(path)) return;
  event.respondWith((async () => {
    const current = await caches.open(CACHE_NAME);
    const response = await current.match(path);
    if (response) return response;
    if (SHELL_PATHS.has(path)) {
      // Recover this exact shell even if the cache was evicted or hosting has a newer release.
      const shell = shellResponse();
      try { await current.put(path, shell.clone()); } catch { /* Render the shell if storage is unavailable. */ }
      return shell;
    }
    // Previous hashed assets remain readable for another open tab during an update.
    if (/^\\/assets\\/[^/]+$/.test(path)) {
      for (const name of (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).reverse()) {
        const previous = await (await caches.open(name)).match(path);
        if (previous) return previous;
      }
    }
    const entry = ENTRY_BY_PATH.get(path);
    if (!entry) return fetch(request);
    try {
      // A partially evicted cache must never silently mix another release's JSON or HTML.
      // The browser rejects a response whose bytes differ from this release's integrity.
      const recovered = await fetch(new Request(request, { cache: 'no-store', integrity: entry.integrity }));
      if (!recovered.ok) throw new Error('Pinned offline asset is unavailable');
      try { await current.put(path, recovered.clone()); } catch { /* Online reads still work if storage is full. */ }
      return recovered;
    } catch {
      if (path.startsWith('/data/')) {
        return new Response(JSON.stringify({ error: 'WHEELWAY_SNAPSHOT_UNAVAILABLE', message: '目前版本的資料快照無法讀取，請連線後更新網站。', version: VERSION }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Wheelway-Offline-Error': 'snapshot-unavailable' }
        });
      }
      return new Response('目前版本的網站檔案無法讀取，請重新連線並關閉此網站的其他分頁後再開啟。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  })());
});
`
  // Include the worker implementation in the cache identity, as well as each file revision.
  const version = createHash('sha256').update(source).digest('hex').slice(0, 20)
  return source.replace('"__WHEELWAY_BUILD_VERSION__"', JSON.stringify(version))
}

export async function buildOffline({ directory = join(ROOT, 'dist') } = {}) {
  const { entries, bytes } = await offlineEntries(directory)
  const campus = JSON.parse(await readFile(join(directory, 'data/campus.json'), 'utf8'))
  const snapshotDate = typeof campus.retrievedAt === 'string' ? campus.retrievedAt : null
  const shellHtml = await readFile(join(directory, 'index.html'), 'utf8')
  if (createHash('sha256').update(shellHtml).digest('hex') !== entries.find(entry => entry.url === '/index.html').revision) throw new Error('建置期間 HTML 已變更，請重新執行離線建置')
  const source = serviceWorkerSource(entries, snapshotDate, shellHtml)
  await writeFile(join(directory, 'sw.js'), source, 'utf8')
  return { assets: entries.length, bytes, snapshotDate, version: source.match(/const VERSION = "([^"]+)"/)[1] }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildOffline().then(result => console.log('Offline shell:', JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1 })
}
