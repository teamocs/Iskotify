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
    if (lastQueryRef.current.length < 3) return
    void fetchResults(lastQueryRef.current)
  }, [fetchResults])

  return { query, setQuery, results, loading, error, retry }
}
