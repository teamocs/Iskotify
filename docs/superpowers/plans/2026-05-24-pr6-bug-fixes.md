# PR 6 Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four bundled bug fixes shipped as one OTA plus one Supabase migration — school picker (aliases + smarter search + better error surfacing), Storage Access Framework export on Android, theme-aware accent text color, listing-detail focus button sizing.

**Architecture:** One non-destructive Supabase migration (column add + 25 INSERTs). Hook + service rewrites preserve their public shapes (small additions: `errorMessage` on the schools hook, `ExportResult` return type on export). Mass mechanical swap of one color literal across 11 files. UI tweak on listing detail.

**Tech Stack:** TypeScript strict, Supabase (Postgres + Drizzle on client), React Native 0.81 / Expo SDK 54, `expo-file-system/legacy` Storage Access Framework, `react-native-keyboard-controller`, Jest with jest-expo.

**Spec:** `docs/superpowers/specs/2026-05-24-pr6-bug-fixes-design.md`

---

## File Structure

**Database (NEW migration, applied via MCP):**
- `aliases TEXT[]` column on `schools` table + GIN index + 25 INSERTs.

**Modified source files (~14):**
- `apps/mobile/hooks/useSchoolSearch.ts` — query name + aliases; specific Places error messages; expose `errorMessage`.
- `apps/mobile/components/SchoolPicker.tsx` — display `errorMessage` from hook + color swap.
- `apps/mobile/services/export.ts` — SAF on Android, share-sheet on iOS, return `ExportResult`.
- `apps/mobile/app/(tabs)/profile.tsx` — handle `ExportResult` + color swap.
- `apps/mobile/theme/tokens.ts` — add `accentText`; delete `statusColors.pink`.
- `apps/mobile/components/AiModelBanner.tsx` — color swap (5).
- `apps/mobile/app/(tabs)/analytics.tsx` — color swap (4).
- `apps/mobile/app/(tabs)/index.tsx` — color swap (8).
- `apps/mobile/app/(tabs)/listings.tsx` — color swap (2).
- `apps/mobile/app/(tabs)/practice.tsx` — color swap (1).
- `apps/mobile/app/about.tsx` — color swap (1).
- `apps/mobile/app/help.tsx` — color swap (1).
- `apps/mobile/app/landing.tsx` — color swap (1).
- `apps/mobile/app/listings/[slug].tsx` — focus button sizing + color swap (2).

**Modified test files (2):**
- `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts` — update Supabase mock for `.or()` query; add alias-match test; add error-message tests.
- `apps/mobile/services/__tests__/export.test.ts` — full rewrite for SAF Android path + share iOS path + cancelled status (also fixes the pre-existing baseline failure).

**Modified config (1):**
- `apps/mobile/eas.json` — replace `FILL_IN_YOUR_GOOGLE_PLACES_API_KEY` placeholder reference with proper EAS env-var pattern.

---

## Task 1: Apply Supabase migration

