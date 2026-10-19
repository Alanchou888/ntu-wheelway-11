import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ENDPOINTS, normalizeNtu, normalizeFacilities, parseOsm, osmContext,
  validateCampus, pathLengthM } from './data-normalization.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultSnapshotPath = resolve(projectRoot, 'public/data/campus.json');
const notes = {
  ntu: '建物中心座標，並非無障礙入口。API 下載日期不代表實地查核日期。',
  wheelroute: '公開斜坡道點位，尚未實勘。原始寬度單位為公分，已換算公尺。寬度 0、負值及寬坡皆 0 的未測值保留為未知。',
  osm: '© OpenStreetMap contributors，ODbL。背景向量為公開圖資。兩條候選動線採用原始圖資日期並保留策展幾何，無實地查核。',
};

export function snapshotSummary(snapshot) {
  return {
    retrievedAt: snapshot.retrievedAt,
    sources: snapshot.sources.map(({ id, status, retrievedAt }) => ({ id, status, retrievedAt })),
    places: snapshot.places.length,
    facilities: snapshot.facilities.length,
    vectorFeatures: snapshot.context.features.length,
    paths: snapshot.paths.map((path) => ({ id: path.id, lengthM: Math.round(pathLengthM(path)), points: path.coordinates.length })),
  };
}

export async function refreshCampus({ snapshotPath = defaultSnapshotPath, fetchImpl = fetch,
  offline = false, now = new Date(), write = true } = {}) {
  const previous = validateCampus(JSON.parse(await readFile(snapshotPath, 'utf8')));
  if (offline) return { snapshot: previous, summary: snapshotSummary(previous), failures: [], wrote: false };
  const retrievedAt = now.toISOString();
  const entries = Object.entries(ENDPOINTS);
  const results = await Promise.allSettled(entries.map(async ([id, url]) => {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(45000),
      headers: { 'User-Agent': 'NTU-Wheelchair-Prototype/1.0 (public-campus-GIS-snapshot)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (id === 'osm') return osmContext(parseOsm(await response.text()));
    const payload = await response.json();
    return id === 'ntu' ? normalizeNtu(payload) : normalizeFacilities(payload);
  }));
  const snapshot = structuredClone(previous);
  const failures = [];
  let successes = 0;
  for (let index = 0; index < entries.length; index++) {
    const [id] = entries[index];
    const result = results[index];
    const sourceIndex = snapshot.sources.findIndex((source) => source.id === id);
    const source = snapshot.sources[sourceIndex];
    if (result.status === 'fulfilled') {
      successes++;
      if (id === 'ntu') snapshot.places = result.value;
      else if (id === 'wheelroute') snapshot.facilities = result.value;
      else snapshot.context = result.value;
      snapshot.sources[sourceIndex] = { ...source, retrievedAt, status: 'ok', note: notes[id] };
    } else {
      const reason = String(result.reason?.message ?? result.reason).replace(/[\r\n]/g, ' ').slice(0, 180);
      failures.push({ id, reason });
      snapshot.sources[sourceIndex] = { ...source, status: 'cached',
        note: `${notes[id]} 最近更新嘗試 ${retrievedAt} 未成功，保留 ${source.retrievedAt} 快照。` };
    }
  }
  // Manual demonstration conditions and curated paths are never overwritten by API refreshes.
  if (successes) snapshot.retrievedAt = retrievedAt;
  validateCampus(snapshot);
  if (write) {
    const tempPath = `${snapshotPath}.${process.pid}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
      await rename(tempPath, snapshotPath);
    } finally {
      await rm(tempPath, { force: true }).catch(() => {});
    }
  }
  return { snapshot, summary: snapshotSummary(snapshot), failures, wrote: write };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const options = process.argv.slice(2);
  if (options.some((option) => !['--offline', '--dry-run'].includes(option))) {
    console.error('Usage: node scripts/refresh-data.mjs [--offline] [--dry-run]');
    process.exitCode = 1;
  } else {
    try {
      const result = await refreshCampus({ offline: options.includes('--offline'), write: !options.includes('--dry-run') });
      console.log(JSON.stringify({ mode: options.includes('--offline') ? 'offline validation' : 'public API refresh',
        ...result.summary, failures: result.failures, wrote: result.wrote }, null, 2));
      if (result.failures.length) console.warn('Unavailable sources kept their previous valid snapshots.');
    } catch (error) {
      console.error(`Snapshot unchanged: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
