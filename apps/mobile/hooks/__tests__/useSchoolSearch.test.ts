import { renderHook, act, waitFor } from '@testing-library/react-native'
import {
  useSchoolSearch,
  buildFuzzyPattern,
  parseSubtitle,
  contributeSchool,
  MIN_QUERY_LENGTH,
} from '../useSchoolSearch'
import { supabase } from '../../services/supabase'

jest.mock('../../services/supabase', () => ({
  supabase: { from: jest.fn() },
}))

const mockedFrom = supabase.from as jest.Mock

type SchoolRow = { name: string; city: string; province: string }

function mockSupabaseSelect(rows: SchoolRow[], error: unknown = null) {
  const limit = jest.fn().mockResolvedValue({ data: rows, error })
  const ilike = jest.fn().mockReturnValue({ limit })
  const select = jest.fn().mockReturnValue({ ilike })
  const upsert = jest.fn().mockResolvedValue({ data: null, error: null })
  mockedFrom.mockReturnValue({ select, upsert })
  return { ilike, select, limit, upsert }
}

const MOCK_PLACES_RESPONSE = {
  suggestions: [
    {
      name: 'San Beda University',
      subtitle: 'Mendiola, Manila, Philippines',
      source: 'places' as const,
    },
    {
      name: 'San Juan National High School',
      subtitle: 'San Juan, Metro Manila, Philippines',
      source: 'places' as const,
    },
  ],
}

function mockFetchOnce(response: object, ok = true, status = 200) {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(response),
  } as Response)
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockSupabaseSelect([])
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('buildFuzzyPattern', () => {
  it('returns empty for empty/whitespace input', () => {
    expect(buildFuzzyPattern('')).toBe('')
    expect(buildFuzzyPattern('   ')).toBe('')
  })

  it('wraps single word in %s', () => {
    expect(buildFuzzyPattern('san')).toBe('%san%')
  })

  it('joins multi-word queries with %s for word-order-flexible fuzzy match', () => {
    expect(buildFuzzyPattern('san beda')).toBe('%san%beda%')
    expect(buildFuzzyPattern('university  of   the   philippines')).toBe('%university%of%the%philippines%')
  })

  it('lowercases the query', () => {
    expect(buildFuzzyPattern('San Beda')).toBe('%san%beda%')
  })

  it('escapes ILIKE metacharacters in user input', () => {
    expect(buildFuzzyPattern('50%')).toBe('%50\\%%')
    expect(buildFuzzyPattern('a_b')).toBe('%a\\_b%')
  })
})

describe('parseSubtitle', () => {
  it('extracts city/province and strips Philippines suffix', () => {
    expect(parseSubtitle('Mendiola, Manila, Philippines')).toEqual({ city: 'Mendiola', province: 'Manila' })
    expect(parseSubtitle('San Juan, Metro Manila, Philippines')).toEqual({ city: 'San Juan', province: 'Metro Manila' })
  })

  it('returns empty province when only city given', () => {
    expect(parseSubtitle('Quezon City')).toEqual({ city: 'Quezon City', province: '' })
    expect(parseSubtitle('Quezon City, Philippines')).toEqual({ city: 'Quezon City', province: '' })
  })

  it('returns empty fields for empty input', () => {
    expect(parseSubtitle('')).toEqual({ city: '', province: '' })
  })
})