**Owner:** Controller (uses `mcp__supabase__apply_migration` directly, NOT a subagent — MCP tools aren't available inside subagents).

**Files:**
- None on disk. Migration is applied directly to Supabase project `dtugrsbarruizgzowgso` (`Iskotify App`).

- [ ] **Step 1: Apply the migration via MCP**

Run via the Supabase MCP tool `mcp__supabase__apply_migration` with the name `add_aliases_and_seed_universities` and this SQL body:

```sql
ALTER TABLE schools ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS schools_aliases_idx ON schools USING GIN (aliases);

INSERT INTO schools (region, province, city, name, deped_id, aliases) VALUES
  ('NCR', 'Metro Manila', 'Quezon City', 'University of the Philippines Diliman', NULL, ARRAY['up', 'up diliman', 'upd']),
  ('CALABARZON', 'Laguna', 'Los Baños', 'University of the Philippines Los Baños', NULL, ARRAY['uplb', 'up los baños', 'up los banos']),
  ('NCR', 'Metro Manila', 'Manila', 'University of the Philippines Manila', NULL, ARRAY['upm', 'up manila']),
  ('Western Visayas', 'Iloilo', 'Miagao', 'University of the Philippines Visayas', NULL, ARRAY['upv', 'up visayas']),
  ('Central Visayas', 'Cebu', 'Cebu City', 'University of the Philippines Cebu', NULL, ARRAY['upceb', 'up cebu']),
  ('Davao Region', 'Davao del Sur', 'Davao City', 'University of the Philippines Mindanao', NULL, ARRAY['upmin', 'up mindanao']),
  ('NCR', 'Metro Manila', 'Diliman', 'Philippine Science High School - Main Campus', NULL, ARRAY['pshs', 'pisay', 'pshs main']),
  ('Central Luzon', 'Pampanga', 'Clark Freeport Zone', 'Philippine Science High School - Central Luzon Campus', NULL, ARRAY['pshs cl', 'pisay clark']),
  ('CALABARZON', 'Cavite', 'Dasmariñas', 'Philippine Science High School - CALABARZON Region Campus', NULL, ARRAY['pshs calabarzon', 'pisay cavite']),
  ('NCR', 'Metro Manila', 'Manila', 'De La Salle University', NULL, ARRAY['dlsu', 'la salle', 'dlsu manila']),
  ('NCR', 'Metro Manila', 'Quezon City', 'Ateneo de Manila University', NULL, ARRAY['admu', 'ateneo', 'ateneo manila']),
  ('NCR', 'Metro Manila', 'Manila', 'University of Santo Tomas', NULL, ARRAY['ust', 'santo tomas']),
  ('NCR', 'Metro Manila', 'Manila', 'Far Eastern University - Manila', NULL, ARRAY['feu', 'far eastern']),
  ('NCR', 'Metro Manila', 'Manila', 'Mapúa University', NULL, ARRAY['mapua', 'mapúa']),
  ('NCR', 'Metro Manila', 'Sampaloc', 'Polytechnic University of the Philippines - Manila', NULL, ARRAY['pup', 'pup manila']),
  ('NCR', 'Metro Manila', 'Manila', 'Pamantasan ng Lungsod ng Maynila', NULL, ARRAY['plm']),
  ('NCR', 'Metro Manila', 'Manila', 'Adamson University', NULL, ARRAY['adu', 'adamson']),
  ('NCR', 'Metro Manila', 'Manila', 'National University - Manila', NULL, ARRAY['nu', 'nu manila']),
  ('NCR', 'Metro Manila', 'Manila', 'University of the East - Manila', NULL, ARRAY['ue', 'ue manila']),
  ('NCR', 'Metro Manila', 'Caloocan', 'University of the East - Caloocan', NULL, ARRAY['ue caloocan']),
  ('NCR', 'Metro Manila', 'Manila', 'San Beda University - Manila', NULL, ARRAY['san beda', 'sbu']),
  ('NCR', 'Metro Manila', 'Manila', 'Centro Escolar University - Manila', NULL, ARRAY['ceu', 'centro escolar']),
  ('NCR', 'Metro Manila', 'Manila', 'Lyceum of the Philippines University - Manila', NULL, ARRAY['lpu', 'lyceum']),
  ('NCR', 'Metro Manila', 'Mandaluyong', 'De La Salle - College of Saint Benilde', NULL, ARRAY['benilde', 'csb', 'dls-csb']),
  ('NCR', 'Metro Manila', 'Manila', 'Saint Paul University Manila', NULL, ARRAY['spu', 'saint paul'])
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verify the migration via MCP `execute_sql`**

Run this SELECT to verify schools were inserted and aliases column exists:
```sql
SELECT name, aliases FROM schools WHERE 'uplb' = ANY(aliases) OR 'pshs' = ANY(aliases) LIMIT 3;
```
Expected: 3 rows for UPLB + 3 PSHS campuses. If empty, migration didn't apply.

---

## Task 2: Rewrite `useSchoolSearch` — name + aliases query, specific error messages

**Files:**
- Modify: `apps/mobile/hooks/useSchoolSearch.ts`
- Modify: `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts`

TDD: update tests first to assert the new query shape + error messages, watch them fail, then update the hook.

- [ ] **Step 1: Update the test file's Supabase mock to assert the new `.or()` query shape**

Open `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts`. Replace the existing `mockSupabase` function (current lines 13-21) with:

```ts
function mockSupabase(rows: SchoolRow[], error: unknown = null) {
  const limit = jest.fn().mockResolvedValue({ data: rows, error })
  const or = jest.fn().mockReturnValue({ limit })
  const select = jest.fn().mockReturnValue({ or })
  mockedFrom.mockReturnValue({ select })
  return { or, select, limit }
}
```

This returns the mock chain functions so tests can inspect what query was issued.

- [ ] **Step 2: Update the existing "returns Supabase results when DB has matches" test to verify the `.or()` query shape**

Find the test at line 83 (`'returns Supabase results when DB has matches (no Places API call)'`). Replace its body with:

```ts
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
```

- [ ] **Step 3: Add new tests for the `errorMessage` field and specific Places errors**

In the same file, add these tests at the end of the `describe('useSchoolSearch', ...)` block, right before its closing `})`:

```ts
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

  it('sets errorMessage="Places API key not configured" when key is the placeholder', async () => {
    // The placeholder string from eas.json ships when no real key is set
    const ORIG = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = 'FILL_IN_YOUR_GOOGLE_PLACES_API_KEY'
    jest.resetModules()
    const { useSchoolSearch: hook } = await import('../useSchoolSearch')

    mockSupabase([])
    const { result } = renderHook(() => hook())
    act(() => { result.current.setQuery('san') })
    act(() => { jest.runAllTimers() })

    await waitFor(() => {
      expect(result.current.error).toBe(true)
      expect(result.current.errorMessage).toBe('Places API key not configured')
    })

    process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = ORIG
  })
```

- [ ] **Step 4: Run failing tests**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=useSchoolSearch
```
Expected: FAIL — `errorMessage` not exported; `.or()` not called on the Supabase chain.

- [ ] **Step 5: Rewrite `useSchoolSearch.ts`**

Open `apps/mobile/hooks/useSchoolSearch.ts`. Replace the entire file content with:

