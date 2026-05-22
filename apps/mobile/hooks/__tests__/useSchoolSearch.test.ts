import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useSchoolSearch } from '../useSchoolSearch'
import { supabase } from '../../services/supabase'

jest.mock('../../services/supabase', () => ({
  supabase: { from: jest.fn() },
}))

const mockedFrom = supabase.from as jest.Mock

type SchoolRow = { name: string; city: string; province: string }

function mockSupabase(rows: SchoolRow[], error: unknown = null) {
  mockedFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      ilike: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: rows, error }),
      }),
    }),
  })
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
    mockSupabase([
      { name: 'San Beda University', city: 'Manila', province: 'Metro Manila' },
      { name: 'San Juan Integrated School', city: 'San Juan', province: 'Metro Manila' },
    ])
    const fetchSpy = jest.spyOn(global, 'fetch')
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(result.current.results[0]).toEqual({ name: 'San Beda University', subtitle: 'Manila, Metro Manila' })
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
})
