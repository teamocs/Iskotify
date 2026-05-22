import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useSchoolSearch } from '../useSchoolSearch'

const MOCK_RESPONSE = {
  suggestions: [
    {
      placePrediction: {
        structuredFormat: {
          mainText: { text: 'San Beda University' },
          secondaryText: { text: 'Mendiola, Manila, Philippines' },
        },
      },
    },
    {
      placePrediction: {
        structuredFormat: {
          mainText: { text: 'San Juan National High School' },
          secondaryText: { text: 'San Juan, Metro Manila, Philippines' },
        },
      },
    },
  ],
}

function mockFetchOnce(response: object, ok = true) {
  return jest.spyOn(global, 'fetch' as never).mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(response),
  } as Response)
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('useSchoolSearch', () => {
  it('starts with empty state', () => {
    const { result } = renderHook(() => useSchoolSearch())
    expect(result.current.query).toBe('')
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(false)
  })

  it('does not fetch when query is fewer than 3 characters', () => {
    const fetchSpy = mockFetchOnce(MOCK_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('sa') })
    act(() => { jest.runAllTimers() })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('clears results when query drops below 3 characters', async () => {
    mockFetchOnce(MOCK_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })
    await waitFor(() => expect(result.current.results).toHaveLength(2))

    act(() => { result.current.setQuery('sa') })
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('fetches after 500ms debounce and returns mapped results', async () => {
    const fetchSpy = mockFetchOnce(MOCK_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    expect(result.current.loading).toBe(false) // debounce not yet fired

    act(() => { jest.advanceTimersByTime(500) })
    expect(result.current.loading).toBe(true) // fetch fired, not yet resolved

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.results).toHaveLength(2)
    })

    expect(result.current.results[0]).toEqual({
      name: 'San Beda University',
      subtitle: 'Mendiola, Manila, Philippines',
    })

    const body = JSON.parse((fetchSpy.mock.calls[0] as any[])[1].body)
    expect(body.input).toBe('san')
    expect(body.includedRegionCodes).toEqual(['ph'])
  })

  it('cancels previous debounce when query changes rapidly', () => {
    const fetchSpy = mockFetchOnce(MOCK_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(200) })
    act(() => { result.current.setQuery('santa') })
    act(() => { jest.runAllTimers() })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchSpy.mock.calls[0] as any[])[1].body)
    expect(body.input).toBe('santa') // only 'santa' fired, not 'san'
  })

  it('sets error=true on fetch rejection', async () => {
    jest.spyOn(global, 'fetch' as never).mockRejectedValueOnce(new Error('network error'))
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => {
      expect(result.current.error).toBe(true)
      expect(result.current.loading).toBe(false)
      expect(result.current.results).toEqual([])
    })
  })

  it('sets error=true on non-OK HTTP response', async () => {
    mockFetchOnce({}, false)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => expect(result.current.error).toBe(true))
  })

  it('retry re-fires the last query and clears error on success', async () => {
    jest.spyOn(global, 'fetch' as never)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_RESPONSE) } as Response)

    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })
    await waitFor(() => expect(result.current.error).toBe(true))

    act(() => { result.current.retry() })
    expect(result.current.loading).toBe(true) // retry fired fetch immediately

    await waitFor(() => {
      expect(result.current.error).toBe(false)
      expect(result.current.results).toHaveLength(2)
    })
  })

  it('ignores stale response when a newer query overwrites the active query', async () => {
    // First fetch resolves slowly (after second fetch completes)
    let resolveFirst!: (value: Response) => void
    const firstFetch = new Promise<Response>(resolve => { resolveFirst = resolve })

    jest.spyOn(global, 'fetch' as never)
      .mockReturnValueOnce(firstFetch as any) // 'san' — slow
      .mockResolvedValueOnce({               // 'santa' — fast
        ok: true,
        json: () => Promise.resolve({
          suggestions: [{
            placePrediction: {
              structuredFormat: {
                mainText: { text: 'Santa School' },
                secondaryText: { text: 'Metro Manila, Philippines' },
              },
            },
          }],
        }),
      } as Response)

    const { result } = renderHook(() => useSchoolSearch())

    // Fire 'san' — goes directly (no debounce since we call fetchResults manually via setQuery + timers)
    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(500) }) // fire debounce for 'san'

    // Before 'san' resolves, type 'santa' (new debounce)
    act(() => { result.current.setQuery('santa') })
    act(() => { jest.advanceTimersByTime(500) }) // fire debounce for 'santa'

    // 'santa' resolves first
    await waitFor(() => expect(result.current.results).toHaveLength(1))
    expect(result.current.results[0]?.name).toBe('Santa School')

    // Now resolve the slow 'san' fetch — its result must be discarded
    await act(async () => {
      resolveFirst({
        ok: true,
        json: () => Promise.resolve({
          suggestions: [{
            placePrediction: {
              structuredFormat: {
                mainText: { text: 'San Beda University' },
                secondaryText: { text: 'Mendiola, Manila, Philippines' },
              },
            },
          }],
        }),
      } as Response)
    })

    // Results must still reflect 'santa', not 'san'
    expect(result.current.results[0]?.name).toBe('Santa School')
    expect(result.current.results).toHaveLength(1)
  })
})
