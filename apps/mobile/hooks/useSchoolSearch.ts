import { useState, useRef, useCallback, useEffect } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../services/supabase'

const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete'
const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? ''
const PLACES_KEY_PLACEHOLDER = 'FILL_IN_YOUR_GOOGLE_PLACES_API_KEY'

export const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300
const DB_LIMIT = 25

export interface SchoolResult {
  name: string
  subtitle: string
  source: 'database' | 'places' | 'manual'
}

export interface UseSchoolSearch {
  query: string
  setQuery: (q: string) => void
  results: SchoolResult[]
  loading: boolean
  error: boolean
  errorMessage: string | null
  retry: () => void
  contributeSchool: (result: SchoolResult) => Promise<void>
}

// Build a fuzzy ILIKE pattern: "san beda university" → "%san%beda%university%"
export function buildFuzzyPattern(q: string): string {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const escaped = words.map(w => w.replace(/[\\%_]/g, m => `\\${m}`))
  return `%${escaped.join('%')}%`
}

function rankResults(results: SchoolResult[], query: string): SchoolResult[] {
  const q = query.toLowerCase().trim()
  return [...results].sort((a, b) => {
    const aName = a.name.toLowerCase()
    const bName = b.name.toLowerCase()
    const aStarts = aName.startsWith(q) ? 0 : 1
    const bStarts = bName.startsWith(q) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return aName.length - bName.length
  })
}

// "Mendiola, Manila, Philippines" → { city: 'Mendiola', province: 'Manila' }
// Strips the country (Philippines) when present so it doesn't pollute province.
export function parseSubtitle(subtitle: string): { city: string; province: string } {
  const parts = subtitle
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0 && !/^philippines$/i.test(p))
  return {
    city: parts[0] ?? '',
    province: parts[1] ?? '',
  }
}

async function searchSupabase(q: string): Promise<SchoolResult[]> {
  const pattern = buildFuzzyPattern(q)
  if (!pattern) return []
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('name,city,province')
      .ilike('name', pattern)
      .limit(DB_LIMIT)
    if (error) {
      console.warn('[SchoolSearch] Supabase error:', error.message, error.code)
      return []
    }
    if (!data || data.length === 0) return []
    const mapped = data.map(s => ({
      name: s.name as string,
      subtitle: [s.city, s.province].filter(Boolean).join(', '),
      source: 'database' as const,
    }))
    return rankResults(mapped, q)
  } catch (err) {
    console.warn('[SchoolSearch] Supabase exception:', err)
    return []
  }
}

async function searchPlaces(q: string): Promise<SchoolResult[]> {
  if (!PLACES_KEY || PLACES_KEY === PLACES_KEY_PLACEHOLDER) {
    throw new Error('Places API key not configured')
  }

  const platformHeaders: Record<string, string> = Platform.OS === 'ios'
    ? { 'X-Ios-Bundle-Identifier': 'app.iskotify.mobile' }
    : Platform.OS === 'android'
      ? { 'X-Android-Package': 'app.iskotify.mobile' }
      : {}

  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': 'suggestions.placePrediction.structuredFormat',
      ...platformHeaders,
    },
    body: JSON.stringify({
      input: q,
      includedPrimaryTypes: ['school', 'secondary_school', 'university'],
      includedRegionCodes: ['ph'],
    }),
  })

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
    source: 'places' as const,
  }))
}

// Insert user-contributed schools so the directory grows over time.
// Safe for both 'manual' (user-typed) and 'places' (Google Maps pick) selections.
// Silently no-ops for 'database' source (already in DB) and never throws to caller.
export async function contributeSchool(result: SchoolResult): Promise<void> {
  if (result.source === 'database') return
  const name = result.name.trim()
  if (!name) return
  const { city, province } = parseSubtitle(result.subtitle)
  try {
    const { error } = await supabase.from('schools').upsert({
      name,
      city,
      province,
      region: '',
      source: result.source,
    }, { onConflict: 'name,city', ignoreDuplicates: true })
    if (error) {
      console.warn('[SchoolSearch] contribute failed:', error.message, error.code)
    }
  } catch (err) {
    console.warn('[SchoolSearch] contribute exception:', err)
  }
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
      try {
        const placesResults = await searchPlaces(q)
        if (activeQueryRef.current !== q) return
        setResults(placesResults)
      } catch (placesErr) {
        if (activeQueryRef.current !== q) return
        console.warn('[SchoolSearch] Places fallback failed:', placesErr)
        setResults([])
      }
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
    if (q.trim().length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      setError(false)
      setErrorMessage(null)
      return
    }
    debounceRef.current = setTimeout(() => void fetchResults(q), DEBOUNCE_MS)
  }, [fetchResults])

  const retry = useCallback(() => {
    if (lastQueryRef.current.trim().length < MIN_QUERY_LENGTH) return
    void fetchResults(lastQueryRef.current)
  }, [fetchResults])

  return { query, setQuery, results, loading, error, errorMessage, retry, contributeSchool }
}
