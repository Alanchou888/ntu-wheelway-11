import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import type { Campus, SurveyData } from '../src/types'
import { createSurveyDrafts, parseSurveyData, readLocalSurveyRecord, SurveyConflictError, SurveyReadError, writeLocalSurvey } from '../src/survey'
import { SurveyDraftSession } from '../src/survey-storage'

const campus = JSON.parse(readFileSync(new URL('../public/data/campus.json', import.meta.url), 'utf8')) as Campus
const draft = (name: string): SurveyData => {
  const data = createSurveyDrafts(campus)
  data.routes[0].name = name
  data.routes[0].originEntrance.photos = [{ src: 'data:image/png;base64,aGVsbG8=', alt: 'Fixture', caption: 'Not field evidence' }]
  return data
}
function rawStore(value?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wheelway-field-survey', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onerror = reject
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('drafts', value === undefined ? 'readonly' : 'readwrite')
      const op = value === undefined ? tx.objectStore('drafts').get('current-v1') : tx.objectStore('drafts').put(value, 'current-v1')
      let result: unknown
      op.onsuccess = () => { result = op.result }
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  })
}

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('versioned IndexedDB survey storage', () => {
  it('reads an existing current-v1 record and upgrades only when edited', async () => {
    const legacy = draft('Legacy draft')
    await rawStore(legacy)
    const record = await readLocalSurveyRecord()
    expect(record).toEqual({ data: legacy, revision: 0, savedAt: null })
    const session = new SurveyDraftSession(draft('Blank'))
    await session.load()
    await session.flush()
    expect(await rawStore()).toEqual(legacy)
    session.change(draft('Intentional edit'))
    await session.flush()
    const updated = await readLocalSurveyRecord()
    expect(updated.revision).toBe(1)
    expect(updated.data?.routes[0].name).toBe('Intentional edit')
    expect(updated.data?.routes[0].originEntrance.photos).toEqual(legacy.routes[0].originEntrance.photos)
    expect(parseSurveyData(await rawStore())).not.toHaveProperty('_storage')
  })

  it('allows exactly one writer when two tabs save the same revision concurrently', async () => {
    const writes = await Promise.allSettled([writeLocalSurvey(draft('A'), null), writeLocalSurvey(draft('B'), null)])
    expect(writes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const failure = writes.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason).toBeInstanceOf(SurveyConflictError)
    const current = await readLocalSurveyRecord()
    expect(current.revision).toBe(1)
    expect(['A', 'B']).toContain(current.data?.routes[0].name)
    expect(failure.reason.latest.data).toEqual(current.data)
  })

  it('keeps stale-tab edits in memory and prevents retries until the newer draft is loaded', async () => {
    await writeLocalSurvey(draft('Original'), null)
    const a = new SurveyDraftSession(draft('Blank A')), b = new SurveyDraftSession(draft('Blank B'))
    await Promise.all([a.load(), b.load()])
    b.change(draft('Saved by B')); await b.flush()
    await a.flush() // Leaving an unchanged older tab must not write anything.
    expect((await readLocalSurveyRecord()).revision).toBe(2)
    a.change(draft('Unsaved A'))
    await expect(a.flush()).rejects.toBeInstanceOf(SurveyConflictError)
    await expect(a.flush()).rejects.toBeInstanceOf(SurveyConflictError)
    expect(a.data.routes[0].name).toBe('Unsaved A')
    expect(a.dirty).toBe(true)
    expect((await readLocalSurveyRecord()).data?.routes[0].name).toBe('Saved by B')
    await a.load()
    expect(a.conflict).toBeNull()
    expect(a.dirty).toBe(false)
    a.change(draft('Merged after reload')); await a.flush()
    expect((await readLocalSurveyRecord()).revision).toBe(3)
  })

  it('serializes pending saves and includes an edit made during an earlier transaction', async () => {
    const session = new SurveyDraftSession(draft('Initial'))
    await session.load()
    session.change(draft('First edit'))
    const first = session.flush()
    session.change(draft('Latest edit'))
    expect(session.flush()).toBe(first)
    await first
    expect(session.dirty).toBe(false)
    const current = await readLocalSurveyRecord()
    expect(current.revision).toBe(2)
    expect(current.data?.routes[0].name).toBe('Latest edit')
  })

  it('rejects invalid measurements before replacing the last readable record', async () => {
    const original = draft('Keep evidence')
    await writeLocalSurvey(original, null)
    for (const value of [-1, 100001, NaN, Infinity]) {
      const invalid = draft('Invalid')
      invalid.routes[0].segments[0].maxSlopePercent = value
      await expect(writeLocalSurvey(invalid, 1)).rejects.toThrow(/maxSlopePercent/)
    }
    const invalidText = draft('Invalid obstacle')
    invalidText.routes[0].segments[0].obstacles = ['x'.repeat(501)]
    await expect(writeLocalSurvey(invalidText, 1)).rejects.toThrow(/障礙/)
    expect((await readLocalSurveyRecord()).data).toEqual(original)
    expect((await readLocalSurveyRecord()).revision).toBe(1)
  })

  it('preserves unreadable legacy contents and makes raw recovery possible', async () => {
    const damaged = { version: 1, routes: [{ id: 'damaged', photos: ['original evidence'] }] }
    await rawStore(damaged)
    const session = new SurveyDraftSession(draft('Blank'))
    let failure: unknown
    try { await session.load() } catch (e) { failure = e }
    expect(failure).toBeInstanceOf(SurveyReadError)
    expect((failure as SurveyReadError).raw).toEqual(damaged)
    expect(await rawStore()).toEqual(damaged)
    session.change(draft('Explicit replacement'))
    await session.flush()
    expect((await readLocalSurveyRecord()).revision).toBe(1)
  })

  it('keeps prior contents after an aborted write, then allows an explicit retry', async () => {
    await writeLocalSurvey(draft('Original'), null)
    const session = new SurveyDraftSession(draft('Blank'))
    await session.load(); session.change(draft('Pending evidence'))
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Quota full', 'QuotaExceededError') })
    await expect(session.flush()).rejects.toThrow('Quota full')
    expect(session.dirty).toBe(true)
    expect((await readLocalSurveyRecord()).data?.routes[0].name).toBe('Original')
    await session.flush()
    expect(session.dirty).toBe(false)
    expect((await readLocalSurveyRecord()).data?.routes[0].name).toBe('Pending evidence')
  })

  it('rejects a missing object store instead of leaving the loading promise pending', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('wheelway-field-survey', 1)
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = reject
    })
    await expect(readLocalSurveyRecord()).rejects.toThrow(/格式不符/)
    const session = new SurveyDraftSession(draft('Blank'))
    await expect(session.load()).rejects.toThrow(/格式不符/)
    session.change(draft('Do not overwrite'))
    await expect(session.flush()).rejects.toThrow(/尚未載入/)
  })
})
