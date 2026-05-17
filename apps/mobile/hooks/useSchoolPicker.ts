import { useState, useEffect, useCallback, useMemo } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { schoolsCache } from '../db/schema'
import { supabase } from '../services/supabase'

export interface SchoolEntry {
  region: string
  province: string
  city: string
  name: string
}

export type PickerLevel = 'region' | 'province' | 'city' | 'school'

export interface UseSchoolPickerReturn {
  level: PickerLevel
  list: string[]
  selectedRegion: string | null
  selectedProvince: string | null
  selectedCity: string | null
  loading: boolean
  error: string | null
  selectRegion: (r: string) => Promise<void>
  selectProvince: (p: string) => void
  selectCity: (c: string) => void
  jumpToLevel: (target: 'region' | 'province' | 'city') => void
  reset: () => void
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

// ── Pure functions (exported for unit tests) ─────────────────────────────────

export function deriveProvinces(schools: SchoolEntry[], region: string): string[] {
  return [...new Set(schools.filter(s => s.region === region).map(s => s.province))].sort()
}

export function deriveCities(schools: SchoolEntry[], region: string, province: string): string[] {
  return [...new Set(
    schools.filter(s => s.region === region && s.province === province).map(s => s.city),
  )].sort()
}

export function deriveSchoolNames(schools: SchoolEntry[], region: string, province: string, city: string): string[] {
  return schools
    .filter(s => s.region === region && s.province === province && s.city === city)
    .map(s => s.name)
    .sort()
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useSchoolPicker(): UseSchoolPickerReturn {
  const db = useDb()
  const [level, setLevel] = useState<PickerLevel>('region')
  const [regions, setRegions] = useState<string[]>([])
  const [cachedSchools, setCachedSchools] = useState<SchoolEntry[]>([])
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadRegions() {
      try {
        const { data, error: err } = await supabase
          .from('school_regions')
          .select('region')
          .order('region')
        if (err) throw err
        setRegions((data ?? []).map((r: { region: string }) => r.region))
      } catch (e) {
        console.error('[useSchoolPicker] load regions:', e)
        setError('Could not load school regions. Check your connection.')
      }
    }
    void loadRegions()
  }, [])

  const list = useMemo<string[]>(() => {
    if (level === 'region') return regions
    if (level === 'province' && selectedRegion) return deriveProvinces(cachedSchools, selectedRegion)
    if (level === 'city' && selectedRegion && selectedProvince) return deriveCities(cachedSchools, selectedRegion, selectedProvince)
    if (level === 'school' && selectedRegion && selectedProvince && selectedCity) return deriveSchoolNames(cachedSchools, selectedRegion, selectedProvince, selectedCity)
    return []
  }, [level, regions, cachedSchools, selectedRegion, selectedProvince, selectedCity])

  const selectRegion = useCallback(async (r: string) => {
    setLoading(true)
    setError(null)
    try {
      const cached = await db.select().from(schoolsCache).where(eq(schoolsCache.region, r)).limit(1)
      const row = cached[0]
      if (row && Date.now() - row.cachedAt < CACHE_TTL_MS) {
        setCachedSchools(JSON.parse(row.data) as SchoolEntry[])
      } else {
        const { data, error: err } = await supabase
          .from('schools')
          .select('region,province,city,name')
          .eq('region', r)
          .order('province')
        if (err) throw err
        const schools = (data ?? []) as SchoolEntry[]
        await db.insert(schoolsCache)
          .values({ region: r, data: JSON.stringify(schools), cachedAt: Date.now() })
          .onConflictDoUpdate({
            target: schoolsCache.region,
            set: { data: JSON.stringify(schools), cachedAt: Date.now() },
          })
        setCachedSchools(schools)
      }
      setSelectedRegion(r)
      setSelectedProvince(null)
      setSelectedCity(null)
      setLevel('province')
    } catch (e) {
      console.error('[useSchoolPicker] fetch region:', e)
      setError('Could not load schools for this region. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [db])

  const selectProvince = useCallback((p: string) => {
    setSelectedProvince(p)
    setSelectedCity(null)
    setLevel('city')
  }, [])

  const selectCity = useCallback((c: string) => {
    setSelectedCity(c)
    setLevel('school')
  }, [])

  const jumpToLevel = useCallback((target: 'region' | 'province' | 'city') => {
    if (target === 'region') {
      setSelectedRegion(null)
      setSelectedProvince(null)
      setSelectedCity(null)
      setCachedSchools([])
    } else if (target === 'province') {
      setSelectedProvince(null)
      setSelectedCity(null)
    } else {
      setSelectedCity(null)
    }
    setLevel(target)
  }, [])

  const reset = useCallback(() => {
    setLevel('region')
    setSelectedRegion(null)
    setSelectedProvince(null)
    setSelectedCity(null)
    setCachedSchools([])
    setError(null)
  }, [])

  return { level, list, selectedRegion, selectedProvince, selectedCity, loading, error, selectRegion, selectProvince, selectCity, jumpToLevel, reset }
}
