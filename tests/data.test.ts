import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeFacilities, normalizeNtu, validateCampus, isCandidateWay } from '../scripts/data-normalization.mjs'
import { refreshCampus } from '../scripts/refresh-data.mjs'

describe('public data normalization', () => {
  it('converts cm to metres, keeps unknowns, and filters invalid coordinates', () => {
    const base = { kind: '1', lon: '121.537', lat: '25.018' }
    const result = normalizeFacilities([
      { ...base, kname: '1-a', width: 150, slope: 3 },
      { ...base, kname: '2-b', width: 0, slope: 0 },
      { ...base, kname: '3-c', width: -1, slope: -1 },
      { ...base, kname: '4-d', width: null, slope: null },
      { ...base, kname: '5-e', lon: '0', lat: '0', width: 150, slope: 3 },
    ])
    expect(result).toHaveLength(4)
    expect(result[0].widthM).toBe(1.5)
    expect(result[0].slopePercent).toBe(3)
    expect(result.slice(1).every(f => f.widthM === null && f.slopePercent === null && f.status === 'unverified')).toBe(true)
  })
  it('uses stable building IDs and never labels them as entrances', () => {
    const data = normalizeNtu({ data: [{ uid: 'AT3041', lon: '121.54105518', lat: '25.01749827' }, { uid: 'AT1044', lon: '121.53669691', lat: '25.01889002' }] })
    expect(data.map(p => p.kind)).toEqual(['building', 'building'])
    expect(() => normalizeNtu({ data: [] })).toThrow()
  })
  it('excludes known stairs, private ways, and indoor passages from candidate geometry', () => {
    for (const tags of [{ highway: 'steps' }, { highway: 'footway', access: 'private' }, { highway: 'footway', indoor: 'yes' }, { highway: 'footway', covered: 'building_passage' }, { highway: 'footway', wheelchair: 'no' }]) expect(isCandidateWay({ tags })).toBe(false)
    expect(isCandidateWay({ tags: { highway: 'footway' } })).toBe(true)
  })
})

describe('snapshot failure preservation', () => {
  it('validates the committed snapshot without a network request or write', async () => {
    const result = await refreshCampus({ offline: true, fetchImpl: () => { throw new Error('network must not run') } })
    expect(result.wrote).toBe(false)
    expect(result.summary.places).toBe(2)
    expect(result.summary.paths).toHaveLength(2)
    expect(result.failures).toHaveLength(0)
  })
  it('preserves data and retrieval dates on all-source failure, then writes valid JSON atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wheelway-test-'))
    const path = join(directory, 'campus.json')
    try {
      const before = JSON.parse(await readFile(new URL('../public/data/campus.json', import.meta.url), 'utf8'))
      await writeFile(path, JSON.stringify(before))
      const result = await refreshCampus({ snapshotPath: path, fetchImpl: async () => { throw new Error('simulated outage') } })
      expect(result.failures).toHaveLength(3)
      const after = validateCampus(JSON.parse(await readFile(path, 'utf8')))
      expect(after.paths).toEqual(before.paths)
      expect(after.facilities).toEqual(before.facilities)
      expect(after.places).toEqual(before.places)
      expect(after.retrievedAt).toBe(before.retrievedAt)
      expect(after.sources.every(s => s.status === 'cached')).toBe(true)
      expect(after.sources.map(s => s.retrievedAt)).toEqual(before.sources.map(s => s.retrievedAt))
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