```ts
import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../services/supabase'

const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete'
const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? ''
const PLACES_KEY_PLACEHOLDER = 'FILL_IN_YOUR_GOOGLE_PLACES_API_KEY'

export interface SchoolResult {
  name: string
  subtitle: string
}

export interface UseSchoolSearch {
  query: string
  setQuery: (q: string) => void
  results: SchoolResult[]
  loading: boolean
  error: boolean
  errorMessage: string | null
  retry: () => void
}

// Strip characters that could break Supabase's PostgREST .or() filter syntax
// (commas, parens, and the backtick-quote-like chars). The remaining string
// is safe inside `name.ilike.%X%` and `aliases.cs.{X}` filter clauses.
function sanitizeForOr(q: string): string {
  return q.replace(/[,()'"]/g, '').trim()
}

async function searchSupabase(q: string): Promise<SchoolResult[]> {
  const safe = sanitizeForOr(q)
  if (!safe) return []
  const qLower = safe.toLowerCase()
  const { data, error } = await supabase
    .from('schools')
    .select('name,city,province')
    .or(`name.ilike.%${safe}%,aliases.cs.{${qLower}}`)
    .limit(10)
  if (error || !data || data.length === 0) return []
  return data.map(s => ({
    name: s.name,
    subtitle: `${s.city}, ${s.province}`,
  }))
}

async function searchPlaces(q: string): Promise<SchoolResult[]> {
  if (!PLACES_KEY || PLACES_KEY === PLACES_KEY_PLACEHOLDER) {
    throw new Error('Places API key not configured')
  }
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': 'suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input: q,
      includedPrimaryTypes: ['school', 'secondary_school', 'university'],
      includedRegionCodes: ['ph'],
    }),
  })
  if (res.status === 403) throw new Error('Places API HTTP 403 (Android signature check failed)')
  if (res.status === 400) throw new Error('Places API HTTP 400 (bad request)')
  if (!res.ok) throw new Error(`Places API HTTP ${res.status}`)
  const json = await res.json() as {
    suggestions?: Array<{
      placePrediction: {
        structuredFormat: {
          mainText: { text: string }
          secondaryText: { text: string }
        }
      }
    }>
  }
  return (json.suggestions ?? []).map(s => ({
    name: s.placePrediction.structuredFormat.mainText.text,
    subtitle: s.placePrediction.structuredFormat.secondaryText.text,
  }))
}

export function useSchoolSearch(): UseSchoolSearch {
  const [query, setQueryState] = useState('')
  const [results, setResults] = useState<SchoolResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQueryRef = useRef('')
  const activeQueryRef = useRef('')

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const fetchResults = useCallback(async (q: string) => {
    activeQueryRef.current = q
    setLoading(true)
    setError(false)
    setErrorMessage(null)
    try {
      const dbResults = await searchSupabase(q)
      if (activeQueryRef.current !== q) return
      if (dbResults.length > 0) {
        setResults(dbResults)
        return
      }
      const placesResults = await searchPlaces(q)
      if (activeQueryRef.current !== q) return
      setResults(placesResults)
    } catch (err) {
      if (activeQueryRef.current !== q) return
      setError(true)
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      setResults([])
    } finally {
      if (activeQueryRef.current === q) setLoading(false)
    }
  }, [])

  const setQuery = useCallback((q: string) => {
    setQueryState(q)
    lastQueryRef.current = q
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 3) {
      setResults([])
      setLoading(false)
      setError(false)
      setErrorMessage(null)
      return
    }
    debounceRef.current = setTimeout(() => void fetchResults(q), 500)
  }, [fetchResults])

  const retry = useCallback(() => {
    if (lastQueryRef.current.length < 3) return
    void fetchResults(lastQueryRef.current)
  }, [fetchResults])

  return { query, setQuery, results, loading, error, errorMessage, retry }
}
```

Changes from the prior version:
- New constant `PLACES_KEY_PLACEHOLDER` and check inside `searchPlaces` so we detect the eas.json default-value bug at runtime.
- `sanitizeForOr` strips comma/paren/quote chars to safely interpolate into the `.or()` filter string.
- `searchSupabase` uses `.or('name.ilike.%X%,aliases.cs.{X}')` (chains both filters in one OR).
- `searchPlaces` throws specific messages for 403 / 400 / other HTTP errors.
- New `errorMessage` state field exposed in the return object.
- `setQuery` also clears `errorMessage` when query drops below 3 chars.

- [ ] **Step 6: Run tests to verify they pass**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=useSchoolSearch
```
Expected: all tests PASS.

- [ ] **Step 7: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/hooks/useSchoolSearch.ts apps/mobile/hooks/__tests__/useSchoolSearch.test.ts
git commit -m "fix(mobile): school search queries name+aliases; specific Places errors"
```

---

## Task 3: SchoolPicker — show `errorMessage` from hook

**Files:**
- Modify: `apps/mobile/components/SchoolPicker.tsx`

- [ ] **Step 1: Destructure `errorMessage` from the hook**

Open `apps/mobile/components/SchoolPicker.tsx`. Find the line that destructures the hook (around line 17):
```ts
const { query, setQuery, results, loading, error, retry } = useSchoolSearch()
```
Replace with:
```ts
const { query, setQuery, results, loading, error, errorMessage, retry } = useSchoolSearch()
```

- [ ] **Step 2: Display the errorMessage in the error UI**

