import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const campus = JSON.parse(await readFile(resolve(root, 'public/data/campus.json'), 'utf8'))
const names = { library: '總圖書館', boya: '博雅教學館' }
const makeEntrance = (id, coordinate) => ({ id: `survey-${id}`, placeId: id, name: `${names[id]}入口（待實勘）`, coordinate, status: 'unverified', verifiedAt: null, source: '待團隊實勘', photos: [] })
const routes = campus.paths.map(path => {
  const parts = Array.from({ length: 4 }, (_, i) => {
    const start = Math.floor((path.coordinates.length - 1) * i / 4)
    const end = Math.floor((path.coordinates.length - 1) * (i + 1) / 4)
    return path.coordinates.slice(start, end + 1)
  })
  return { id: `survey-${path.id}`, name: `實勘動線 ${path.id}（待命名）`, description: '待團隊實勘後填寫', kind: 'survey',
    originEntrance: makeEntrance('library', path.coordinates[0]), destinationEntrance: makeEntrance('boya', path.coordinates.at(-1)),
    segments: parts.map((coordinates, i) => ({ id: `survey-${path.id}-${i + 1}`, name: `路段 ${i + 1}（待命名）`, coordinates,
      status: 'unverified', maxSlopePercent: null, minWidthM: null, stepHeightCm: null, hasStairs: null, surface: null,
      rampLengthM: null, closed: null, obstacles: [], photos: [], source: '待團隊實勘', sourceUrl: 'https://www.openstreetmap.org/copyright', retrievedAt: campus.retrievedAt, verifiedAt: null })) }
})
const target = resolve(root, 'public/templates/survey-template.json')
await mkdir(dirname(target), { recursive: true })
await writeFile(target, JSON.stringify({ version: 1, routes }, null, 2) + '\n', 'utf8')
console.log('Created public/templates/survey-template.json. All survey conditions remain unknown and unverified. No active route data was changed.')
