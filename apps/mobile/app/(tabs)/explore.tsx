import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, RefreshControl, Platform } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  GraduationCap1Outlined, CertificateBadge1Outlined, Book1Outlined, Aeroplane1Outlined,
  SearchMinusOutlined, SparkOutlined, Globe1Outlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { useCourseTabOptions } from '../../hooks/useCourseTabOptions'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { listings as listingsTable, careerCourses, careerCountries as countriesTable, careerDestinations as destinationsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, layout, radius, textStyle } from '../../theme/tokens'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { WebRefreshButton } from '../../components/ui/WebRefreshButton'
import { Screen } from '../../components/ui/Screen'
import { FilterChip } from '../../components/ui/Chip'
import { decorative } from '../../components/ui/a11y'
import { TabHeader } from '../../components/TabHeader'
import { NewsFeed } from '../../components/explore/NewsFeed'
import { ListingCard } from '../../components/explore/ListingCard'
import { SearchField } from '../../components/explore/SearchField'
import { ExploreGrid, GridSkeleton, StaticGrid } from '../../components/explore/ExploreGrid'
import {
  dateUrgency, matchBadge, fmtShortDate, truncateQuery, SECTION_SEARCH, type BadgeSpec,
} from '../../components/explore/exploreModel'
import { parseExploreSection, type ExploreSection } from '../../components/navigation/destinations'
import { SchoolsDirectory } from '../../components/schools/SchoolsDirectory'
import { syncOnLaunch } from '../../services/sync'
import { listPublishedBlueprintSlugs } from '../../services/examBlueprints'
import { getSettings } from '../../services/settings'
import { getListingMockBest, getListingAccuracy } from '../../services/homeAggregates'
import { readinessTone, type ReadinessTone } from '../../utils/readinessTone'
import { matchScholarship, scholarshipProfileIncomplete } from '../../utils/scholarshipMatch'
import type { MatchInput, MatchStatus, StudentProfile } from '../../utils/scholarshipMatch'
import { searchListings, rankForDisplay, type SearchableListing } from '../../utils/listingSearch'
import { aiSearchListings } from '../../services/listingSearch'
import { canonicalizeRegion } from '../../utils/region'
import { cachedQuery, subscribe } from '../../services/queryCache'
import { aggregateDestinationCountries } from '../../utils/destinationCountries'
import type { CountryWithCount } from '../../utils/destinationCountries'
import type { CourseTabOption } from '../../utils/courseTabs'
import { useSyncStatus } from '../../hooks/useSyncStatus'
import { useSyncSettled } from '../../components/explore/useSyncSettled'

// ── Types ────────────────────────────────────────────────────────────────────

// Explore sections: the four former Lists tabs plus News & dates (the former
// Updates tab). Keys double as the ?section= / legacy ?tab= deep-link values.
type Tab = ExploreSection
type LoadStatus = 'loading' | 'ready' | 'error'

interface ListingRow extends SearchableListing {
  id: string
  slug: string
  title: string
  type: string
  examDate: number | null
  deadline: number | null
  region: string
  provider: string
  province: string | null
  city: string | null
  scope: string | null
  isVerified: boolean | null
  incomeCeiling: number | null
  gwaRequirement: number | null
  serviceObligationYears: number | null
  scholarshipMeta: string | null
  targetCourses: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseStrArray(s: string | null | undefined): string[] {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
}

function toMatchInput(l: ListingRow): MatchInput {
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(l.scholarshipMeta || '{}') } catch { /* ignore */ }
  return {
    scope: (l.scope as MatchInput['scope']) || 'national',
    isVerified: !!l.isVerified,
    incomeCeiling: l.incomeCeiling ?? null,
    gwaRequirement: l.gwaRequirement ?? null,
    serviceObligationYears: l.serviceObligationYears ?? null,
    province: l.province ?? null,
    city: l.city ?? null,
    targetYearLevels: [],
    hucExcluded: !!meta.huc_excluded,
  }
}

