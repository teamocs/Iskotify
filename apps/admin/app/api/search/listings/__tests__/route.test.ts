import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'

// Student-typed queries must never reach an AI provider (API terms bar
// under-18 audiences). If the route ever constructs a Gemini client, fail loudly.
const geminiCtor = vi.fn()
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: function GoogleGenerativeAI() {
    geminiCtor()
    throw new Error('Gemini must not be called for student search')
  },
}))

import { POST } from '../route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/search/listings', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/search/listings (no AI provider)', () => {
  const prevKey = process.env.GEMINI_API_KEY
  beforeEach(() => {
    geminiCtor.mockClear()
    process.env.GEMINI_API_KEY = 'test-key'
  })
  afterEach(() => {
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = prevKey
  })

  it('never calls Gemini, even with a key configured', async () => {
    const res = await POST(req({
      query: 'free engineering scholarship',
      items: [{ id: 'a', title: 'Engineering Grant', type: 'scholarship' }],
    }))
    expect(res.status).toBe(200)
    expect(geminiCtor).not.toHaveBeenCalled()
  })

  it('keeps the { ids } response shape; empty ids tells the client to use its local keyword ranking', async () => {
    const res = await POST(req({ query: 'engineering', items: [{ id: 'a', title: 'Engineering Grant', type: 'scholarship' }] }))
    expect(await res.json()).toEqual({ ids: [] })
  })

  it('still answers 400 for a malformed body', async () => {
    const res = await POST(req('not json'))
    expect(res.status).toBe(400)
  })

  it('does not import the Gemini SDK at all', () => {
    const src = readFileSync(join(__dirname, '..', 'route.ts'), 'utf8')
    expect(src).not.toMatch(/generative-ai|gemini/i)
  })
})
