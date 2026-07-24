import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import { useDb } from './useDb'
import { listings as listingsTable, careerCourses } from '../db/schema'
import { listPublishedBlueprints } from '../services/examBlueprints'
import { getListingMockBest } from '../services/homeAggregates'
import { getSettings } from '../services/settings'
import { cachedQuery, subscribe } from '../services/queryCache'
import type { StudentProfile } from '../utils/scholarshipMatch'
import type { RankableListing } from '../utils/listingSearch'

// ── Types ────────────────────────────────────────────────────────────────────

/** Exam-listing summary — enough for the FocusExamsFold's suggestion titles + picker. */
export interface ExamListingSummary {
  slug: string
  title: string
  examDate: number | null
}

/** Scholarship-listing shape RecommendedScholarships needs (mirrors the Lists screen's ListingRow). */
export interface ScholarshipListingSummary extends RankableListing {
  id: string
  slug: string
  title: string
  type: string
  status: string
  provider: string
  grantAmount: string
  deadline: number | null
}

export interface BlueprintInfo {
  acronym: string
  name: string
}

export interface HomeCatalog {
  examListings: ExamListingSummary[]
  scholarshipListings: ScholarshipListingSummary[]
  /** Published blueprint slugs, in display order — used to sort the exam picker. */
  blueprintSlugs: string[]
  /** slug → { acronym, name } for blueprint-backed exams (authoritative acronym source). */
  blueprintInfo: Map<string, BlueprintInfo>
  /** listingSlug → best overall mock-exam % (services/homeAggregates.ts:getListingMockBest). */
  listingMockBest: Map<string, number>
  profile: StudentProfile
  clusters: Set<string>
  region: string
  loaded: boolean
  refresh: () => Promise<void>
}

function parseStrArray(s: string | null | undefined): string[] {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useHomeCatalog — the "everything else" catalog Home's new sections need beyond
 * useHomeStats/usePracticeData: full exam + scholarship listing rows, published
 * blueprint metadata, the student profile/clusters used for scholarship ranking
 * (derived exactly like app/(tabs)/listings.tsx), and per-listing mock-exam bests.
 *
 * Cache keys are 'home:'-prefixed so useFocusListings.addListing's invalidate('home:')
 * and Home's pull-to-refresh both refresh this data too.
 */
export function useHomeCatalog(): HomeCatalog {
  const db = useDb()
  const [examListings, setExamListings] = useState<ExamListingSummary[]>([])
  const [scholarshipListings, setScholarshipListings] = useState<ScholarshipListingSummary[]>([])
  const [blueprintSlugs, setBlueprintSlugs] = useState<string[]>([])
  const [blueprintInfo, setBlueprintInfo] = useState<Map<string, BlueprintInfo>>(new Map())
  const [listingMockBest, setListingMockBest] = useState<Map<string, number>>(new Map())
  const [profile, setProfile] = useState<StudentProfile>({})
  const [clusters, setClusters] = useState<Set<string>>(new Set())
  const [region, setRegion] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await cachedQuery('home:catalog', 30_000, async () => {
        const [rows, blueprints, ccRows, settings, mockBestRows] = await Promise.all([
          db.select({
            id: listingsTable.id, slug: listingsTable.slug, title: listingsTable.title,
            type: listingsTable.type, status: listingsTable.status, examDate: listingsTable.examDate,
            deadline: listingsTable.deadline, provider: listingsTable.provider,
            region: listingsTable.region, province: listingsTable.province, city: listingsTable.city,
            scope: listingsTable.scope, isVerified: listingsTable.isVerified,
            incomeCeiling: listingsTable.incomeCeiling, gwaRequirement: listingsTable.gwaRequirement,
            serviceObligationYears: listingsTable.serviceObligationYears,
            scholarshipMeta: listingsTable.scholarshipMeta, targetCourses: listingsTable.targetCourses,
            grantAmount: listingsTable.grantAmount,
          }).from(listingsTable),
          listPublishedBlueprints(db),
          db.select({ courseId: careerCourses.courseId, cluster: careerCourses.cluster }).from(careerCourses),
          getSettings(db),
          getListingMockBest(db),
        ])
        return { rows, blueprints, ccRows, settings, mockBestRows }
      })

      const exams = data.rows
        .filter(r => r.type === 'exam' && r.slug !== 'general-cet')
        .map(r => ({ slug: r.slug, title: r.title, examDate: r.examDate ?? null }))

      const scholarships = data.rows
        .filter(r => r.type === 'scholarship')
        .map(r => ({
          ...r,
          targetCourses: parseStrArray(r.targetCourses as unknown as string),
        })) as ScholarshipListingSummary[]

      const bpSlugs = data.blueprints.map(b => b.slug)
      const bpInfo = new Map(data.blueprints.map(b => [b.slug, { acronym: b.acronym, name: b.name }]))

      const clusterByCourse = new Map<string, string>()
      for (const c of data.ccRows) if (c.cluster) clusterByCourse.set(c.courseId, c.cluster)
      let userCourses: { careerCourseId?: string | null }[] = []
      try {
        const v = JSON.parse(data.settings.targetCourses ?? '[]')
        if (Array.isArray(v)) userCourses = v
      } catch { /* ignore */ }
      const uClusters = new Set<string>()
      for (const uc of userCourses) {
        const cl = uc.careerCourseId ? clusterByCourse.get(uc.careerCourseId) : undefined
        if (cl) uClusters.add(cl)
      }

      const mockBest = new Map(data.mockBestRows.map(r => [r.listingSlug, r.bestPct]))

      setExamListings(exams)
      setScholarshipListings(scholarships)
      setBlueprintSlugs(bpSlugs)
      setBlueprintInfo(bpInfo)
      setListingMockBest(mockBest)
      setClusters(uClusters)
      setRegion(data.settings.schoolRegion ?? '')
      setProfile({
        gradeLevel: data.settings.gradeLevel ?? undefined,
        incomeBracket: data.settings.incomeBracket ?? undefined,
        gwa: data.settings.gwa ?? undefined,
        province: data.settings.province ?? undefined,
        city: data.settings.city ?? undefined,
      })
    } catch (e) {
      console.warn('[useHomeCatalog] load failed:', e)
    } finally {
      setLoaded(true)
    }
  }, [db])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  // Background cache refresh (e.g. after addListing invalidates 'home:') → reload.
  useEffect(() => {
    const unsub = subscribe('home:', () => { void load() })
    return unsub
  }, [load])

  return {
    examListings, scholarshipListings, blueprintSlugs, blueprintInfo, listingMockBest,
    profile, clusters, region, loaded, refresh: load,
  }
}
