import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useSchoolPicker } from '../useSchoolPicker'

// ── Drizzle mock ──────────────────────────────────────────────────────────────
// Mocked inside factory so hoisting works correctly.

const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
}

jest.mock('../useDb', () => ({
  useDb: () => mockDb,
}))

// ── Supabase mock ─────────────────────────────────────────────────────────────
// supabase.ts throws at init if env vars are missing; jest.setup.ts sets them,
// but we override the whole module anyway to avoid @supabase/supabase-js init.

const mockSupabase = { from: jest.fn() }

jest.mock('../../services/supabase', () => ({
  get supabase() {
    return mockSupabase
  },
}))

// ── Constants ─────────────────────────────────────────────────────────────────

const REGION_ROWS = [{ region: 'NCR' }, { region: 'Region I' }]
const SCHOOL_ROWS = [
  { region: 'NCR', province: 'Metro Manila', city: 'Manila', name: 'School A' },
  { region: 'NCR', province: 'Metro Manila', city: 'Makati City', name: 'School B' },
]

// ── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Wire supabase.from to handle school_regions queries.
 * supabase.from('school_regions').select('region').order('region')
 */
function setupRegionsFetch(result: { data: any; error: any }) {
  const order = jest.fn().mockResolvedValue(result)
  const select = jest.fn().mockReturnValue({ order })
  mockSupabase.from.mockReturnValue({ select })
  return { order, select }
}

/**
 * Wire supabase.from to route by table name:
 * - school_regions → regionsResult
 * - schools → schoolsResult
 */
function setupBothFetches(
  regionsResult: { data: any; error: any },
  schoolsResult: { data: any; error: any },
) {
  const regionsOrder = jest.fn().mockResolvedValue(regionsResult)
  const regionsSelect = jest.fn().mockReturnValue({ order: regionsOrder })

  const schoolsOrder = jest.fn().mockResolvedValue(schoolsResult)
  const schoolsEq = jest.fn().mockReturnValue({ order: schoolsOrder })
  const schoolsSelect = jest.fn().mockReturnValue({ eq: schoolsEq })

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'school_regions') return { select: regionsSelect }
    return { select: schoolsSelect }
  })

  return { regionsOrder, schoolsOrder, schoolsEq, schoolsSelect }
}

/**
 * Wire db.select chain: db.select().from().where().limit(1) → rows
 */
function setupCacheSelect(rows: any[]) {
  const limit = jest.fn().mockResolvedValue(rows)
  const where = jest.fn().mockReturnValue({ limit })
  const from = jest.fn().mockReturnValue({ where })
  mockDb.select.mockReturnValue({ from })
  return { limit, where, from }
}

/**
 * Wire db.insert chain: db.insert().values().onConflictDoUpdate() → resolves
 */