function byExamDate(a: ListingRow, b: ListingRow): number {
  if (!a.examDate) return 1
  if (!b.examDate) return -1
  return a.examDate - b.examDate
}

// ── Module-scope statics ──────────────────────────────────────────────────────

// "Universities" is labelled "Schools & exams": entrance exams (UPCAT dates,
// mocks) live in it, so a student looking for an exam finds it here.
const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'universities', label: 'Schools & exams' },
  { key: 'scholarships', label: 'Scholarships' },
  { key: 'courses', label: 'Courses' },
  { key: 'destinations', label: 'Destinations' },
  { key: 'news', label: 'News & dates' },
]

// Same readiness % → tone mapping as the Today exam tiles, so a number reads
// the same colour everywhere in the app.
const TONE_TO_BADGE: Record<ReadinessTone, BadgeSpec['tone']> = {
  strong: 'success', fair: 'warning', weak: 'danger', none: 'neutral',
}

const listingKey = (l: ListingRow) => l.id
const courseKey = (c: CourseTabOption) => c.courseTab
const countryKey = (c: CountryWithCount) => c.code
const openListing = (slug: string) => router.push(`/listings/${slug}`)
const openCourse = (courseTab: string) => router.push(`/schools/course/${courseTab}` as never)
const openCountry = (code: string) => router.push(`/career/country/${code}` as never)

const renderCourse = (opt: CourseTabOption) => (
  <ListingCard
    icon={Book1Outlined}
    title={opt.label}
    onPress={() => openCourse(opt.courseTab)}
    accessibilityHint="Opens the top schools for this course"
  />
)

