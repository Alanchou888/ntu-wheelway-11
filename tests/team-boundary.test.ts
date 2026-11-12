import { describe, expect, it, vi } from 'vitest'
import worker from '../server/index'

describe('team tooling deployment boundary', () => {
  it('returns 404 before the public asset binding for the local team entry and former templates', async () => {
    const assets = vi.fn(async () => new Response('public assets'))
    const env = { ASSETS: { fetch: assets } } as Parameters<typeof worker.fetch>[1]
    for (const path of ['/team', '/team/', '/templates/field-survey.csv', '/templates/survey-template.json']) {
      const response = await worker.fetch(new Request('https://wheelway.example' + path), env)
      expect(response.status).toBe(404)
    }
    expect(assets).not.toHaveBeenCalled()
    expect(await (await worker.fetch(new Request('https://wheelway.example/'), env)).text()).toBe('public assets')
  })
})
