import { useState, useMemo, useCallback } from 'react'
import { StyleSheet, View, Text, FlatList, Pressable, TextInput, ActivityIndicator, RefreshControl, ScrollView } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined, SparkOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { useCourseTabOptions } from '../../hooks/useCourseTabOptions'
import { listings as listingsTable, careerCourses, careerCountries as countriesTable, careerDestinations as destinationsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, layout } from '../../theme/tokens'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { ListCard } from '../../components/ui/ListCard'
import { syncOnLaunch } from '../../services/sync'
import { listPublishedBlueprintSlugs } from '../../services/examBlueprints'
import { getSettings } from '../../services/settings'
import { matchScholarship, scholarshipProfileIncomplete } from '../../utils/scholarshipMatch'
import type { MatchInput, MatchStatus, StudentProfile } from '../../utils/scholarshipMatch'
import { MatchPill } from '../../components/scholarships/MatchPill'
import { InfoBanner } from '../../components/ui/InfoBanner'
import { searchListings, type SearchableListing } from '../../utils/listingSearch'
import { aiSearchListings } from '../../services/listingSearch'
import { canonicalizeRegion } from '../../utils/region'
import { cachedQuery } from '../../services/queryCache'
import { aggregateDestinationCountries } from '../../utils/destinationCountries'
import type { CountryWithCount } from '../../utils/destinationCountries'
import type { CourseTabOption } from '../../utils/courseTabs'

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'universities' | 'scholarships' | 'courses' | 'destinations'