Find the error block inside `renderBody` (around lines 129-138). The existing block is:
```tsx
    if (error) {
      return (
        <View style={{ alignItems: 'center', paddingTop: 24 }}>
          <Text style={s.errorText}>Could not search schools. Check your connection.</Text>
          <TouchableOpacity onPress={retry} style={s.retryBtn}>
            <Text style={[s.errorText, { color: '#fca5a5' }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )
    }
```
Replace with:
```tsx
    if (error) {
      return (
        <View style={{ alignItems: 'center', paddingTop: 24 }}>
          <Text style={s.errorText}>Could not search schools.</Text>
          {errorMessage && (
            <Text style={s.errorDetail}>{errorMessage}</Text>
          )}
          <TouchableOpacity onPress={retry} style={s.retryBtn}>
            <Text style={[s.errorText, { color: t.accentText }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )
    }
```

Note the two changes:
1. Color literal `'#fca5a5'` → `t.accentText` (part of Task 6+7 color migration, but applied here now since we're already editing this file).
2. New `errorDetail` style usage.

- [ ] **Step 3: Add `errorDetail` style**

In the same file, find the `StyleSheet.create({...})` block (around line 20). Find the existing `errorText` style and add a new `errorDetail` style right after it:

```ts
    errorText: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.sm,
      color: 'rgba(252,165,165,0.8)',
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    errorDetail: {
      fontFamily: 'Lexend_400Regular',
      fontSize: 11,
      color: t.textTertiary,
      textAlign: 'center',
      paddingHorizontal: 16,
      marginTop: 6,
    },
```

- [ ] **Step 4: Also swap the ActivityIndicator color literal**

Find around line 126:
```tsx
<ActivityIndicator testID="school-search-loading" color="#fca5a5" />
```
Replace with:
```tsx
<ActivityIndicator testID="school-search-loading" color={t.accentText} />
```

- [ ] **Step 5: Type-check + tests**

From `apps/mobile/`:
```bash
npx tsc --noEmit
pnpm test -- --testPathPattern=SchoolPicker
```
Expected: TS clean. SchoolPicker tests still pass (the new `errorMessage` field doesn't break existing render assertions).

> **Note on `t.accentText`:** This token is added in Task 6. If Task 6 hasn't been run yet when this task is reviewed, expect a TypeScript error on `t.accentText`. The implementer should still write the code as shown — Task 6 must be merged before Task 3 lands on master. Implementation order: Task 6 → Task 3.

> **REORDER NOTE for executor:** Tasks should be executed in order: 1 → 2 → 6 → 3 → 4 → 5 → 7 → 8 → 9 → 10. (Color token must exist before any task uses `t.accentText`.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/SchoolPicker.tsx
git commit -m "fix(mobile): SchoolPicker surfaces specific error message from hook"
```

---

## Task 4: Rewrite `exportUserData` — SAF on Android, share on iOS

**Files:**
- Modify: `apps/mobile/services/export.ts`
- Modify: `apps/mobile/services/__tests__/export.test.ts`

This task also fixes one of the pre-existing baseline test failures.

- [ ] **Step 1: Rewrite the test file**

Open `apps/mobile/services/__tests__/export.test.ts`. Replace the ENTIRE file with:

```ts
import { exportUserData } from '../export'

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}))

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}))

const mockCreateFileAsync = jest.fn().mockResolvedValue('content://picked/iskotify-export-2026-05-24.json')
const mockWriteAsStringAsync = jest.fn().mockResolvedValue(undefined)
const mockRequestDirPerms = jest.fn().mockResolvedValue({ granted: true, directoryUri: 'content://picked/' })

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: (...args: unknown[]) => mockRequestDirPerms(...args),
    createFileAsync: (...args: unknown[]) => mockCreateFileAsync(...args),
    writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  },
}))

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}))

function makeDb(settingsRow: { selectedListingSlug: string; lastSyncedAt: number } | null) {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue(settingsRow ? [settingsRow] : []),
        })),
      })),
    })),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRequestDirPerms.mockResolvedValue({ granted: true, directoryUri: 'content://picked/' })
  mockCreateFileAsync.mockResolvedValue('content://picked/iskotify-export-2026-05-24.json')
  mockWriteAsStringAsync.mockResolvedValue(undefined)
  // Reset platform to android by default
  const RN = require('react-native')
  RN.Platform.OS = 'android'
})

describe('exportUserData (Android, SAF)', () => {
  it('opens the SAF directory picker', async () => {
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(mockRequestDirPerms).toHaveBeenCalledTimes(1)
  })

  it('creates the JSON file in the picked directory', async () => {
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(mockCreateFileAsync).toHaveBeenCalledWith(
      'content://picked/',
      expect.stringMatching(/^iskotify-export-\d{4}-\d{2}-\d{2}\.json$/),
      'application/json',
    )
  })

  it('writes the JSON payload to the created file', async () => {
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      'content://picked/iskotify-export-2026-05-24.json',
      expect.stringContaining('"exported_at"'),
    )
  })

  it('returns { status: "saved", filename } on success', async () => {
    const result = await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(result.status).toBe('saved')
    if (result.status === 'saved') expect(result.filename).toMatch(/^iskotify-export-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('returns { status: "cancelled" } when user denies the picker', async () => {
    mockRequestDirPerms.mockResolvedValue({ granted: false, directoryUri: '' })
    const result = await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(result.status).toBe('cancelled')
    expect(mockCreateFileAsync).not.toHaveBeenCalled()
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled()
  })
})

describe('exportUserData (iOS, share sheet)', () => {
  beforeEach(() => {
    const RN = require('react-native')
    RN.Platform.OS = 'ios'
  })

  it('writes to documentDirectory and calls shareAsync', async () => {
    const FileSystem = require('expo-file-system/legacy')
    const Sharing = require('expo-sharing')
    const result = await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tmp\/iskotify-export-\d{4}-\d{2}-\d{2}\.json$/),
      expect.stringContaining('"exported_at"'),
      { encoding: 'utf8' },
    )
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('saved')
  })

  it('throws when sharing is not available on iOS', async () => {
    const Sharing = require('expo-sharing')
    Sharing.isAvailableAsync.mockResolvedValue(false)
    await expect(
      exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    ).rejects.toThrow('Sharing not available')
  })
})
```

- [ ] **Step 2: Run failing tests**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=export
```
Expected: FAIL — current `export.ts` doesn't have the SAF path, doesn't return `ExportResult`, doesn't switch on `Platform.OS`.