const renderCountry = (c: CountryWithCount) => (
  <ListingCard
    icon={Aeroplane1Outlined}
    title={c.name}
    meta={c.courseCount > 0
      ? `${c.region} · ${c.courseCount} course${c.courseCount === 1 ? '' : 's'} in demand`
      : c.region}
    onPress={() => openCountry(c.code)}
    accessibilityHint="Opens careers in this country"
  />
)

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const db = useDb()
  const { getPriority } = useFocusListings()
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  const bp = useBreakpoint()
  const sync = useSyncStatus()
  const syncSettled = useSyncSettled()

  // Desktop web swaps the bottom tab bar for the sidebar: no clearance there.
  const listBottom = insets.bottom + (Platform.OS === 'web' && bp === 'expanded' ? spacing.xl : layout.tabBarClearance)

  // ── Listings state (Schools & exams + Scholarships) ──────────────────────
  const [all, setAll] = useState<ListingRow[]>([])
  const [listStatus, setListStatus] = useState<LoadStatus>('loading')
  const [profile, setProfile] = useState<StudentProfile>({})
  const [userRegion, setUserRegion] = useState<string>('')
  const [userClusters, setUserClusters] = useState<Set<string>>(new Set())
  const [blueprintSlugs, setBlueprintSlugs] = useState<Set<string>>(new Set())
  // Per-exam readiness (getListingMockBest, falling back to listingAccuracy) —
  // the same source the Today exam tiles use, so the numbers agree.
  const [listingMockBest, setListingMockBest] = useState<Map<string, number>>(new Map())
  const [listingAccuracy, setListingAccuracy] = useState<Record<string, number>>({})

  // ── Destinations state ────────────────────────────────────────────────────
  const [destCountries, setDestCountries] = useState<CountryWithCount[]>([])
  const [destStatus, setDestStatus] = useState<LoadStatus | 'idle'>('idle')

  // ── Section + search state ────────────────────────────────────────────────
  const params = useLocalSearchParams<{ tab?: string; section?: string }>()
  const tabParam = params.section ?? params.tab
  const [tab, setTab] = useState<Tab>(() => parseExploreSection(tabParam) ?? 'universities')
  const [query, setQuery] = useState('')

  // Hybrid search: keyword (instant) is the base; AI (on submit) reorders if available.
  const [aiResults, setAiResults] = useState<ListingRow[] | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // ?section= (or legacy ?tab=) → section. Keyed on the param only: it applies
  // on a deep link, a web refresh or a new push, and our own setParams below
  // round-trips to the section already showing.
  useEffect(() => {
    const parsed = parseExploreSection(tabParam)
    if (!parsed) return
    setTab(prev => {
      if (prev === parsed) return prev
      setQuery('')
      setAiResults(null)
      return parsed
    })
  }, [tabParam])

  // ── Courses (shared hook) ─────────────────────────────────────────────────
  const { targetOptions: courseTargetOptions, allOptions: courseAllOptions, loading: courseLoading } = useCourseTabOptions()

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadListings = useCallback(async () => {
    try {
      const [rows, settings, ccRows, bpSlugs, mockBestRows, accuracyRows] = await Promise.all([
        db.select({
          id: listingsTable.id, slug: listingsTable.slug, title: listingsTable.title,
          type: listingsTable.type, examDate: listingsTable.examDate, deadline: listingsTable.deadline, region: listingsTable.region,
          provider: listingsTable.provider, province: listingsTable.province, city: listingsTable.city, scope: listingsTable.scope,
          isVerified: listingsTable.isVerified, incomeCeiling: listingsTable.incomeCeiling,
          gwaRequirement: listingsTable.gwaRequirement, serviceObligationYears: listingsTable.serviceObligationYears,
          scholarshipMeta: listingsTable.scholarshipMeta, targetCourses: listingsTable.targetCourses,
        }).from(listingsTable),
        getSettings(db),
        db.select({ courseId: careerCourses.courseId, cluster: careerCourses.cluster }).from(careerCourses),
        listPublishedBlueprintSlugs(db),
        getListingMockBest(db),
        getListingAccuracy(db),
      ])
      setListingMockBest(new Map(mockBestRows.map(r => [r.listingSlug, r.bestPct])))
      setListingAccuracy(Object.fromEntries(
        accuracyRows.filter(r => r.total > 0).map(r => [r.listingSlug, Math.round((r.ok / r.total) * 100)]),
      ))
      // The local target_courses column stores a JSON array of cluster names (or ["all"]).
      setAll(rows.map(r => ({ ...r, targetCourses: parseStrArray(r.targetCourses as unknown as string) })) as ListingRow[])
      setUserRegion(settings.schoolRegion ?? '')

      // The student's target courses → their course clusters (search ranking).
      const clusterByCourse = new Map<string, string>()
      for (const c of ccRows) if (c.cluster) clusterByCourse.set(c.courseId, c.cluster)
      let userCourses: { careerCourseId?: string | null }[] = []
      try { const v = JSON.parse(settings.targetCourses ?? '[]'); if (Array.isArray(v)) userCourses = v } catch { /* ignore */ }
      const uClusters = new Set<string>()
      for (const uc of userCourses) {
        const cl = uc.careerCourseId ? clusterByCourse.get(uc.careerCourseId) : undefined
        if (cl) uClusters.add(cl)
      }
      setUserClusters(uClusters)
      setBlueprintSlugs(new Set(bpSlugs))
      setProfile({
        gradeLevel: settings.gradeLevel ?? undefined,
        incomeBracket: settings.incomeBracket ?? undefined,
        gwa: settings.gwa ?? undefined,
        province: settings.province ?? undefined,
        city: settings.city ?? undefined,
      })
      setListStatus('ready')
    } catch (e) {
      console.warn('[explore] listings load failed:', e)
      setListStatus('error')
    }
  }, [db])

  const retryListings = useCallback(() => {
    setListStatus('loading')
    void loadListings()
  }, [loadListings])

  const loadDestinations = useCallback(async () => {
    // No early return when loaded: the cache-invalidation subscriber below must
    // be able to force a re-fetch after the web sync lands. cachedQuery dedupes.
    try {
      const [countryRows, destRows] = await cachedQuery(
        'lists:destinations-meta',
        300_000,
        () => Promise.all([
          db.select({ code: countriesTable.code, name: countriesTable.name, region: countriesTable.region }).from(countriesTable),
          db.select({ courseId: destinationsTable.courseId, country: destinationsTable.country }).from(destinationsTable),
        ]),
      )
      const countries = (countryRows as { code: string; name: string | null; region: string | null }[]).map(c => ({
        code: c.code, name: c.name ?? c.code, region: c.region ?? '',
      }))
      const dests = (destRows as { courseId: string | null; country: string | null }[])
        .filter((d): d is { courseId: string; country: string } => !!d.courseId && !!d.country)
      setDestCountries(aggregateDestinationCountries(countries, dests))
      setDestStatus('ready')
    } catch (e) {
      console.warn('[explore] destinations load failed:', e)
      setDestStatus('error')
    }
  }, [db])

  useFocusEffect(useCallback(() => {
    void loadListings()
  }, [loadListings]))

  // A sync that finishes while Explore is open (the first web session, a
  // refresh elsewhere) re-reads the catalog it just wrote.
  useEffect(() => {
    if (syncSettled > 0) void loadListings()
  }, [syncSettled, loadListings])

  // Destinations load lazily, on the first visit to that section.
  useEffect(() => {
    if (tab === 'destinations' && destStatus === 'idle') {
      setDestStatus('loading')
      void loadDestinations()
    }
  }, [tab, destStatus, loadDestinations])

  // Re-fetch destinations when the catalog cache is invalidated (e.g. after the
  // web fire-and-forget sync completes), so a section visited before sync
  // landed doesn't stay stuck on empty.
  useEffect(() => {
    const unsub = subscribe('lists:destinations-meta', () => { void loadDestinations() })
    return unsub
  }, [loadDestinations])

  const [newsRefreshKey, setNewsRefreshKey] = useState(0)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await syncOnLaunch(db)
      setNewsRefreshKey(k => k + 1)
      await loadListings()
      // Sync invalidated the destinations cache; reload on the next visit.
      setDestStatus('idle')
    } finally { setRefreshing(false) }
  }, [db, loadListings])

  // ── Derived data ──────────────────────────────────────────────────────────

  // Entrance exams (minus the general-practice fallback, reachable from any
  // school) and scholarships.
  const exams = useMemo(
    () => all.filter(l => l.type === 'exam' && l.slug !== 'general-cet').sort(byExamDate),
    [all],
  )
  const scholarships = useMemo(() => all.filter(l => l.type === 'scholarship'), [all])

  const matchStatusMap = useMemo<Map<string, MatchStatus>>(() => {
    const map = new Map<string, MatchStatus>()
    for (const l of scholarships) map.set(l.id, matchScholarship(toMatchInput(l), profile).status)
    return map
  }, [scholarships, profile])

  const keywordResults = useMemo(
    () => searchListings(scholarships, query, userRegion) as ListingRow[],
    [scholarships, query, userRegion],
  )

  // Scholarships shown: AI results (if a submit produced them) else keyword
  // results, in the profile-first display order; with no query, eligible and
  // maybe first, then by title.
  const scholarshipData = useMemo(() => {
    if (query.trim()) {
      return rankForDisplay(aiResults ?? keywordResults, {
        tab: 'scholarships', query, profile, clusters: userClusters, region: userRegion, now: Date.now(),
      })
    }
    const rank = (s: MatchStatus | undefined) => (s === 'eligible' ? 0 : s === 'maybe' ? 1 : 2)
    return [...scholarships].sort((a, b) => {
      const ra = rank(matchStatusMap.get(a.id)); const rb = rank(matchStatusMap.get(b.id))
      if (ra !== rb) return ra - rb
      return a.title.localeCompare(b.title)
    })
  }, [query, aiResults, keywordResults, scholarships, matchStatusMap, profile, userClusters, userRegion])

  const runAiSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) { setAiResults(null); return }
    setAiLoading(true)
    try {
      setAiResults((await aiSearchListings(q, scholarships, userRegion)) as ListingRow[] | null)
    } catch {
      setAiResults(null)
    } finally {
      setAiLoading(false)
    }
  }, [query, scholarships, userRegion])

  const onChangeQuery = useCallback((text: string) => {
    setQuery(text)
    setAiResults(null) // typing invalidates the previous AI ranking
  }, [])
  const clearQuery = useCallback(() => onChangeQuery(''), [onChangeQuery])

  // A section switch writes ?section= (dropping a legacy ?tab=), so a web
  // refresh, a bookmark or a shared link reopens the same section.
  const onChangeTab = useCallback((next: Tab) => {
    setTab(next)
    setQuery('')
    setAiResults(null)
    router.setParams({ section: next, tab: undefined })
  }, [])

  const filteredCourseTargets = useMemo<CourseTabOption[]>(() => {
    const q = query.trim().toLowerCase()
    return q ? courseTargetOptions.filter(o => o.label.toLowerCase().includes(q)) : courseTargetOptions
  }, [courseTargetOptions, query])

  const filteredCourseAll = useMemo<CourseTabOption[]>(() => {
    const q = query.trim().toLowerCase()
    return q ? courseAllOptions.filter(o => o.label.toLowerCase().includes(q)) : courseAllOptions
  }, [courseAllOptions, query])

  const filteredDestinations = useMemo<CountryWithCount[]>(() => {
    const q = query.trim().toLowerCase()
    return q ? destCountries.filter(c => c.name.toLowerCase().includes(q)) : destCountries
  }, [destCountries, query])

  // ── Card renderers (stable while their inputs are) ────────────────────────

  const renderExam = useCallback((l: ListingRow) => {
    const hasMock = blueprintSlugs.has(l.slug)
    const readiness = hasMock ? (listingMockBest.get(l.slug) ?? listingAccuracy[l.slug] ?? null) : null
    const p = getPriority(l.slug)
    const badges: BadgeSpec[] = []
    const soon = dateUrgency(l.examDate)
    if (soon) badges.push(soon)
    if (hasMock) {
      badges.push(readiness != null
        ? { label: `Readiness ${readiness}%`, tone: TONE_TO_BADGE[readinessTone(readiness)] }
        : { label: 'Mock exam available', tone: 'neutral' })
    } else if (p !== null) {
      badges.push({ label: `Focus #${p}`, tone: 'accent' })
    }
    const when = l.examDate ? `Exam ${fmtShortDate(l.examDate)}` : 'Exam date TBA'
    return (
      <ListingCard
        icon={GraduationCap1Outlined}
        title={l.title}
        meta={[when, l.region].filter(Boolean).join(' · ')}
        badges={badges}
        onPress={() => openListing(l.slug)}
        accessibilityHint="Opens the exam: dates, requirements and mock practice"
      />
    )
  }, [blueprintSlugs, listingMockBest, listingAccuracy, getPriority])

  const renderScholarship = useCallback((l: ListingRow) => {
    const badges: BadgeSpec[] = []
    const soon = dateUrgency(l.deadline)
    if (soon) badges.push(soon)
    const match = matchBadge(matchStatusMap.get(l.id) ?? 'unknown')
    if (match) badges.push(match)
    const when = l.deadline ? `Apply by ${fmtShortDate(l.deadline)}` : null
    return (
      <ListingCard
        icon={CertificateBadge1Outlined}
        title={l.title}
        meta={[l.provider, when, l.region].filter(Boolean).join(' · ')}
        badges={badges}
        onPress={() => openListing(l.slug)}
        accessibilityHint="Opens the scholarship: deadline, eligibility and how to apply"
      />
    )
  }, [matchStatusMap])

  // ── Section bodies ────────────────────────────────────────────────────────

  const refresh = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} progressBackgroundColor={t.surface} />
  )

  const noMatches = (what: string) => (
    <EmptyState
      icon={<Lineicons icon={SearchMinusOutlined} size={26} color={t.textSecondary} />}
      title={`No matches for “${truncateQuery(query)}”`}
      body={`Try fewer or different words to find ${what}.`}
      actionLabel="Clear search"
      onAction={clearQuery}
    />
  )

  const profileIncomplete = scholarshipProfileIncomplete({
    gwa: profile.gwa ?? null, province: profile.province ?? null, incomeBracket: profile.incomeBracket ?? null,
  })

  // Schools & exams: the focusable entrance exams pinned above the directory
  // (tap one → its page → Add to Focus). Hidden while searching the directory.
  const examsHeader = query.trim() ? null : listStatus === 'error' ? (
    <ErrorState title="Couldn't load entrance exams" onRetry={retryListings} />
  ) : listStatus === 'loading' ? (
    <GridSkeleton label="Loading entrance exams" count={3} />
  ) : exams.length > 0 ? (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <SectionHeader title="Entrance exams" subtitle="Each has dates, requirements and practice. Add your targets to Focus." />
      <StaticGrid items={exams} keyExtractor={listingKey} renderItem={renderExam} />
      <View style={{ marginTop: spacing.md }}>
        <SectionHeader title="All schools" subtitle="Open a school for its entrance exam, courses and tuition" />
      </View>
    </View>
  ) : null

  let body: React.ReactNode
  if (tab === 'news') {
    body = <NewsFeed refreshKey={newsRefreshKey} />
  } else if (tab === 'universities') {
    body = (
      <SchoolsDirectory
        query={query}
        onClearQuery={clearQuery}
        bottomInset={listBottom}
        defaultRegion={userRegion ? canonicalizeRegion(userRegion) : null}
        listHeader={examsHeader}
      />
    )
  } else if (tab === 'scholarships') {
    const firstSync = sync.isSyncing && !sync.firstSyncDone && scholarships.length === 0
    if (listStatus === 'loading' || firstSync) {
      body = <GridSkeleton label="Loading scholarships" />
    } else if (listStatus === 'error') {
      body = <ErrorState title="Couldn't load scholarships" onRetry={retryListings} />
    } else {
      const q = query.trim()
      const eligible = scholarshipData.reduce((n, l) => (matchStatusMap.get(l.id) === 'eligible' ? n + 1 : n), 0)
      const header = (
        <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
          {!q && profileIncomplete ? <ProfileNudge /> : null}
          {q && scholarshipData.length > 0 ? (
            <SectionHeader
              title={`Top scholarships matching "${truncateQuery(q)}"`}
              subtitle={profileIncomplete ? undefined : `You match ${eligible} of ${scholarshipData.length}`}
            />
          ) : null}
        </View>
      )
      body = (
        <ExploreGrid
          data={scholarshipData}
          keyExtractor={listingKey}
          renderItem={renderScholarship}
          ListHeaderComponent={header}
          refreshControl={refresh}
          contentContainerStyle={{ paddingBottom: listBottom }}
          ListEmptyComponent={q ? noMatches('a scholarship') : (
            <EmptyState
              icon={<Lineicons icon={CertificateBadge1Outlined} size={26} color={t.textSecondary} />}
              title="No scholarships yet"
              body="Scholarships appear here once the catalog syncs. Pull down, or use Refresh, to check again."
            />
          )}
        />
      )
    }
  } else if (tab === 'courses') {
    if (courseLoading) {
      body = <GridSkeleton label="Loading courses" />
    } else {
      const header = (
        <View style={{ gap: spacing.sm }}>
          {filteredCourseTargets.length > 0 ? (
            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <SectionHeader title="Your target courses" />
              <StaticGrid items={filteredCourseTargets} keyExtractor={courseKey} renderItem={renderCourse} />
            </View>
          ) : null}
          {filteredCourseAll.length > 0 ? <SectionHeader title="All courses" subtitle="Top schools by PRC board-exam results" /> : null}
        </View>
      )
      body = (
        <ExploreGrid
          data={filteredCourseAll}
          keyExtractor={courseKey}
          renderItem={renderCourse}
          ListHeaderComponent={header}
          refreshControl={refresh}
          contentContainerStyle={{ paddingBottom: listBottom }}
          ListEmptyComponent={query.trim() ? noMatches('a course') : (
            <EmptyState
              icon={<Lineicons icon={Book1Outlined} size={26} color={t.textSecondary} />}
              title="No courses yet"
              body="The course list appears once the catalog syncs."
            />
          )}
        />
      )
    }
  } else {
    if (destStatus === 'loading' || destStatus === 'idle') {
      body = <GridSkeleton label="Loading destinations" />
    } else if (destStatus === 'error') {
      body = <ErrorState title="Couldn't load destinations" onRetry={() => { setDestStatus('loading'); void loadDestinations() }} />
    } else {
      body = (
        <ExploreGrid
          data={filteredDestinations}
          keyExtractor={countryKey}
          renderItem={renderCountry}
          ListHeaderComponent={filteredDestinations.length > 0 ? (
            <View style={{ marginBottom: spacing.sm }}>
              <SectionHeader title="Where your course can take you" subtitle="Countries hiring Filipino graduates, by course demand" />
            </View>
          ) : null}
          refreshControl={refresh}
          contentContainerStyle={{ paddingBottom: listBottom }}
          ListEmptyComponent={query.trim() ? noMatches('a country') : (
            <EmptyState
              icon={<Lineicons icon={Globe1Outlined} size={26} color={t.textSecondary} />}
              title="No destinations yet"
              body="Career destinations appear once the catalog syncs."
            />
          )}
        />
      )
    }
  }

  const search = tab === 'news' ? null : SECTION_SEARCH[tab]
  const aiActive = tab === 'scholarships' && !!query.trim() && aiResults !== null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen
      scroll={false}
      width="wide"
      header={(
        <TabHeader
          title="Explore"
          subtitle="Schools, exams, scholarships, courses and dates"
          actions={<WebRefreshButton onRefresh={onRefresh} refreshing={refreshing} />}
        />
      )}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* Section switcher — wraps rather than scrolls sideways, so every
            section stays visible and the edge-swipe gesture never fights it. */}
        <View
          accessibilityRole="tablist"
          testID="explore-sections"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.md }}
        >
          {TAB_LABELS.map(({ key, label }) => (
            <FilterChip key={key} label={label} role="tab" selected={tab === key} onPress={() => onChangeTab(key)} />
          ))}
        </View>

        {search ? (
          <View style={{ gap: spacing.xs, paddingBottom: spacing.md }}>
            <SearchField
              value={query}
              onChangeText={onChangeQuery}
              onSubmit={tab === 'scholarships' ? () => { void runAiSearch() } : undefined}
              placeholder={search.placeholder}
              accessibilityLabel={search.label}
              busy={tab === 'scholarships' && aiLoading}
            />
            {tab === 'scholarships' && query.trim() ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }} accessibilityLiveRegion="polite">
                <View {...decorative}>
                  <Lineicons icon={SparkOutlined} size={14} color={aiActive ? t.accentText : t.textSecondary} />
                </View>
                <Text style={textStyle('caption', aiActive ? t.accentText : t.textSecondary)} maxFontSizeMultiplier={1.6}>
                  {aiActive ? 'Ranked by on-device AI' : 'Press search to rank these with on-device AI'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ flex: 1 }}>{body}</View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

/** One next step when the scholarship profile is missing: complete it. */
function ProfileNudge() {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md,
        padding: spacing.lg, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2,
      }}
    >
      <View {...decorative}>
        <Lineicons icon={CertificateBadge1Outlined} size={22} color={t.textSecondary} />
      </View>
      <Text style={[textStyle('bodySm', t.textPrimary), { flex: 1, minWidth: 200 }]} maxFontSizeMultiplier={1.6}>
        Add your GWA, family income and province to see which scholarships you qualify for.
      </Text>
      <Button
        label="Complete profile"
        size="sm"
        variant="secondary"
        onPress={() => router.push('/profile/scholarship-info')}
      />
    </View>
  )
}
