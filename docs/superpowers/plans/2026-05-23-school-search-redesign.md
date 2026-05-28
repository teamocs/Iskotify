# School Search Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-level hierarchical school picker (Region→Province→City→School backed by Supabase tables) with a single debounced live search powered by Google Places API v2 Autocomplete.

**Architecture:** Delete the Supabase `schools`/`school_regions` tables via migration and the SQLite `schoolsCache` table from the local schema. Create a `useSchoolSearch` hook that POSTs to Google Places v2 Autocomplete with 500ms debounce and a 3-character minimum. Rewrite `SchoolPicker.tsx` modal internals to use the hook — flat results list, spinner, error/retry, and a "Use what I typed" fallback always visible when query ≥ 1 char.

**Tech Stack:** React Native (Expo SDK 54), TypeScript, Google Places New API v2, `@testing-library/react-native`, `jest-expo`

---

## File Map

| Action | Path |
|--------|------|
| Supabase migration | DROP TABLE schools; DROP TABLE school_regions |
| Modify | `apps/mobile/db/schema.ts` — remove `schoolsCache` export |
| Delete | `apps/mobile/hooks/useSchoolPicker.ts` |
| Delete | `apps/mobile/hooks/__tests__/useSchoolPicker.test.ts` |
| Delete | `apps/mobile/hooks/__tests__/useSchoolPicker.hook.test.ts` |
| Modify | `apps/mobile/.env` — add `EXPO_PUBLIC_GOOGLE_PLACES_KEY` |
| Modify | `apps/mobile/jest.setup.ts` — add `EXPO_PUBLIC_GOOGLE_PLACES_KEY` |
| Modify | `apps/mobile/eas.json` — add env var to `preview` profile |
| Create | `apps/mobile/hooks/useSchoolSearch.ts` |
| Create | `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts` |
| Rewrite | `apps/mobile/components/SchoolPicker.tsx` |
| Rewrite | `apps/mobile/components/__tests__/SchoolPicker.test.tsx` |
| Modify | `apps/mobile/app.json` — bump versionCode 7 → 8 |

---

### Task 1: Drop Supabase school tables

**Files:**
- Supabase migration (remote only — no local file changes)

- [ ] **Step 1: Apply migration via Supabase MCP tool**

  Use `mcp__supabase__apply_migration` with:
  - project_id: `dtugrsbarruizgzowgso`
  - name: `drop_school_tables`
  - query:
    ```sql
    DROP TABLE IF EXISTS schools;
    DROP TABLE IF EXISTS school_regions;
    ```

- [ ] **Step 2: Verify tables are gone**

  Use `mcp__supabase__list_tables` and confirm neither `schools` nor `school_regions` appear.

- [ ] **Step 3: Commit**

  ```bash
  git commit --allow-empty -m "chore(db): drop schools and school_regions Supabase tables"
  ```

---

### Task 2: Add EXPO_PUBLIC_GOOGLE_PLACES_KEY

**Files:**
- Modify: `apps/mobile/.env`
- Modify: `apps/mobile/jest.setup.ts`
- Modify: `apps/mobile/eas.json`

- [ ] **Step 1: Add key to .env**

  Append to `apps/mobile/.env` (keep existing lines, add one new line):
  ```
  EXPO_PUBLIC_GOOGLE_PLACES_KEY=FILL_IN_YOUR_GOOGLE_PLACES_API_KEY
  ```

- [ ] **Step 2: Add key to jest.setup.ts**

  Current content of `apps/mobile/jest.setup.ts`:
  ```ts
  process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://test.supabase.co'
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key'
  ```

  Replace with:
  ```ts
  process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://test.supabase.co'
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key'
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? 'test-places-key'
  ```

- [ ] **Step 3: Add env to eas.json preview profile**

  Current `"preview"` block in `apps/mobile/eas.json`:
  ```json
  "preview": {
    "distribution": "internal",
    "android": {
      "buildType": "apk"
    }
  }
  ```

  Replace with:
  ```json
  "preview": {
    "distribution": "internal",
    "android": {
      "buildType": "apk"
    },
    "env": {
      "EXPO_PUBLIC_GOOGLE_PLACES_KEY": "FILL_IN_YOUR_GOOGLE_PLACES_API_KEY"
    }
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/.env apps/mobile/jest.setup.ts apps/mobile/eas.json
  git commit -m "chore(env): add EXPO_PUBLIC_GOOGLE_PLACES_KEY to .env, jest setup, and EAS preview"
  ```