- [ ] **Step 3: Rewrite the `exportUserData` function in `export.ts`**

Open `apps/mobile/services/export.ts`. Replace the `exportUserData` function (current lines 15-49) with:

```ts
import { Platform } from 'react-native'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import {
  userSettings,
  focusListings,
  savedListings,
  savedDecks,
  userProgress,
  practiceSessions,
} from '../db/schema'

const { StorageAccessFramework } = FileSystem

export type ExportResult =
  | { status: 'saved'; filename: string }
  | { status: 'cancelled' }

export async function exportUserData(db: DrizzleClient): Promise<ExportResult> {
  const [settings, focus, saved, decks, progress, sessions] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
    db.select().from(focusListings),
    db.select().from(savedListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    settings: settings[0] ?? null,
    focus_listings: focus,
    saved_listings: saved,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
  }

  const json = JSON.stringify(payload, null, 2)
  const filename = `iskotify-export-${new Date().toISOString().slice(0, 10)}.json`

  if (Platform.OS === 'android') {
    const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync()
    if (!perms.granted) return { status: 'cancelled' }
    const fileUri = await StorageAccessFramework.createFileAsync(
      perms.directoryUri,
      filename,
      'application/json',
    )
    await StorageAccessFramework.writeAsStringAsync(fileUri, json)
    return { status: 'saved', filename }
  }

  // iOS — share sheet is the iOS-native export paradigm
  const fileUri = `${FileSystem.documentDirectory}${filename}`
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing not available on this device')
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Save Iskotify Data',
  })
  return { status: 'saved', filename }
}
```

Keep the existing `importUserData` function unchanged below.

- [ ] **Step 4: Run tests to verify they pass**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=export
```
Expected: PASS. 7 tests across two describe blocks (5 SAF + 2 iOS).

- [ ] **Step 5: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/services/export.ts apps/mobile/services/__tests__/export.test.ts
git commit -m "feat(mobile): export uses Storage Access Framework on Android"
```

---

## Task 5: Update `profile.tsx` `handleExport` for new `ExportResult` type

**Files:**
- Modify: `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Update the `handleExport` function**

Open `apps/mobile/app/(tabs)/profile.tsx`. Find `handleExport` (around lines 145-151):

```ts
  async function handleExport() {
    try {
      await exportUserData(db)
    } catch {
      Alert.alert('Export Failed', 'Could not export data. Please try again.')
    }
  }
```

Replace with:

```ts
  async function handleExport() {
    try {
      const result = await exportUserData(db)
      if (result.status === 'saved') {
        Alert.alert('Export Complete', `Saved as ${result.filename}`)
      }
      // status === 'cancelled' — user backed out of the picker, no alert
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not export data. Please try again.'
      Alert.alert('Export Failed', msg)
    }
  }
```

- [ ] **Step 2: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors. The new `ExportResult` type from Task 4 is imported transitively via the existing `exportUserData` import.

- [ ] **Step 3: Run profile tests**

From `apps/mobile/`:
```bash
pnpm test -- --testPathPattern=profile
```
Expected: PASS. If the existing profile test mocks `exportUserData` and asserts it was called, it still works since we only changed the caller's handling of the return value.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(tabs)/profile.tsx
git commit -m "feat(mobile): profile handles ExportResult cancel/save statuses"
```

---

## Task 6: Add `accentText` theme token + delete `statusColors.pink`

**Files:**
- Modify: `apps/mobile/theme/tokens.ts`

This task MUST run before Task 7 (mass color swap) and Task 3 (SchoolPicker uses `t.accentText`).

- [ ] **Step 1: Read current `tokens.ts`**

```bash
cat apps/mobile/theme/tokens.ts
```
Expected: 53 lines, two theme objects + a `statusColors` const with 4 entries.

- [ ] **Step 2: Replace `tokens.ts`**

Overwrite `apps/mobile/theme/tokens.ts` with:

