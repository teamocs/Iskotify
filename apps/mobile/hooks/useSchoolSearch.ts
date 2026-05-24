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