---

### Task 3: Create useSchoolSearch hook (TDD)

**Files:**
- Create: `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts` (write first)
- Create: `apps/mobile/hooks/useSchoolSearch.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts`:

  ```ts
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

      await waitFor(() => {
        expect(result.current.error).toBe(false)
        expect(result.current.results).toHaveLength(2)
      })
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd apps/mobile
  npx jest hooks/__tests__/useSchoolSearch.test.ts --watchAll=false
  ```

  Expected: FAIL with `Cannot find module '../useSchoolSearch'`

- [ ] **Step 3: Create the hook**

  Create `apps/mobile/hooks/useSchoolSearch.ts`:

  ```ts
  import { useState, useRef, useCallback, useEffect } from 'react'

  const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete'
  const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? ''

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
    retry: () => void
  }

  export function useSchoolSearch(): UseSchoolSearch {
    const [query, setQueryState] = useState('')
    const [results, setResults] = useState<SchoolResult[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
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
      try {
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
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
        if (activeQueryRef.current !== q) return
        setResults((json.suggestions ?? []).map(s => ({
          name: s.placePrediction.structuredFormat.mainText.text,
          subtitle: s.placePrediction.structuredFormat.secondaryText.text,
        })))
      } catch {
        if (activeQueryRef.current !== q) return
        setError(true)
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
        return
      }
      debounceRef.current = setTimeout(() => void fetchResults(q), 500)
    }, [fetchResults])

    const retry = useCallback(() => {
      setError(false)
      void fetchResults(lastQueryRef.current)
    }, [fetchResults])

    return { query, setQuery, results, loading, error, retry }
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd apps/mobile
  npx jest hooks/__tests__/useSchoolSearch.test.ts --watchAll=false
  ```

  Expected: 8 tests passing, 0 failing

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/hooks/useSchoolSearch.ts apps/mobile/hooks/__tests__/useSchoolSearch.test.ts
  git commit -m "feat(mobile): add useSchoolSearch hook with Google Places v2 debounced search"
  ```

---

### Task 4: Rewrite SchoolPicker component (TDD)

**Files:**
- Rewrite: `apps/mobile/components/__tests__/SchoolPicker.test.tsx` (write first)
- Rewrite: `apps/mobile/components/SchoolPicker.tsx`

- [ ] **Step 1: Write the failing tests**

  Replace the entire content of `apps/mobile/components/__tests__/SchoolPicker.test.tsx`:

  ```tsx
  import React from 'react'
  import { render, screen, fireEvent } from '@testing-library/react-native'
  import { SchoolPicker } from '../SchoolPicker'

  jest.mock('../../hooks/useSchoolSearch', () => ({
    useSchoolSearch: jest.fn(),
  }))

  const mockUseSchoolSearch = require('../../hooks/useSchoolSearch').useSchoolSearch

  function makeState(overrides = {}) {
    return {
      query: '',
      setQuery: jest.fn(),
      results: [],
      loading: false,
      error: false,
      retry: jest.fn(),
      ...overrides,
    }
  }

  beforeEach(() => {
    mockUseSchoolSearch.mockReturnValue(makeState())
  })

  describe('SchoolPicker — trigger', () => {
    it('shows placeholder when no value', () => {
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      expect(screen.getByText('Search your school...')).toBeTruthy()
    })

    it('shows selected school name when value is set', () => {
      render(<SchoolPicker value="San Beda University" onChange={jest.fn()} />)
      expect(screen.getByText('San Beda University')).toBeTruthy()
    })
  })

  describe('SchoolPicker — modal', () => {
    it('opens on trigger press and shows title and search input', () => {
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      expect(screen.getByText('School / University')).toBeTruthy()
      expect(screen.getByPlaceholderText('Search schools...')).toBeTruthy()
    })

    it('shows hint when query is empty', () => {
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      expect(screen.getByText('Type at least 3 characters to search')).toBeTruthy()
    })

    it('shows spinner when loading=true', () => {
      mockUseSchoolSearch.mockReturnValue(makeState({ query: 'san', loading: true }))
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      expect(screen.getByTestId('school-search-loading')).toBeTruthy()
    })

    it('shows error message and Retry button when error=true', () => {
      mockUseSchoolSearch.mockReturnValue(makeState({ query: 'san', error: true }))
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      expect(screen.getByText(/Could not search schools/)).toBeTruthy()
      expect(screen.getByText('Retry')).toBeTruthy()
    })

    it('calls retry when Retry button is pressed', () => {
      const retry = jest.fn()
      mockUseSchoolSearch.mockReturnValue(makeState({ query: 'san', error: true, retry }))
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      fireEvent.press(screen.getByText('Retry'))
      expect(retry).toHaveBeenCalled()
    })

    it('shows result rows with name and subtitle', () => {
      mockUseSchoolSearch.mockReturnValue(makeState({
        query: 'san',
        results: [
          { name: 'San Beda University', subtitle: 'Mendiola, Manila, Philippines' },
        ],
      }))
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      expect(screen.getByText('San Beda University')).toBeTruthy()
      expect(screen.getByText('Mendiola, Manila, Philippines')).toBeTruthy()
    })

    it('calls onChange with result.name on row press', () => {
      const onChange = jest.fn()
      mockUseSchoolSearch.mockReturnValue(makeState({
        query: 'san',
        results: [{ name: 'San Beda University', subtitle: 'Mendiola, Manila, Philippines' }],
      }))
      render(<SchoolPicker value="" onChange={onChange} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      fireEvent.press(screen.getByText('San Beda University'))
      expect(onChange).toHaveBeenCalledWith('San Beda University')
    })

    it('shows "No schools found." when results are empty and query >= 3 chars', () => {
      mockUseSchoolSearch.mockReturnValue(makeState({ query: 'xyz', results: [] }))
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      expect(screen.getByText('No schools found.')).toBeTruthy()
    })

    it('shows "Use what I typed" fallback when query >= 1 char', () => {
      mockUseSchoolSearch.mockReturnValue(makeState({ query: 'xyz school' }))
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      expect(screen.getByText(/Use "xyz school"/)).toBeTruthy()
    })

    it('does NOT show "Use what I typed" fallback when query is empty', () => {
      render(<SchoolPicker value="" onChange={jest.fn()} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      expect(screen.queryByText(/Can't find your school/)).toBeNull()
    })

    it('calls onChange with raw query when "Use what I typed" is pressed', () => {
      const onChange = jest.fn()
      mockUseSchoolSearch.mockReturnValue(makeState({ query: 'My Custom School' }))
      render(<SchoolPicker value="" onChange={onChange} />)
      fireEvent.press(screen.getByTestId('school-picker-trigger'))
      fireEvent.press(screen.getByText(/Use "My Custom School"/))
      expect(onChange).toHaveBeenCalledWith('My Custom School')
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd apps/mobile
  npx jest components/__tests__/SchoolPicker.test.tsx --watchAll=false
  ```

  Expected: FAIL — component still imports `useSchoolPicker`, mock setup errors

- [ ] **Step 3: Rewrite SchoolPicker.tsx**

  Replace the entire content of `apps/mobile/components/SchoolPicker.tsx`:

  ```tsx
  import { useState, useCallback, useMemo } from 'react'
  import {
    View, Text, TextInput, FlatList, Modal, TouchableOpacity,
    ActivityIndicator, StyleSheet,
  } from 'react-native'
  import { useSchoolSearch } from '../hooks/useSchoolSearch'
  import { useTheme } from '../theme/ThemeContext'
  import type { SchoolResult } from '../hooks/useSchoolSearch'

  interface SchoolPickerProps {
    value: string
    onChange: (school: string) => void
  }

  export function SchoolPicker({ value, onChange }: SchoolPickerProps) {
    const [modalVisible, setModalVisible] = useState(false)
    const { query, setQuery, results, loading, error, retry } = useSchoolSearch()
    const { theme: t, typo } = useTheme()

    const s = useMemo(() => StyleSheet.create({
      input: {
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 13,
        fontFamily: 'Lexend_400Regular',
        fontSize: typo.md,
        color: t.textPrimary,
      },
      trigger: { justifyContent: 'center' },
      triggerText: { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textPrimary },
      triggerTextPlaceholder: { color: t.textTertiary },
      modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
      modalDismissOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
      sheet: {
        backgroundColor: t.bg,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '82%',
        paddingTop: 16,
        paddingHorizontal: 16,
        paddingBottom: 32,
      },
      sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
      sheetTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.lg, color: t.textPrimary, flex: 1 },
      closeText: { fontFamily: 'Lexend_400Regular', fontSize: 18, color: t.textSecondary, padding: 4 },
      searchInput: { marginBottom: 10 },
      contentArea: { flex: 1 },
      loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      hintText: {
        fontFamily: 'Lexend_400Regular',
        fontSize: typo.sm,
        color: t.textTertiary,
        textAlign: 'center',
        paddingTop: 40,
      },
      errorText: {
        fontFamily: 'Lexend_400Regular',
        fontSize: typo.sm,
        color: 'rgba(252,165,165,0.8)',
        textAlign: 'center',
        paddingHorizontal: 16,
      },
      retryBtn: { marginTop: 12, alignItems: 'center' },
      listRow: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: t.surfaceSubtle,
      },
      listName: { fontFamily: 'Outfit_600SemiBold', fontSize: typo.md, color: t.textPrimary },
      listSubtitle: {
        fontFamily: 'Lexend_400Regular',
        fontSize: typo.sm,
        color: t.textSecondary,
        marginTop: 2,
      },
      fallbackRow: {
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: t.surfaceSubtle,
        marginTop: 8,
      },
      fallbackLabel: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary },
      fallbackLink: {
        fontFamily: 'Lexend_500Medium',
        fontSize: typo.md,
        color: 'rgba(252,165,165,0.8)',
        marginTop: 2,
      },
    }), [t, typo])

    const closeModal = useCallback(() => {
      setQuery('')
      setModalVisible(false)
    }, [setQuery])

    const selectResult = useCallback((r: SchoolResult) => {
      onChange(r.name)
      setQuery('')
      setModalVisible(false)
    }, [onChange, setQuery])

    const selectTyped = useCallback(() => {
      onChange(query)
      setQuery('')
      setModalVisible(false)
    }, [onChange, query, setQuery])

    const renderItem = useCallback(({ item }: { item: SchoolResult }) => (
      <TouchableOpacity onPress={() => selectResult(item)} style={s.listRow}>
        <Text style={s.listName}>{item.name}</Text>
        <Text style={s.listSubtitle}>{item.subtitle}</Text>
      </TouchableOpacity>
    ), [selectResult, s])

    function renderBody() {
      if (query.length < 3) {
        return <Text style={s.hintText}>Type at least 3 characters to search</Text>
      }
      if (loading) {
        return (
          <View style={s.loadingContainer}>
            <ActivityIndicator testID="school-search-loading" color="#fca5a5" />
          </View>
        )
      }
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
      return (
        <FlatList
          data={results}
          keyExtractor={r => `${r.name}-${r.subtitle}`}
          keyboardShouldPersistTaps="handled"
          renderItem={renderItem}
          ListEmptyComponent={<Text style={s.hintText}>No schools found.</Text>}
        />
      )
    }

    return (
      <>
        <TouchableOpacity
          testID="school-picker-trigger"
          onPress={() => setModalVisible(true)}
          style={[s.input, s.trigger]}
        >
          <Text style={[s.triggerText, !value && s.triggerTextPlaceholder]} numberOfLines={1}>
            {value || 'Search your school...'}
          </Text>
        </TouchableOpacity>

        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeModal}
        >
          <View style={s.modalBackdrop}>
            <TouchableOpacity
              style={s.modalDismissOverlay}
              activeOpacity={1}
              accessibilityLabel="Close school picker"
              accessibilityRole="button"
              onPress={closeModal}
            />
            <View style={s.sheet}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>School / University</Text>
                <TouchableOpacity onPress={closeModal} accessibilityLabel="Close">
                  <Text style={s.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[s.input, s.searchInput]}
                placeholder="Search schools..."
                placeholderTextColor={t.textTertiary}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                returnKeyType="search"
                autoFocus
              />

              <View style={s.contentArea}>
                {renderBody()}
              </View>

              {query.length >= 1 && (
                <TouchableOpacity onPress={selectTyped} style={s.fallbackRow}>
                  <Text style={s.fallbackLabel}>Can't find your school?</Text>
                  <Text style={s.fallbackLink}>Use "{query}" ›</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </>
    )
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd apps/mobile
  npx jest components/__tests__/SchoolPicker.test.tsx --watchAll=false
  ```

  Expected: 11 tests passing, 0 failing

- [ ] **Step 5: Run TypeScript check**

  ```bash
  cd apps/mobile
  npx tsc --noEmit
  ```

  Expected: 0 errors (SchoolPicker no longer imports the deleted useSchoolPicker)

- [ ] **Step 6: Commit**

  ```bash
  git add apps/mobile/components/SchoolPicker.tsx apps/mobile/components/__tests__/SchoolPicker.test.tsx
  git commit -m "feat(mobile): rewrite SchoolPicker to use Google Places v2 live search"
  ```

---

### Task 5: Cleanup — remove old files and bump versionCode

**Files:**
- Modify: `apps/mobile/db/schema.ts` — remove `schoolsCache` table (lines 67-71)
- Delete: `apps/mobile/hooks/useSchoolPicker.ts`
- Delete: `apps/mobile/hooks/__tests__/useSchoolPicker.test.ts`
- Delete: `apps/mobile/hooks/__tests__/useSchoolPicker.hook.test.ts`
- Modify: `apps/mobile/app.json` — bump versionCode 7 → 8

- [ ] **Step 1: Remove schoolsCache from schema.ts**

  In `apps/mobile/db/schema.ts`, delete these 5 lines (currently lines 67-71):
  ```ts
  export const schoolsCache = sqliteTable('schools_cache', {
    region: text('region').primaryKey(),
    data: text('data').notNull(),
    cachedAt: integer('cached_at').notNull(),
  })
  ```

  The `schoolsCache` export is only referenced by `useSchoolPicker.ts` (which we're also deleting). No SQLite migration is needed — existing cached rows on devices are abandoned harmlessly; the table just stops being used.

- [ ] **Step 2: Delete the three old files**

  ```bash
  git rm apps/mobile/hooks/useSchoolPicker.ts
  git rm "apps/mobile/hooks/__tests__/useSchoolPicker.test.ts"
  git rm "apps/mobile/hooks/__tests__/useSchoolPicker.hook.test.ts"
  ```

- [ ] **Step 3: Bump versionCode to 8 in app.json**

  In `apps/mobile/app.json`, change:
  ```json
  "versionCode": 7
  ```
  to:
  ```json
  "versionCode": 8
  ```

- [ ] **Step 4: Run full test suite and TypeScript check**

  ```bash
  cd apps/mobile
  npx tsc --noEmit
  npx jest --watchAll=false
  ```

  Expected: 0 TypeScript errors. All tests pass (the deleted test files no longer exist and cannot cause failures).

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/db/schema.ts apps/mobile/app.json
  git commit -m "chore(mobile): remove schoolsCache schema, useSchoolPicker hook, and bump versionCode to 8"
  ```

---

## Post-Implementation

Before building, replace the two `FILL_IN_YOUR_GOOGLE_PLACES_API_KEY` placeholders:
- `apps/mobile/.env` — for local Expo Go / dev builds
- `apps/mobile/eas.json` `preview.env` — for EAS preview APK builds

The key must be restricted in Google Cloud Console to Android package `app.iskotify.mobile` and iOS bundle `app.iskotify.mobile` to prevent abuse.

Then build:
```bash
eas build --platform android --profile preview
```