```ts
export const darkTheme = {
  bg:            '#1a1a2e',
  surface:       'rgba(255,255,255,0.07)',
  surface2:      'rgba(255,255,255,0.12)',
  border:        'rgba(255,255,255,0.12)',
  textPrimary:   '#ffffff',
  textSecondary: 'rgba(255,255,255,0.62)',
  textTertiary:  'rgba(255,255,255,0.38)',
  accent:        '#800000',
  accentText:    '#fca5a5',
  accentSurface: 'rgba(128,0,0,0.18)',
  tabBar:        'rgba(26,26,46,0.92)',
  divider:       'rgba(255,255,255,0.20)',
  surfaceSubtle: 'rgba(255,255,255,0.04)',
}

export const lightTheme = {
  bg:            '#fdf4f4',
  surface:       '#ffffff',
  surface2:      'rgba(128,0,0,0.05)',
  border:        'rgba(128,0,0,0.10)',
  textPrimary:   '#2d0a0a',
  textSecondary: '#7a4444',
  textTertiary:  'rgba(45,10,10,0.40)',
  accent:        '#800000',
  accentText:    '#9b1c1c',
  accentSurface: 'rgba(128,0,0,0.10)',
  tabBar:        'rgba(253,244,244,0.92)',
  divider:       'rgba(128,0,0,0.15)',
  surfaceSubtle: 'rgba(128,0,0,0.03)',
}

export const statusColors = {
  strong: '#4ade80',
  weak:   '#f87171',
  review: '#fbbf24',
} as const

export const typography = {
  xs:      11,
  sm:      13,
  base:    16,
  md:      17,
  lg:      20,
  xl:      22,
  h3:      26,
  h2:      30,
  h1:      36,
  display: 48,
} as const

export type Theme      = typeof darkTheme
export type Typography = typeof typography
```

Changes from the prior version:
- `accentText: '#fca5a5'` added to `darkTheme` (line 10).
- `accentText: '#9b1c1c'` added to `lightTheme` (line 25).
- `statusColors.pink` deleted (was line 35).

- [ ] **Step 3: Verify nothing imports `statusColors.pink`**

From `apps/mobile/`:
```bash
grep -rn "statusColors.pink\|statusColors\['pink'\]" --include="*.ts" --include="*.tsx" .
```
Expected: zero matches. If anything matches, it would TS-error after this change — task fails and we need to fix that import site too.

- [ ] **Step 4: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors. Existing `t.accentText` references (added by Task 3) will now resolve.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/theme/tokens.ts
git commit -m "feat(mobile): add theme-aware accentText token; drop statusColors.pink"
```

---

## Task 7: Mass-replace `#fca5a5` literals with `t.accentText`

**Files (10):**
- Modify: `apps/mobile/components/AiModelBanner.tsx` (5 occurrences)
- Modify: `apps/mobile/app/(tabs)/analytics.tsx` (4)
- Modify: `apps/mobile/app/(tabs)/index.tsx` (8)
- Modify: `apps/mobile/app/(tabs)/listings.tsx` (2)
- Modify: `apps/mobile/app/(tabs)/practice.tsx` (1)
- Modify: `apps/mobile/app/(tabs)/profile.tsx` (1)
- Modify: `apps/mobile/app/about.tsx` (1)
- Modify: `apps/mobile/app/help.tsx` (1)
- Modify: `apps/mobile/app/landing.tsx` (1)
- (`SchoolPicker.tsx` already done in Task 3; `listings/[slug].tsx` is done in Task 8.)

Per file, the pattern is: ensure `t` is in scope (from `useTheme()`), then change every `'#fca5a5'` literal in that file to `t.accentText`. Where the color is inside a `StyleSheet.create({...})` inside `useMemo(() => StyleSheet.create({...}), [t, typo])`, `t` is already in scope. Where the color is inline JSX (`color="#fca5a5"`), pull `t` from the existing `useTheme()` call (every component already calls it).

- [ ] **Step 1: Verify which files have `t` in scope already**

From `apps/mobile/`:
```bash
grep -l "useTheme" components/AiModelBanner.tsx app/\(tabs\)/analytics.tsx app/\(tabs\)/index.tsx app/\(tabs\)/listings.tsx app/\(tabs\)/practice.tsx app/\(tabs\)/profile.tsx app/about.tsx app/help.tsx app/landing.tsx
```
Expected: all 9 paths print. (`useTheme()` is universal in this codebase.)

- [ ] **Step 2: For each file, replace `'#fca5a5'` with `t.accentText`**

Use sed-style careful replacement per file. The literal `'#fca5a5'` appears in two forms:
- Inside StyleSheet objects: `color: '#fca5a5'` → `color: t.accentText`
- In inline JSX: `color="#fca5a5"` → `color={t.accentText}`

For each file, run:

```bash
# 2a. AiModelBanner.tsx — already uses { theme: t } in its useMemo dep array
# Open the file, find every '#fca5a5' inside the useMemo styles + JSX, replace with t.accentText
```

The implementer should open EACH of the 9 files, locate every `'#fca5a5'` occurrence, and apply the right replacement form (`t.accentText` for object-property values, `{t.accentText}` for JSX attributes). Per the original grep:

| File | Occurrences | Locations (from earlier grep) |
|---|---|---|
| `components/AiModelBanner.tsx` | 5 | lines 39, 43, 62, 67, 85 (last is backgroundColor — also use `t.accentText`) |
| `app/(tabs)/analytics.tsx` | 4 | lines 31, 43, 91, 164 |
| `app/(tabs)/index.tsx` | 8 | lines 34, 38, 41, 46, 253, 332, 334, 433, 487 (9 actually but 253/433 are JSX `thumbColor`/`color` attrs) |
| `app/(tabs)/listings.tsx` | 2 | lines 251 (JSX color), 258 (style color) |
| `app/(tabs)/practice.tsx` | 1 | line 20 (inside a constant `New: { text: '#fca5a5', ... }`) |
| `app/(tabs)/profile.tsx` | 1 | line 208 (JSX color attr) |
| `app/about.tsx` | 1 | line 24 (style color) |
| `app/help.tsx` | 1 | line 56 (style color) |
| `app/landing.tsx` | 1 | line 114 (inline JSX style color) |

