import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSnapshot, loadCampus, loadSurvey } from '../src/data-client'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const abortableFetch = () => vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
  const signal = options.signal!
  const abort = () => reject(new DOMException('Request aborted', 'AbortError'))
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
}))

describe('public snapshot loading', () => {
  it('validates both source snapshots and uses their same-origin URLs', async () => {
    const campus = JSON.parse(readFileSync(new URL('../public/data/campus.json', import.meta.url), 'utf8'))
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('campus') ? campus : { version: 1, routes: [] })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadCampus()).toEqual(campus)
    expect(await loadSurvey()).toEqual({ version: 1, routes: [] })
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/data/campus.json', '/data/surveyed-routes.json'])
  })
  it('rejects HTTP 503 before interpreting its body as route data', async () => {
    const validator = vi.fn(value => value)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"version":1,"routes":[]}', { status: 503 })))
    await expect(fetchSnapshot('/data/surveyed-routes.json', validator)).rejects.toThrow('HTTP 503')
    expect(validator).not.toHaveBeenCalled()
  })
  it('rejects malformed JSON and invalid source shapes without fabricating an empty successful snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{broken')).mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('{"version":1,"routes":[{}]}'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadSurvey()).rejects.toThrow()
    await expect(loadCampus()).rejects.toThrow('圖資格式不完整')
    await expect(loadSurvey()).rejects.toThrow()
  })
  it('times out a stalled request and clears its timer without aborting the parent operation', async () => {
    vi.useFakeTimers()
    const parent = new AbortController(), fetchMock = abortableFetch()
    vi.stubGlobal('fetch', fetchMock)
    const result = expect(fetchSnapshot('/stalled.json', value => value, parent.signal, 50)).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(50); await result
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true)
    expect(parent.signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('forwards caller cancellation and removes the parent listener after failure', async () => {
    vi.useFakeTimers()
    const parent = new AbortController(), remove = vi.spyOn(parent.signal, 'removeEventListener')
    vi.stubGlobal('fetch', abortableFetch())
    const result = expect(fetchSnapshot('/cancel.json', value => value, parent.signal, 1000)).rejects.toMatchObject({ name: 'AbortError' })
    parent.abort(); await result
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })
  it('honors an already-cancelled parent and cleans timers after a normal response', async () => {
    vi.useFakeTimers()
    const parent = new AbortController(); parent.abort()
    vi.stubGlobal('fetch', abortableFetch())
    await expect(fetchSnapshot('/cancelled.json', value => value, parent.signal)).rejects.toMatchObject({ name: 'AbortError' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}')))
    expect(await fetchSnapshot('/ok.json', value => value)).toEqual({ ok: true })
    expect(vi.getTimerCount()).toBe(0)
  })
})