describe('contributeSchool', () => {
  it('does NOT insert when source is "database" (already in DB)', async () => {
    const mocks = mockSupabaseSelect([])
    await contributeSchool({ name: 'San Beda', subtitle: 'Manila', source: 'database' })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('does NOT insert when name is blank', async () => {
    const mocks = mockSupabaseSelect([])
    await contributeSchool({ name: '   ', subtitle: '', source: 'manual' })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('upserts a "manual" entry with parsed (empty) location and source="manual"', async () => {
    const mocks = mockSupabaseSelect([])
    await contributeSchool({ name: 'My Custom School', subtitle: '', source: 'manual' })
    expect(mocks.upsert).toHaveBeenCalledWith(
      { name: 'My Custom School', city: '', province: '', region: '', source: 'manual' },
      { onConflict: 'name,city', ignoreDuplicates: true },
    )
  })

  it('upserts a "places" entry with city/province parsed from subtitle', async () => {
    const mocks = mockSupabaseSelect([])
    await contributeSchool({
      name: 'San Beda University',
      subtitle: 'Mendiola, Manila, Philippines',
      source: 'places',
    })
    expect(mocks.upsert).toHaveBeenCalledWith(
      { name: 'San Beda University', city: 'Mendiola', province: 'Manila', region: '', source: 'places' },
      { onConflict: 'name,city', ignoreDuplicates: true },
    )
  })

  it('swallows upsert errors so callers never see a thrown rejection', async () => {
    const upsert = jest.fn().mockResolvedValue({ data: null, error: { message: 'rls', code: '42501' } })
    mockedFrom.mockReturnValue({ upsert })
    await expect(
      contributeSchool({ name: 'X', subtitle: '', source: 'manual' }),
    ).resolves.toBeUndefined()
  })
})

describe('useSchoolSearch', () => {
  it('starts with empty state', () => {
    const { result } = renderHook(() => useSchoolSearch())
    expect(result.current.query).toBe('')
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(false)
  })

  it(`does not search when query is shorter than MIN_QUERY_LENGTH (${MIN_QUERY_LENGTH})`, () => {
    const fetchSpy = mockFetchOnce(MOCK_PLACES_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('a') })
    act(() => { jest.runAllTimers() })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockedFrom).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('searches at the MIN_QUERY_LENGTH threshold', async () => {
    const mocks = mockSupabaseSelect([
      { name: 'Adamson University', city: 'Manila', province: 'Metro Manila' },
    ])
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('ad') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(1))
    expect(mocks.ilike).toHaveBeenCalledWith('name', '%ad%')
  })

  it('returns Supabase results when DB has matches (no Places API call)', async () => {
    mockSupabaseSelect([
      { name: 'San Juan Integrated School', city: 'San Juan', province: 'Metro Manila' },
      { name: 'San Beda University', city: 'Manila', province: 'Metro Manila' },
    ])
    const fetchSpy = jest.spyOn(global, 'fetch')
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(result.current.results.every(r => r.source === 'database')).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ranks results starting with the query before substring matches, then by name length', async () => {
    mockSupabaseSelect([
      { name: 'University of San Beda', city: 'X', province: 'Y' },
      { name: 'San Beda University Mendiola', city: 'X', province: 'Y' },
      { name: 'San Beda College', city: 'X', province: 'Y' },
    ])
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(3))
    expect(result.current.results[0]!.name).toBe('San Beda College')
    expect(result.current.results[1]!.name).toBe('San Beda University Mendiola')
    expect(result.current.results[2]!.name).toBe('University of San Beda')
  })

  it('issues a fuzzy multi-word ILIKE pattern for queries with spaces', async () => {
    const mocks = mockSupabaseSelect([
      { name: 'San Beda University', city: 'Manila', province: 'Metro Manila' },
    ])
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san beda') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(1))
    expect(mocks.ilike).toHaveBeenCalledWith('name', '%san%beda%')
  })

  it('falls back to Places API when Supabase returns no results', async () => {
    mockSupabaseSelect([])
    const fetchSpy = mockFetchOnce(MOCK_PLACES_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(500) })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(result.current.results[0]).toEqual({
      name: 'San Beda University',
      subtitle: 'Mendiola, Manila, Philippines',
      source: 'places',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/places/school-search?q='),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('clears results when query drops below MIN_QUERY_LENGTH', async () => {
    mockFetchOnce(MOCK_PLACES_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })
    await waitFor(() => expect(result.current.results).toHaveLength(2))

    act(() => { result.current.setQuery('a') })
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('cancels previous debounce when query changes rapidly', async () => {
    mockFetchOnce(MOCK_PLACES_RESPONSE)
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.advanceTimersByTime(100) })
    act(() => { result.current.setQuery('santa') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(mockedFrom).toHaveBeenCalledTimes(1)
  })

  it('does NOT surface error when DB returns empty and Places also fails (graceful fallback)', async () => {
    mockSupabaseSelect([])
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network error'))
    const { result } = renderHook(() => useSchoolSearch())

    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(false)
    expect(result.current.results).toEqual([])
  })

  it('exposes contributeSchool function from the hook', () => {
    const { result } = renderHook(() => useSchoolSearch())
    expect(typeof result.current.contributeSchool).toBe('function')
  })
})
