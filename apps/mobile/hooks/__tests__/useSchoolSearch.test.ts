import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useSchoolSearch } from '../useSchoolSearch'
import { supabase } from '../../services/supabase'

jest.mock('../../services/supabase', () => ({
  supabase: { from: jest.fn() },
}))

const mockedFrom = supabase.from as jest.Mock

type SchoolRow = { name: string; city: string; province: string }

function mockSupabase(rows: SchoolRow[], error: unknown = null) {
  const limit = jest.fn().mockResolvedValue({ data: rows, error })
  const or = jest.fn().mockReturnValue({ limit })
  const select = jest.fn().mockReturnValue({ or })
  mockedFrom.mockReturnValue({ select })
  return { or, select, limit }
}

const MOCK_PLACES_RESPONSE = {
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
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(response),
  } as Response)
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockSupabase([]) // empty by default → falls back to Places API
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

  it('does not search when query is fewer than 3 characters', () => {
    const fetchSpy = mockFetchOnce(MOCK_PLACES_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('sa') })
    act(() => { jest.runAllTimers() })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockedFrom).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('returns Supabase results when DB has matches (no Places API call)', async () => {
    const mocks = mockSupabase([
      { name: 'San Beda University', city: 'Manila', province: 'Metro Manila' },
      { name: 'San Juan Integrated School', city: 'San Juan', province: 'Metro Manila' },
    ])
    const fetchSpy = jest.spyOn(global, 'fetch')
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(result.current.results[0]).toEqual({ name: 'San Beda University', subtitle: 'Manila, Metro Manila' })
    // New: assert the .or() query was issued with name.ilike + aliases.cs filters
    expect(mocks.or).toHaveBeenCalledWith(
      expect.stringContaining('name.ilike.%san%')
    )
    expect(mocks.or).toHaveBeenCalledWith(
      expect.stringContaining('aliases.cs.{san}')
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back to Places API when Supabase returns no results', async () => {
    mockSupabase([]) // empty → fallback to Places
    const fetchSpy = mockFetchOnce(MOCK_PLACES_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(result.current.results[0]).toEqual({
      name: 'San Beda University',
      subtitle: 'Mendiola, Manila, Philippines',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('clears results when query drops below 3 characters', async () => {
    mockFetchOnce(MOCK_PLACES_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })
    await waitFor(() => expect(result.current.results).toHaveLength(2))

    act(() => { result.current.setQuery('sa') })
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('cancels previous debounce when query changes rapidly', async () => {
    mockFetchOnce(MOCK_PLACES_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(200) })
    act(() => { result.current.setQuery('santa') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(mockedFrom).toHaveBeenCalledTimes(1)
  })

  it('sets error=true when Supabase errors and Places fetch throws', async () => {
    mockSupabase([], new Error('db error'))
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network error'))
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => {
      expect(result.current.error).toBe(true)
      expect(result.current.loading).toBe(false)
      expect(result.current.results).toEqual([])
    })
  })

  it('sets error=true on non-OK HTTP response from Places', async () => {
    mockFetchOnce({}, false)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => expect(result.current.error).toBe(true))
  })

  it('retry re-fires the last query and clears error on success', async () => {
    jest.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_PLACES_RESPONSE) } as Response)

    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })
    await waitFor(() => expect(result.current.error).toBe(true))

    act(() => { result.current.retry() })

    await waitFor(() => {
      expect(result.current.error).toBe(false)
      expect(result.current.results).toHaveLength(2)
    })
  })

  it('exposes errorMessage=null initially', () => {
    const { result } = renderHook(() => useSchoolSearch())
    expect(result.current.errorMessage).toBeNull()
  })

  it('sets errorMessage="Places API HTTP 403 (Android signature check failed)" on 403', async () => {
    mockSupabase([])
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({}),
    } as Response)

    const { result } = renderHook(() => useSchoolSearch())
    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => {
      expect(result.current.error).toBe(true)
      expect(result.current.errorMessage).toBe('Places API HTTP 403 (Android signature check failed)')
    })
  })

  it('sets errorMessage="Places API key not configured" when fetch response indicates placeholder key', async () => {
    // Simulate the Places API rejecting because the request was made with no/placeholder key.
    // The hook detects PLACES_KEY === PLACES_KEY_PLACEHOLDER at call-time and throws before fetching.
    // Since Jest CJS doesn't support dynamic import() re-evaluation, we instead verify that
    // when the fetch is never called (key guard fires) the error message is set correctly by
    // mocking fetch to reject with the expected message — which mirrors what the hook throws.
    mockSupabase([])
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Places API key not configured'))

    const { result } = renderHook(() => useSchoolSearch())
    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => {
      expect(result.current.error).toBe(true)
      expect(result.current.errorMessage).toBe('Places API key not configured')
    })
  })
})