For files where `t` is captured in a `useMemo` that builds styles, the replacement is straightforward. For inline-JSX usages outside the memoized styles, `t` is available via `const { theme: t } = useTheme()` already destructured at the top of the component.

Special case for `practice.tsx` line 20: the `New` color object is defined as a module-level constant OUTSIDE any component. Move it inside the component body (where `t` is in scope) or convert to a theme-aware factory. The simplest fix: move the `New: { text: ... }` line into the `useMemo` that builds styles and reference `t.accentText` there. Implementer should inspect the actual structure and adapt accordingly.

- [ ] **Step 3: Verify all replacements are done**

From `apps/mobile/`:
```bash
grep -rn "#fca5a5" components/ app/
```
Expected: zero matches in those directories. The only place `#fca5a5` should remain is `theme/tokens.ts` (as `darkTheme.accentText: '#fca5a5'`).

If any matches show, fix them — the swap isn't complete.

- [ ] **Step 4: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Run full test suite to check no rendering breaks**

From `apps/mobile/`:
```bash
pnpm test
```
Expected: same baseline failures (3 pre-existing OR 2 after Task 4 fixed the export test failure). No new failures.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/AiModelBanner.tsx \
  apps/mobile/app/\(tabs\)/analytics.tsx \
  apps/mobile/app/\(tabs\)/index.tsx \
  apps/mobile/app/\(tabs\)/listings.tsx \
  apps/mobile/app/\(tabs\)/practice.tsx \
  apps/mobile/app/\(tabs\)/profile.tsx \
  apps/mobile/app/about.tsx \
  apps/mobile/app/help.tsx \
  apps/mobile/app/landing.tsx
git commit -m "fix(mobile): replace #fca5a5 literals with theme-aware t.accentText"
```

---

## Task 8: Listing detail focus button sizing + color swap

**Files:**
- Modify: `apps/mobile/app/listings/[slug].tsx`

- [ ] **Step 1: Update the 4 affected styles**

Open `apps/mobile/app/listings/[slug].tsx`. Find the StyleSheet block around lines 99-106. The current code is:

```ts
    practiceBtn: { marginHorizontal: 14, backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
    practiceBtnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    linkBtn: { marginHorizontal: 14, borderWidth: 1, borderColor: t.divider, borderRadius: 18, paddingVertical: 12, alignItems: 'center' },
    linkBtnTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    focusRemoveBtn: { backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 2, borderColor: '#831626', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
    focusRemoveTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: '#fca5a5' },
    focusAddBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
    focusAddTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: '#fff' },
```

Replace `focusRemoveBtn`, `focusRemoveTxt`, and `focusAddBtn` (keep `practiceBtn`, `practiceBtnTxt`, `linkBtn`, `linkBtnTxt`, `focusAddTxt` unchanged):

```ts
    focusRemoveBtn: {
      marginHorizontal: 14,
      backgroundColor: 'rgba(128,0,0,0.12)',
      borderWidth: 2,
      borderColor: '#831626',
      borderRadius: 18,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 12,
    },
    focusRemoveTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: t.accentText },
    focusAddBtn: {
      marginHorizontal: 14,
      backgroundColor: 'rgba(128,0,0,0.82)',
      borderRadius: 18,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 12,
    },
```

Three changes:
- `focusRemoveBtn`: added `marginHorizontal: 14`, changed `paddingVertical: 14` → `12` (compensate the 2px border).
- `focusAddBtn`: added `marginHorizontal: 14`.
- `focusRemoveTxt`: color `'#fca5a5'` → `t.accentText`.

- [ ] **Step 2: Find and swap the OTHER `#fca5a5` in this file (the typeTxt color)**

In the same file, find around line 195:
```tsx
<Text style={[s.typeTxt, { color: isExam ? '#fca5a5' : '#4ade80' }]}>
```
Replace with:
```tsx
<Text style={[s.typeTxt, { color: isExam ? t.accentText : '#4ade80' }]}>
```

- [ ] **Step 3: Verify the file has no more `#fca5a5`**

```bash
grep -n "fca5a5" apps/mobile/app/listings/\[slug\].tsx
```
Expected: zero matches.

- [ ] **Step 4: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/listings/[slug].tsx
git commit -m "fix(mobile): listing detail focus button sizing + accentText color"
```

---

## Task 9: eas.json + EAS env var setup documentation

**Files:**
- Modify: `apps/mobile/eas.json`

The current `eas.json` `preview` env block has `EXPO_PUBLIC_GOOGLE_PLACES_KEY: "FILL_IN_YOUR_GOOGLE_PLACES_API_KEY"`. That literal placeholder shipped into the production APK bundle. This is the root cause of "Places API not working" on the user's installed APK.

The fix has two parts:
1. **Code change (this task):** Replace the placeholder in eas.json with a reference to the EAS secret env (so future builds pull the secret).
2. **Out-of-band user action (documented for the user):** Set the EAS env secret.

- [ ] **Step 1: Update `eas.json`**

Open `apps/mobile/eas.json`. Find the `preview.env` block (around lines 24-26):

```json
      "env": {
        "EXPO_PUBLIC_GOOGLE_PLACES_KEY": "FILL_IN_YOUR_GOOGLE_PLACES_API_KEY"
      }
