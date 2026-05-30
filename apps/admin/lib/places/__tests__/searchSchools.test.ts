import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { searchSchools, type PlacesSchoolResult } from '../searchSchools'

beforeEach(() => { mockFetch.mockReset() })

describe('searchSchools', () => {
  it('returns mapped suggestions on a successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            placePrediction: {
              structuredFormat: {
                mainText: { text: 'Ateneo de Manila University' },
                secondaryText: { text: 'Loyola Heights, Quezon City, Philippines' },
              },
            },
          },
        ],
      }),
    })

    const results = await searchSchools('ateneo', { apiKey: 'test-key' })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject<PlacesSchoolResult>({
      name: 'Ateneo de Manila University',
      subtitle: 'Loyola Heights, Quezon City, Philippines',
      source: 'places',
    })
  })

  it('returns empty array when API returns no suggestions', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    const results = await searchSchools('zzz', { apiKey: 'test-key' })
    expect(results).toEqual([])
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) })
    await expect(searchSchools('x', { apiKey: 'test-key' })).rejects.toThrow(/403/)
  })

  it('sends X-Goog-Api-Key header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ suggestions: [] }) })
    await searchSchools('x', { apiKey: 'secret-key' })
    const call = mockFetch.mock.calls[0]!
    expect((call[1] as RequestInit).headers).toMatchObject({ 'X-Goog-Api-Key': 'secret-key' })
  })
})
