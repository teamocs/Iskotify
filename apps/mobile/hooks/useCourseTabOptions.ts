/**
 * hooks/useCourseTabOptions.ts
 *
 * Shared data-loading hook for the course picker.
 * Used by both app/schools/course/index.tsx (standalone deep-link screen)
 * and the Courses tab in app/(tabs)/listings.tsx.
 *
 * Wraps reads in cachedQuery('lists:courses-meta', 300_000) per the data layer pattern.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import {
  userSettings,
  courseTaxonomyMap as taxonomyTable,
} from '../db/schema'
import { resolveCourseTabs, type CourseTabOption } from '../utils/courseTabs'
import { cachedQuery, subscribe } from '../services/queryCache'

interface CourseOption {
  id: string
  label: string
  careerCourseId: string | null
}

interface TaxonomyRow {
  courseTab: string
  careerCourseId: string | null
  label: string | null
}

function parseCourses(raw: string | null | undefined): CourseOption[] {
  try {
    const v = JSON.parse(raw ?? '[]')
    if (!Array.isArray(v)) return []
    return v.filter(
      (x): x is CourseOption =>
        !!x && typeof x.id === 'string' && typeof x.label === 'string',
    )
  } catch {
    return []
  }
}

export interface CourseTabData {
  /** Resolved target-course tabs (may be empty if user has none set). */
  targetOptions: CourseTabOption[]
  /** All course tabs from taxonomy, deduped + sorted alphabetically. */
  allOptions: CourseTabOption[]
  loading: boolean
  /** True when the taxonomy table is empty (sync not yet complete). */
  dbEmpty: boolean
}

export function useCourseTabOptions(): CourseTabData {
  const db = useDb()
  const [targetOptions, setTargetOptions] = useState<CourseTabOption[]>([])
  const [allOptions, setAllOptions]       = useState<CourseTabOption[]>([])
  const [loading, setLoading]             = useState(true)
  const [dbEmpty, setDbEmpty]             = useState(false)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const [settingsRows, taxRows] = await cachedQuery(
        'lists:courses-meta',
        300_000,
        () =>
          Promise.all([
            db.select({ targetCourses: userSettings.targetCourses })
              .from(userSettings)
              .where(eq(userSettings.id, 1))
              .limit(1),
            db.select({
              courseTab: taxonomyTable.courseTab,
              careerCourseId: taxonomyTable.careerCourseId,
              label: taxonomyTable.label,
            }).from(taxonomyTable),
          ]),
      )

      if (!mountedRef.current) return

      if (taxRows.length === 0) {
        setDbEmpty(true)
        return
      }
      setDbEmpty(false)

      const raw = settingsRows[0]?.targetCourses ?? null
      const parsed = parseCourses(raw)
      const resolved = resolveCourseTabs(parsed, taxRows as TaxonomyRow[])
      setTargetOptions(resolved)

      // Dedupe + sort all taxonomy rows
      const seen = new Set<string>()
      const all: CourseTabOption[] = []
      for (const row of taxRows as TaxonomyRow[]) {
        if (!seen.has(row.courseTab)) {
          seen.add(row.courseTab)
          all.push({ courseTab: row.courseTab, label: row.label ?? row.courseTab })
        }
      }
      all.sort((a, b) => a.label.localeCompare(b.label))
      setAllOptions(all)
    } catch (e) {
      console.warn('[useCourseTabOptions] load:', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [db])

  // Load on mount, and RE-LOAD when the catalog cache is invalidated (e.g. after
  // the web fire-and-forget sync completes) — otherwise a fresh web tab that
  // queried the still-empty DB would cache empty options forever. Mirrors the
  // subscribe() refresh used by usePracticeData.
  useEffect(() => {
    mountedRef.current = true
    void load()
    const unsub = subscribe('lists:courses-meta', () => { void load() })
    return () => { mountedRef.current = false; unsub() }
  }, [load])

  return { targetOptions, allOptions, loading, dbEmpty }
}