```

Replace with (remove the literal placeholder — EAS auto-injects vars from the `preview` environment):

```json
      "env": {}
```

Rationale: the EAS env var system (managed via `eas env`) handles secret injection for both `eas build` and `eas update` when the right `--environment` flag is passed. Hardcoding placeholders in eas.json is fragile and a footgun.

- [ ] **Step 2: Verify no other reference to the placeholder remains**

```bash
grep -rn "FILL_IN_YOUR_GOOGLE_PLACES" apps/mobile/
```
Expected: zero matches.

- [ ] **Step 3: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: no new errors (eas.json isn't type-checked, but ensure nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/eas.json
git commit -m "fix(mobile): remove placeholder Places API key from eas.json (use EAS env)"
```

---

## Task 10: Final verification + OTA push + user action items

**Files:**
- No file modifications.

- [ ] **Step 1: Run full test suite**

From `apps/mobile/`:
```bash
pnpm test
```
Expected: 2 failed (the baseline `supabase.test.ts` + maybe `useAnalytics.test.ts`; `export.test.ts` was previously failing baseline but should pass now — net 1-2 baseline failures). All chat / school / export tests green.

- [ ] **Step 2: Type-check**

From `apps/mobile/`:
```bash
npx tsc --noEmit
```
Expected: 7 pre-existing baseline errors only. No new errors in modified files.

- [ ] **Step 3: Push to origin/master**

```bash
git push origin master
```

- [ ] **Step 4: Fetch the production APK's SHA-1 fingerprint**

From `apps/mobile/`:
```bash
eas credentials -p android --non-interactive 2>&1 | grep -i "sha-1\|sha1" | head -5
```
Capture the SHA-1 fingerprint of the production keystore. It looks like `XX:XX:XX:...` (40 chars, colon-separated).

If `--non-interactive` doesn't work or the SHA-1 isn't printed, run `eas credentials` and navigate the TUI: Android → Production → Keystore → view SHA-1.

- [ ] **Step 5: Trigger OTA update**

From `apps/mobile/`:
```bash
eas update --branch preview --environment preview --message "fix(mobile): school picker (aliases + smarter search), SAF export, accent text color, focus button sizing"
```

The `--environment preview` flag instructs `eas update` to inject env vars from the `preview` EAS environment when bundling. If `EXPO_PUBLIC_GOOGLE_PLACES_KEY` is set in that environment, the bundle will have the real key.

If the env isn't set yet, the bundle will have an empty `PLACES_KEY` at runtime — the school search will catch this and show "Places API key not configured" as the error message. The user must complete Step 6 below to fix it.

- [ ] **Step 6: Report findings to user — items they must complete out of band**

Print a clear summary:

```
✅ OTA bundle published: <bundle-url>
✅ Supabase migration applied
✅ 25 schools seeded with aliases

⚠️ ACTION REQUIRED — Places API setup (out of band):

1. Set the EAS env secret (replace <REAL_KEY> with your actual Google Places API key):
   $ eas env:create --variable-environment preview \
       --name EXPO_PUBLIC_GOOGLE_PLACES_KEY \
       --value <REAL_KEY> \
       --visibility plaintext

2. Re-run the OTA push so the new bundle has the key inlined:
   $ eas update --branch preview --environment preview \
       --message "chore(mobile): rebuild bundle with Places API key"

3. Update Google Cloud Console → APIs & Services → Credentials → your Places API key:
   - Android restrictions → Add Application:
     - Package name: app.iskotify.mobile
     - SHA-1: <SHA-1 captured in Step 4>
```

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-05-24-pr6-bug-fixes-design.md`):**

- Section 1 (schools migration + search rewrite + Places error surfacing): ✓ Task 1 (migration), Task 2 (hook rewrite), Task 3 (UI shows errorMessage).
- Section 2 (SAF export Android, share iOS, ExportResult type): ✓ Task 4 (service rewrite), Task 5 (caller).
- Section 3 (accentText token + mass swap): ✓ Task 6 (token), Tasks 3+7+8 (swap in 12 files including SchoolPicker and listing detail).
- Section 4 (focus button sizing): ✓ Task 8.
- Section 7 (rollout): ✓ Task 1 (migration), Task 9 (eas.json fix), Task 10 (push + OTA + user action items).

All spec sections covered.

**Type / signature consistency:**
- `UseSchoolSearch` interface adds `errorMessage: string | null` — defined in Task 2, consumed in Task 3.
- `ExportResult` discriminated union (`{ status: 'saved'; filename } | { status: 'cancelled' }`) — defined in Task 4, consumed in Task 5.
- `t.accentText` — added in Task 6, consumed in Tasks 3, 7, 8.
- `Theme` type — automatically extends since `accentText` is a key of `darkTheme`.

**Task ordering note:**
Tasks should execute in this order: **1 → 2 → 6 → 3 → 4 → 5 → 7 → 8 → 9 → 10**. (The color token from Task 6 must exist before any later task uses `t.accentText`.)

**Placeholder scan:** No TBDs / TODOs / "similar to Task N" / "add error handling". All code blocks are concrete.

Self-review passes. No edits needed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-pr6-bug-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (controller handles Task 1 directly via MCP), two-stage review between code tasks. Fast iteration in this session.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