function setupCacheInsert() {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined)
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate })
  mockDb.insert.mockReturnValue({ values })
  return { onConflictDoUpdate, values }
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSchoolPicker hook', () => {
  describe('initial region load', () => {
    it('loads region list from Supabase on mount', async () => {
      setupRegionsFetch({ data: REGION_ROWS, error: null })
      setupCacheSelect([]) // not used on mount but avoid undefined errors

      const { result } = renderHook(() => useSchoolPicker())

      await waitFor(() => {
        expect(result.current.list).toEqual(['NCR', 'Region I'])
      })

      expect(result.current.level).toBe('region')
      expect(result.current.error).toBeNull()
    })

    it('sets error when Supabase fails', async () => {
      setupRegionsFetch({ data: null, error: { message: 'network error' } })

      const { result } = renderHook(() => useSchoolPicker())

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })

      expect(result.current.list).toEqual([])
    })
  })

  describe('selectRegion — cache hit', () => {
    it('reads from SQLite cache when data is within TTL', async () => {
      // Regions fetch succeeds
      const regionsOrder = jest.fn().mockResolvedValue({ data: REGION_ROWS, error: null })
      const regionsSelect = jest.fn().mockReturnValue({ order: regionsOrder })
      let schoolsFromCallCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'school_regions') return { select: regionsSelect }
        schoolsFromCallCount++
        return { select: jest.fn() }
      })

      // Cache: valid row within TTL (1 day ago)
      const cachedAt = Date.now() - 1 * 24 * 60 * 60 * 1000
      setupCacheSelect([{ region: 'NCR', data: JSON.stringify(SCHOOL_ROWS), cachedAt }])
      setupCacheInsert()

      const { result } = renderHook(() => useSchoolPicker())
      await waitFor(() => expect(result.current.list).toEqual(['NCR', 'Region I']))

      await act(async () => {
        await result.current.selectRegion('NCR')
      })

      expect(schoolsFromCallCount).toBe(0) // Supabase NOT called for schools
      expect(result.current.level).toBe('province')
      expect(result.current.list).toContain('Metro Manila')
    })
  })

  describe('selectRegion — cache miss', () => {
    it('fetches from Supabase and writes cache when TTL expired', async () => {
      const expiredCachedAt = Date.now() - 31 * 24 * 60 * 60 * 1000
      setupCacheSelect([{ region: 'NCR', data: JSON.stringify([]), cachedAt: expiredCachedAt }])
      const { schoolsOrder } = setupBothFetches(
        { data: REGION_ROWS, error: null },
        { data: SCHOOL_ROWS, error: null },
      )
      const { onConflictDoUpdate } = setupCacheInsert()

      const { result } = renderHook(() => useSchoolPicker())
      await waitFor(() => expect(result.current.list).toEqual(['NCR', 'Region I']))

      await act(async () => {
        await result.current.selectRegion('NCR')
      })

      expect(schoolsOrder).toHaveBeenCalled() // Supabase schools fetch called
      expect(onConflictDoUpdate).toHaveBeenCalled() // cache written
      expect(result.current.level).toBe('province')
      expect(result.current.list).toContain('Metro Manila')
    })

    it('fetches from Supabase when no cache row exists', async () => {
      setupCacheSelect([]) // no cache row
      const { schoolsOrder } = setupBothFetches(
        { data: REGION_ROWS, error: null },
        { data: SCHOOL_ROWS, error: null },
      )
      const { onConflictDoUpdate } = setupCacheInsert()

      const { result } = renderHook(() => useSchoolPicker())
      await waitFor(() => expect(result.current.list).toEqual(['NCR', 'Region I']))

      await act(async () => {
        await result.current.selectRegion('NCR')
      })

      expect(schoolsOrder).toHaveBeenCalled()
      expect(onConflictDoUpdate).toHaveBeenCalled()
      expect(result.current.level).toBe('province')
    })
  })

  describe('selectRegion — error', () => {
    it('sets error when Supabase school fetch fails', async () => {
      setupCacheSelect([]) // no cache
      setupBothFetches(
        { data: REGION_ROWS, error: null },
        { data: null, error: { message: 'fail' } },
      )
      setupCacheInsert()

      const { result } = renderHook(() => useSchoolPicker())
      await waitFor(() => expect(result.current.list).toEqual(['NCR', 'Region I']))

      await act(async () => {
        await result.current.selectRegion('NCR')
      })

      expect(result.current.error).toBeTruthy()
    })
  })

  describe('cascade', () => {
    /** Helper: get a hook already at the province level for NCR. */
    async function hookAtProvince() {
      const cachedAt = Date.now() - 1 * 24 * 60 * 60 * 1000
      setupCacheSelect([{ region: 'NCR', data: JSON.stringify(SCHOOL_ROWS), cachedAt }])
      setupCacheInsert()
      setupRegionsFetch({ data: REGION_ROWS, error: null })

      const { result } = renderHook(() => useSchoolPicker())
      await waitFor(() => expect(result.current.list).toEqual(['NCR', 'Region I']))

      await act(async () => {
        await result.current.selectRegion('NCR')
      })

      return result
    }

    it('selectProvince advances level and filters cities', async () => {
      const result = await hookAtProvince()

      act(() => {
        result.current.selectProvince('Metro Manila')
      })

      expect(result.current.level).toBe('city')
      expect(result.current.selectedProvince).toBe('Metro Manila')
      expect(result.current.list).toEqual(expect.arrayContaining(['Manila', 'Makati City']))
    })

    it('selectCity advances level to school', async () => {
      const result = await hookAtProvince()

      act(() => { result.current.selectProvince('Metro Manila') })
      act(() => { result.current.selectCity('Manila') })

      expect(result.current.level).toBe('school')
      expect(result.current.selectedCity).toBe('Manila')
      expect(result.current.list).toEqual(['School A'])
    })
  })

  describe('jumpToLevel', () => {
    async function hookAtCity() {
      const cachedAt = Date.now() - 1 * 24 * 60 * 60 * 1000
      setupCacheSelect([{ region: 'NCR', data: JSON.stringify(SCHOOL_ROWS), cachedAt }])
      setupCacheInsert()
      setupRegionsFetch({ data: REGION_ROWS, error: null })

      const { result } = renderHook(() => useSchoolPicker())
      await waitFor(() => expect(result.current.list).toEqual(['NCR', 'Region I']))
      await act(async () => { await result.current.selectRegion('NCR') })
      act(() => { result.current.selectProvince('Metro Manila') })
      act(() => { result.current.selectCity('Manila') })

      return result
    }

    it('jumping to region clears province, city, and schools', async () => {
      const result = await hookAtCity()

      act(() => { result.current.jumpToLevel('region') })

      expect(result.current.level).toBe('region')
      expect(result.current.selectedRegion).toBeNull()
      expect(result.current.selectedProvince).toBeNull()
      expect(result.current.selectedCity).toBeNull()
      expect(result.current.list).toEqual(['NCR', 'Region I'])
    })

    it('jumping to province clears city', async () => {
      const result = await hookAtCity()

      act(() => { result.current.jumpToLevel('province') })

      expect(result.current.level).toBe('province')
      expect(result.current.selectedRegion).toBe('NCR')
      expect(result.current.selectedProvince).toBeNull()
      expect(result.current.selectedCity).toBeNull()
    })
  })

  describe('reset', () => {
    it('clears all state and returns to region list', async () => {
      const cachedAt = Date.now() - 1 * 24 * 60 * 60 * 1000
      setupCacheSelect([{ region: 'NCR', data: JSON.stringify(SCHOOL_ROWS), cachedAt }])
      setupCacheInsert()
      setupRegionsFetch({ data: REGION_ROWS, error: null })

      const { result } = renderHook(() => useSchoolPicker())
      await waitFor(() => expect(result.current.list).toEqual(['NCR', 'Region I']))
      await act(async () => { await result.current.selectRegion('NCR') })
      act(() => { result.current.selectProvince('Metro Manila') })

      act(() => { result.current.reset() })

      expect(result.current.level).toBe('region')
      expect(result.current.selectedRegion).toBeNull()
      expect(result.current.selectedProvince).toBeNull()
      expect(result.current.selectedCity).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.list).toEqual(['NCR', 'Region I'])
    })
  })

  describe('retryLoadRegions', () => {
    it('re-triggers loadRegions when called', async () => {
      // First call fails, second call succeeds
      const order = jest.fn()
        .mockResolvedValueOnce({ data: null, error: { message: 'network error' } })
        .mockResolvedValueOnce({ data: REGION_ROWS, error: null })
      const select = jest.fn().mockReturnValue({ order })
      mockSupabase.from.mockReturnValue({ select })

      const { result } = renderHook(() => useSchoolPicker())

      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })

      expect(result.current.list).toEqual([])

      act(() => {
        result.current.retryLoadRegions()
      })

      await waitFor(() => {
        expect(result.current.list).toEqual(['NCR', 'Region I'])
      })

      expect(result.current.error).toBeNull()
    })
  })
})