interface ListingRow extends SearchableListing {
  id: string
  slug: string
  title: string
  type: string
  examDate: number | null
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

function fmtDate(ts: number | null): string {
  if (!ts) return 'Date TBA'
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

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

// ── Module-scope statics ──────────────────────────────────────────────────────

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'universities', label: 'Universities' },
  { key: 'scholarships', label: 'Scholarships' },
  { key: 'courses', label: 'Courses' },
  { key: 'destinations', label: 'Destinations' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function ListsScreen() {
  const db = useDb()
  const { getPriority } = useFocusListings()
  const { theme: t, typo, isDark } = useTheme()
  const insets = useSafeAreaInsets()

  // ── Listings state (Universities + Scholarships tabs) ─────────────────────
  const [all, setAll] = useState<ListingRow[]>([])
  const [profile, setProfile] = useState<StudentProfile>({})
  const [userRegion, setUserRegion] = useState<string>('')
  const [userClusters, setUserClusters] = useState<Set<string>>(new Set())
  const [blueprintSlugs, setBlueprintSlugs] = useState<Set<string>>(new Set())

  // ── Destinations tab state ────────────────────────────────────────────────
  const [destCountries, setDestCountries] = useState<CountryWithCount[]>([])
  const [destLoaded, setDestLoaded] = useState(false)

  // ── Navigation + search state ─────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('universities')
  const [query, setQuery] = useState('')

  // Hybrid search: keyword (instant) is the base; AI (on submit) reorders if available.
  const [aiResults, setAiResults] = useState<ListingRow[] | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // ── Courses tab (from shared hook) ────────────────────────────────────────
  const { targetOptions: courseTargetOptions, allOptions: courseAllOptions, loading: courseLoading } = useCourseTabOptions()

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadListings = useCallback(async () => {
    const [rows, settings, ccRows, bpSlugs] = await Promise.all([
      db.select({
        id: listingsTable.id, slug: listingsTable.slug, title: listingsTable.title,
        type: listingsTable.type, examDate: listingsTable.examDate, region: listingsTable.region,
        provider: listingsTable.provider, province: listingsTable.province, city: listingsTable.city, scope: listingsTable.scope,
        isVerified: listingsTable.isVerified, incomeCeiling: listingsTable.incomeCeiling,
        gwaRequirement: listingsTable.gwaRequirement, serviceObligationYears: listingsTable.serviceObligationYears,
        scholarshipMeta: listingsTable.scholarshipMeta, targetCourses: listingsTable.targetCourses,
      }).from(listingsTable),
      getSettings(db),
      db.select({ courseId: careerCourses.courseId, cluster: careerCourses.cluster }).from(careerCourses),
      listPublishedBlueprintSlugs(db),
    ])
    // The local target_courses column stores a JSON array of cluster names (or ["all"]).
    setAll(rows.map(r => ({ ...r, targetCourses: parseStrArray(r.targetCourses as unknown as string) })) as ListingRow[])
    setUserRegion(settings.schoolRegion ?? '')

    // Map the user's chosen target courses → their course clusters
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
  }, [db])

  const loadDestinations = useCallback(async () => {
    if (destLoaded) return
    const [countryRows, destRows] = await cachedQuery(
      'lists:destinations-meta',
      300_000,
      () => Promise.all([
        db.select({
          code: countriesTable.code,
          name: countriesTable.name,
          region: countriesTable.region,
        }).from(countriesTable),
        db.select({
          courseId: destinationsTable.courseId,
          country: destinationsTable.country,
        }).from(destinationsTable),
      ]),
    )
    const countries = (countryRows as { code: string; name: string | null; region: string | null }[]).map(c => ({
      code: c.code,
      name: c.name ?? c.code,
      region: c.region ?? '',
    }))
    const dests = (destRows as { courseId: string | null; country: string | null }[])
      .filter((d): d is { courseId: string; country: string } => !!d.courseId && !!d.country)
    setDestCountries(aggregateDestinationCountries(countries, dests))
    setDestLoaded(true)
  }, [db, destLoaded])

  useFocusEffect(useCallback(() => {
    void loadListings()
  }, [loadListings]))

  // Load destinations lazily on first visit to that tab
  useFocusEffect(useCallback(() => {
    if (tab === 'destinations' && !destLoaded) {
      void loadDestinations()
    }
  }, [tab, destLoaded, loadDestinations]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await syncOnLaunch(db)
      await loadListings()
      // Sync invalidated the destinations cache; drop the loaded flag so the
      // focus effect / next tab visit re-pulls fresh destination data.
      setDestLoaded(false)
    } finally { setRefreshing(false) }
  }, [db, loadListings])

  // ── Derived data — Universities + Scholarships ────────────────────────────

  // Map tab to listing type (only for uni/scholarship tabs)
  const listingType = tab === 'universities' ? 'exam' : 'scholarship'
  const typeListings = useMemo(
    () => all.filter(l => l.type === listingType),
    [all, listingType],
  )

  // Scholarship eligibility (computed once per listing)
  const matchStatusMap = useMemo<Map<string, MatchStatus>>(() => {
    const map = new Map<string, MatchStatus>()
    for (const l of all) {
      if (l.type === 'scholarship') map.set(l.id, matchScholarship(toMatchInput(l), profile).status)
    }
    return map
  }, [all, profile])

  // Region-recommended exams (universities tab, no active query) pinned to the top.
  const recommended = useMemo(() => {
    if (tab !== 'universities' || query.trim() || !userRegion) return []
    const uReg = canonicalizeRegion(userRegion).toLowerCase()
    return typeListings.filter(l => l.region && canonicalizeRegion(l.region).toLowerCase() === uReg)
  }, [tab, query, userRegion, typeListings])

  const recommendedIds = useMemo(() => new Set(recommended.map(l => l.id)), [recommended])

  // Instant keyword results (the always-on base layer).
  const keywordResults = useMemo(
    () => searchListings(typeListings, query, userRegion) as ListingRow[],
    [typeListings, query, userRegion],
  )

  // What the listing FlatList shows: AI results (if a submit produced them) else keyword results;
  // when there's no query, the full set minus the pinned recommendations.
  const listingData = useMemo(() => {
    if (query.trim()) return aiResults ?? keywordResults
    const base = [...typeListings].sort((a, b) => {
      if (tab === 'universities') {
        if (!a.examDate) return 1
        if (!b.examDate) return -1
        return a.examDate - b.examDate
      }
      // scholarships: eligible/maybe first, then by title
      const rank = (s: MatchStatus | undefined) => (s === 'eligible' ? 0 : s === 'maybe' ? 1 : 2)
      const ra = rank(matchStatusMap.get(a.id)); const rb = rank(matchStatusMap.get(b.id))
      if (ra !== rb) return ra - rb
      return a.title.localeCompare(b.title)
    })
    return base.filter(l => !recommendedIds.has(l.id))
  }, [query, aiResults, keywordResults, typeListings, tab, matchStatusMap, recommendedIds])

  const runAiSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) { setAiResults(null); return }
    setAiLoading(true)
    try {
      const ranked = await aiSearchListings(q, typeListings, userRegion)
      setAiResults(ranked as ListingRow[] | null)
    } catch {
      setAiResults(null)
    } finally {
      setAiLoading(false)
    }
  }, [query, typeListings, userRegion])

  const onChangeQuery = useCallback((text: string) => {
    setQuery(text)
    setAiResults(null) // typing invalidates the previous AI ranking
  }, [])

  const onChangeTab = useCallback((newTab: Tab) => {
    setTab(newTab)
    setQuery('')
    setAiResults(null)
    // Lazy-load destinations on first switch
    if (newTab === 'destinations') {
      void loadDestinations()
    }
  }, [loadDestinations])

  // ── Filtered data for Courses + Destinations tabs ─────────────────────────

  const filteredCourseTargets = useMemo<CourseTabOption[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return courseTargetOptions
    return courseTargetOptions.filter(opt => opt.label.toLowerCase().includes(q))
  }, [courseTargetOptions, query])

  const filteredCourseAll = useMemo<CourseTabOption[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return courseAllOptions
    return courseAllOptions.filter(opt => opt.label.toLowerCase().includes(q))
  }, [courseAllOptions, query])

  const filteredDestinations = useMemo<CountryWithCount[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return destCountries
    return destCountries.filter(c => c.name.toLowerCase().includes(q))
  }, [destCountries, query])

  // ── Styles ────────────────────────────────────────────────────────────────

  const scholarColor = isDark ? '#4ade80' : '#16a34a'
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
    title: { fontSize: typo.h2, color: t.textPrimary, letterSpacing: -0.5, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.sm, color: t.textTertiary, marginTop: spacing.xs, fontFamily: 'Lexend_400Regular' },
    // 4-tab navigation bar
    tabBar: { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.xs, gap: spacing.xs },
    tabItem: { flex: 1, minHeight: 44, paddingVertical: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    tabItemOn: { backgroundColor: 'rgba(128,0,0,0.82)' },
    tabTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    tabTxtOn: { color: '#fff' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, minHeight: 48 },
    searchInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', padding: 0 },
    clearBtn: { padding: spacing.xs },
    aiHint: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    aiActiveHint: { color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    // Dense list spacing
    list: { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + layout.tabBarClearance, gap: spacing.xs },
    // Dense row for listings
    row: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    rowIcon: { width: 32, height: 32, borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    examIcon: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)' },
    scholarIcon: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
    rowBody: { flex: 1, minWidth: 0, gap: 3 },
    rowTitle: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'nowrap' },
    metaText: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flexShrink: 1 },
    metaSep: { fontSize: typo.xs, color: t.textTertiary, opacity: 0.5 },
    mockBadge: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, flexShrink: 0 },
    mockBadgeTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    focusBadge: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, flexShrink: 0 },
    focusBadgeTxt: { fontSize: typo.xs, color: '#fff', fontFamily: 'Lexend_600SemiBold' },
    empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: spacing.xxxl },
    sectionWrap: { marginTop: spacing.sm, marginBottom: spacing.xs },
    // Courses + Destinations tab content
    scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + layout.tabBarClearance, gap: spacing.sm },
    sectionGap: { gap: spacing.sm },
  }), [t, typo, insets.bottom])

  // ── Listing card renderer (Universities + Scholarships) ───────────────────

  const renderCard = useCallback((l: ListingRow) => {
    const exam = l.type === 'exam'
    const matchStatus: MatchStatus = (!exam && matchStatusMap.has(l.id)) ? matchStatusMap.get(l.id)! : 'unknown'
    const p = getPriority(l.slug)
    const hasMock = exam && blueprintSlugs.has(l.slug)

    const datePart = exam ? fmtDate(l.examDate) : null
    const regionPart = l.region ? `📍 ${l.region}` : (l.province ? l.province : null)

    return (
      <Pressable
        style={({ pressed }) => [s.row, { boxShadow: t.shadowSm }, pressed && { opacity: 0.8 }]}
        onPress={() => router.push(`/listings/${l.slug}`)}
        accessibilityRole="button"
      >
        <View style={[s.rowIcon, exam ? s.examIcon : s.scholarIcon]}>
          <Lineicons icon={exam ? GraduationCap1Outlined : SparkOutlined} size={14} color={exam ? t.accentText : scholarColor} />
        </View>
        <View style={s.rowBody}>
          <Text style={s.rowTitle} numberOfLines={1}>{l.title}</Text>
          <View style={s.rowMeta}>
            {datePart ? (
              <Text style={s.metaText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {datePart}
              </Text>
            ) : null}
            {datePart && regionPart ? (
              <Text style={s.metaSep} maxFontSizeMultiplier={1.4}>·</Text>
            ) : null}
            {regionPart ? (
              <Text style={s.metaText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {regionPart}
              </Text>
            ) : null}
            {!exam && matchStatus !== 'unknown' ? (
              <MatchPill status={matchStatus} />
            ) : null}
            {hasMock ? (
              <View style={s.mockBadge}>
                <Text style={s.mockBadgeTxt} maxFontSizeMultiplier={1.4}>📝 Mock</Text>
              </View>
            ) : null}
            {p !== null && !hasMock ? (
              <View style={s.focusBadge}>
                <Text style={s.focusBadgeTxt} maxFontSizeMultiplier={1.4}>#{p} Focus</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchStatusMap, getPriority, blueprintSlugs, s, t, scholarColor])

  const renderListingItem = useCallback(({ item }: { item: ListingRow }) => renderCard(item), [renderCard])

  const showAiActive = !!query.trim() && aiResults !== null

  // ── List header (universities: region-recommended pinned; scholarships: profile banner) ──
  const listingsListHeader = useMemo(() => {
    if (tab === 'universities' && !query.trim() && recommended.length > 0) {
      return (
        <>
          <View style={s.sectionWrap}>
            <SectionHeader title={`★ Recommended for ${canonicalizeRegion(userRegion)}`} />
          </View>
          {recommended.map(l => <View key={`rec-${l.id}`}>{renderCard(l)}</View>)}
          <View style={s.sectionWrap}>
            <SectionHeader title="All entrance exams" />
          </View>
        </>
      )
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, recommended, userRegion, s, renderCard])

  const scholarshipBanner = tab === 'scholarships' && !query.trim() && scholarshipProfileIncomplete({
    gwa: profile.gwa ?? null, province: profile.province ?? null, incomeBracket: profile.incomeBracket ?? null,
  }) ? (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      <InfoBanner
        icon={<Text style={{ fontSize: 16 }}>🎓</Text>}
        message="Add your income, GWA & province to see which scholarships you actually qualify for."
        actionLabel="Complete"
        onAction={() => router.push('/profile/scholarship-info')}
      />
    </View>
  ) : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Lists</Text>
          <Text style={s.subtitle}>Universities, scholarships, courses & career destinations</Text>
        </View>

        {/* 4-tab navigation bar */}
        <View style={s.tabBar}>
          {TAB_LABELS.map(({ key, label }) => (
            <Pressable
              key={key}
              style={({ pressed }) => [s.tabItem, tab === key && s.tabItemOn, pressed && { opacity: 0.7 }]}
              onPress={() => onChangeTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
            >
              <Text
                style={[s.tabTxt, tab === key && s.tabTxtOn]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Search input (all tabs; AI search only on uni/scholarship) */}
        <View style={s.searchRow}>
          <Text style={{ fontSize: typo.sm }}>
            {(tab === 'universities' || tab === 'scholarships') && aiLoading ? '✨' : '🔍'}
          </Text>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={onChangeQuery}
            onSubmitEditing={() => {
              if (tab === 'universities' || tab === 'scholarships') void runAiSearch()
            }}
            placeholder={
              tab === 'universities' ? "Search or ask, e.g. 'free nursing scholarships near me'"
              : tab === 'scholarships' ? "Search or ask, e.g. 'free nursing scholarships near me'"
              : tab === 'courses' ? 'Filter courses'
              : 'Filter destinations'
            }
            placeholderTextColor={t.textTertiary}
            returnKeyType="search"
          />
          {(tab === 'universities' || tab === 'scholarships') && aiLoading ? (
            <ActivityIndicator size="small" color={t.accentText} />
          ) : null}
          {query ? (
            <Pressable
              style={({ pressed }) => [s.clearBtn, pressed && { opacity: 0.7 }]}
              onPress={() => onChangeQuery('')}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: typo.xs, color: t.textTertiary }}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* AI hint — only on listing tabs */}
        {(tab === 'universities' || tab === 'scholarships') && query.trim() ? (
          <Text style={[s.aiHint, showAiActive && s.aiActiveHint]}>
            {showAiActive ? '✨ AI-ranked results' : 'Press search to ask the AI'}
          </Text>
        ) : null}

        {/* Scholarship profile banner */}
        {scholarshipBanner}

        {/* ── Tab content ── */}
        {(tab === 'universities' || tab === 'scholarships') ? (
          <FlatList
            data={listingData}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={!query.trim() ? listingsListHeader : null}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} progressBackgroundColor={t.surface} />
            }
            ListEmptyComponent={
              <Text style={s.empty}>
                {query.trim()
                  ? 'No matches found. Try different words.'
                  : tab === 'universities' ? 'No exams yet.' : 'No scholarships yet.'}
              </Text>
            }
            renderItem={renderListingItem}
          />
        ) : tab === 'courses' ? (
          <ScrollView
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {courseLoading ? (
              <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
            ) : (
              <>
                {/* Target courses section */}
                {filteredCourseTargets.length > 0 ? (
                  <View style={s.sectionGap}>
                    <SectionHeader title="★ Your target courses" />
                    {filteredCourseTargets.map(opt => (
                      <ListCard
                        key={`target-${opt.courseTab}`}
                        icon={<Text style={{ fontSize: 16 }}>★</Text>}
                        title={opt.label}
                        onPress={() => router.push((`/schools/course/${opt.courseTab}`) as never)}
                      />
                    ))}
                  </View>
                ) : null}
                {/* All courses section */}
                <View style={s.sectionGap}>
                  <SectionHeader title="All courses" />
                  {filteredCourseAll.length > 0 ? filteredCourseAll.map(opt => (
                    <ListCard
                      key={`all-${opt.courseTab}`}
                      title={opt.label}
                      onPress={() => router.push((`/schools/course/${opt.courseTab}`) as never)}
                    />
                  )) : (
                    <Text style={s.empty}>No courses found.</Text>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        ) : (
          /* Destinations tab */
          <ScrollView
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {!destLoaded ? (
              <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
            ) : filteredDestinations.length > 0 ? (
              <View style={s.sectionGap}>
                {filteredDestinations.map(c => {
                  const courseCountTxt = c.courseCount > 0
                    ? `${c.region} · ${c.courseCount} course${c.courseCount === 1 ? '' : 's'} in demand`
                    : c.region
                  return (
                    <ListCard
                      key={c.code}
                      title={c.name}
                      subtitle={courseCountTxt}
                      onPress={() => router.push((`/career/country/${c.code}`) as never)}
                    />
                  )
                })}
              </View>
            ) : (
              <Text style={s.empty}>No destinations found.</Text>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
