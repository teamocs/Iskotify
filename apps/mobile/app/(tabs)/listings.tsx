import { useState, useMemo, useCallback } from 'react'
import { StyleSheet, View, Text, FlatList, Pressable, TextInput, ActivityIndicator, RefreshControl } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined, SparkOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { listings as listingsTable, savedListings as savedListingsTable, careerCourses } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, layout } from '../../theme/tokens'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { syncOnLaunch } from '../../services/sync'
import { getSettings } from '../../services/settings'
import { matchScholarship, scholarshipProfileIncomplete } from '../../utils/scholarshipMatch'
import type { MatchInput, MatchStatus, StudentProfile } from '../../utils/scholarshipMatch'
import { MatchPill } from '../../components/scholarships/MatchPill'
import { InfoBanner } from '../../components/ui/InfoBanner'
import { searchListings, type SearchableListing } from '../../utils/listingSearch'
import { aiSearchListings } from '../../services/listingSearch'
import { canonicalizeRegion } from '../../utils/region'

type Segment = 'exam' | 'scholarship'

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

export default function ExamsScreen() {
  const db = useDb()
  const { getPriority } = useFocusListings()
  const { theme: t, typo, isDark } = useTheme()
  const insets = useSafeAreaInsets()

  const [all, setAll] = useState<ListingRow[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [profile, setProfile] = useState<StudentProfile>({})
  const [userRegion, setUserRegion] = useState<string>('')
  const [userClusters, setUserClusters] = useState<Set<string>>(new Set())
  const [segment, setSegment] = useState<Segment>('exam')
  const [query, setQuery] = useState('')

  // Hybrid search: keyword (instant) is the base; AI (on submit) reorders if available.
  const [aiResults, setAiResults] = useState<ListingRow[] | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadListings = useCallback(async () => {
    const [rows, saved, settings, ccRows] = await Promise.all([
      db.select({
        id: listingsTable.id, slug: listingsTable.slug, title: listingsTable.title,
        type: listingsTable.type, examDate: listingsTable.examDate, region: listingsTable.region,
        provider: listingsTable.provider, province: listingsTable.province, city: listingsTable.city, scope: listingsTable.scope,
        isVerified: listingsTable.isVerified, incomeCeiling: listingsTable.incomeCeiling,
        gwaRequirement: listingsTable.gwaRequirement, serviceObligationYears: listingsTable.serviceObligationYears,
        scholarshipMeta: listingsTable.scholarshipMeta, targetCourses: listingsTable.targetCourses,
      }).from(listingsTable),
      db.select({ id: savedListingsTable.id }).from(savedListingsTable),
      getSettings(db),
      db.select({ courseId: careerCourses.courseId, cluster: careerCourses.cluster }).from(careerCourses),
    ])
    // The local target_courses column stores a JSON array of cluster names (or ["all"]).
    setAll(rows.map(r => ({ ...r, targetCourses: parseStrArray(r.targetCourses as unknown as string) })) as ListingRow[])
    setSavedIds(new Set(saved.map(s => s.id)))
    setUserRegion(settings.schoolRegion ?? '')

    // Map the user's chosen target courses → their course clusters, so we can flag
    // course-specific listings that match the student's field.
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

    setProfile({
      gradeLevel: settings.gradeLevel ?? undefined,
      incomeBracket: settings.incomeBracket ?? undefined,
      gwa: settings.gwa ?? undefined,
      province: settings.province ?? undefined,
      city: settings.city ?? undefined,
    })
  }, [db])

  useFocusEffect(useCallback(() => { void loadListings() }, [loadListings]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await syncOnLaunch(db); await loadListings() } finally { setRefreshing(false) }
  }, [db, loadListings])

  async function toggleSave(listingId: string) {
    if (savedIds.has(listingId)) {
      await db.delete(savedListingsTable).where(eq(savedListingsTable.id, listingId))
      setSavedIds(prev => { const next = new Set(prev); next.delete(listingId); return next })
    } else {
      await db.insert(savedListingsTable).values({ id: listingId, savedAt: Date.now() }).onConflictDoNothing()
      setSavedIds(prev => new Set([...prev, listingId]))
    }
  }

  const typeListings = useMemo(() => all.filter(l => l.type === segment), [all, segment])

  // Scholarship eligibility (computed once per listing for the scholarship tab)
  const matchStatusMap = useMemo<Map<string, MatchStatus>>(() => {
    const map = new Map<string, MatchStatus>()
    for (const l of all) {
      if (l.type === 'scholarship') map.set(l.id, matchScholarship(toMatchInput(l), profile).status)
    }
    return map
  }, [all, profile])

  // Region-recommended exams (exam tab, no active query) pinned to the top.
  const recommended = useMemo(() => {
    if (segment !== 'exam' || query.trim() || !userRegion) return []
    const uReg = canonicalizeRegion(userRegion).toLowerCase()
    return typeListings.filter(l => l.region && canonicalizeRegion(l.region).toLowerCase() === uReg)
  }, [segment, query, userRegion, typeListings])

  const recommendedIds = useMemo(() => new Set(recommended.map(l => l.id)), [recommended])

  // Instant keyword results (the always-on base layer).
  const keywordResults = useMemo(
    () => searchListings(typeListings, query, userRegion) as ListingRow[],
    [typeListings, query, userRegion],
  )

  // What the list shows: AI results (if a submit produced them) else keyword results;
  // when there's no query, the full set minus the pinned recommendations.
  const data = useMemo(() => {
    if (query.trim()) return aiResults ?? keywordResults
    const base = [...typeListings].sort((a, b) => {
      if (segment === 'exam') {
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
  }, [query, aiResults, keywordResults, typeListings, segment, matchStatusMap, recommendedIds])

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

  const onChangeSegment = useCallback((seg: Segment) => {
    setSegment(seg)
    setAiResults(null)
  }, [])

  const scholarColor = isDark ? '#4ade80' : '#16a34a'
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
    title: { fontSize: typo.h2, color: t.textPrimary, letterSpacing: -0.5, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.sm, color: t.textTertiary, marginTop: spacing.xs, fontFamily: 'Lexend_400Regular' },
    seg: { flexDirection: 'row', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.xs, gap: spacing.xs, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
    segBtn: { flex: 1, minHeight: 44, paddingVertical: spacing.sm, borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    segBtnOn: { backgroundColor: 'rgba(128,0,0,0.82)' },
    segTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    segTxtOn: { color: '#fff' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, minHeight: 48 },
    searchInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', padding: 0 },
    clearBtn: { padding: spacing.xs },
    aiHint: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    aiActiveHint: { color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    list: { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + layout.tabBarClearance, gap: spacing.sm },
    card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    cardIcon: { width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    examIcon: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)' },
    scholarIcon: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
    row1: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
    cardTitle: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    row2: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    dateText: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    regionLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    verifiedBadge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.xs, paddingVertical: 2, backgroundColor: 'rgba(34,197,94,0.09)', borderColor: 'rgba(34,197,94,0.25)' },
    verifiedTxt: { fontSize: typo.xs, color: '#16a34a', fontFamily: 'Lexend_600SemiBold' },
    focusBadge: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, flexShrink: 0 },
    focusBadgeTxt: { fontSize: typo.xs, color: '#fff', fontFamily: 'Lexend_600SemiBold' },
    forCourseBadge: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, flexShrink: 0 },
    forCourseTxt: { fontSize: typo.xs, color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    eligibleLine: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginTop: spacing.xs },
    bookmarkBtn: { padding: spacing.sm, flexShrink: 0 },
    bookmarkIcon: { fontSize: 16, opacity: 0.35 },
    bookmarkIconSaved: { opacity: 1 },
    empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: spacing.xxxl },
    sectionWrap: { marginTop: spacing.sm, marginBottom: spacing.xs },
    uniLink: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
    uniLinkTxt: { flex: 1, fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo, insets.bottom])

  const renderCard = useCallback((l: ListingRow) => {
    const exam = l.type === 'exam'
    const isSaved = savedIds.has(l.id)
    const matchStatus: MatchStatus = (!exam && matchStatusMap.has(l.id)) ? matchStatusMap.get(l.id)! : 'unknown'
    const p = getPriority(l.slug)
    const tc = l.targetCourses ?? []
    const openToAll = tc.length === 0 || tc.includes('all')
    const forMyCourse = !openToAll && userClusters.size > 0 && tc.some(c => userClusters.has(c))
    return (
      <Pressable
        style={({ pressed }) => [s.card, { boxShadow: t.shadowSm }, pressed && { opacity: 0.8 }]}
        onPress={() => router.push(`/listings/${l.slug}`)}
        accessibilityRole="button"
      >
        <View style={[s.cardIcon, exam ? s.examIcon : s.scholarIcon]}>
          <Lineicons icon={exam ? GraduationCap1Outlined : SparkOutlined} size={16} color={exam ? t.accentText : scholarColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.row1}>
            <Text style={s.cardTitle} numberOfLines={1}>{l.title}</Text>
            {p !== null ? <View style={s.focusBadge}><Text style={s.focusBadgeTxt}>#{p} Focus</Text></View> : null}
            {forMyCourse ? <View style={s.forCourseBadge}><Text style={s.forCourseTxt}>✦ For your course</Text></View> : null}
          </View>
          <View style={s.row2}>
            {exam ? <Text style={s.dateText}>{fmtDate(l.examDate)}</Text> : null}
            {l.region ? <Text style={s.regionLabel}>📍 {l.region}</Text> : null}
            {!exam && l.province ? <Text style={s.regionLabel}>{l.province}</Text> : null}
            {!exam && l.isVerified ? <View style={s.verifiedBadge}><Text style={s.verifiedTxt}>✓ Verified</Text></View> : null}
            {!exam ? <MatchPill status={matchStatus} /> : null}
          </View>
          {!openToAll ? <Text style={s.eligibleLine} numberOfLines={1}>🎓 {tc.join(' · ')}</Text> : null}
        </View>
        <Pressable
          style={({ pressed }) => [s.bookmarkBtn, pressed && { opacity: 0.7 }]}
          onPress={() => toggleSave(l.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
        >
          <Text style={[s.bookmarkIcon, isSaved && s.bookmarkIconSaved]}>🔖</Text>
        </Pressable>
      </Pressable>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedIds, matchStatusMap, getPriority, userClusters, s, t, scholarColor])

  const showAiActive = !!query.trim() && aiResults !== null
  const listHeader = (
    <>
      {recommended.length > 0 ? (
        <>
          <View style={s.sectionWrap}>
            <SectionHeader title={`★ Recommended for ${canonicalizeRegion(userRegion)}`} />
          </View>
          {recommended.map(l => <View key={`rec-${l.id}`}>{renderCard(l)}</View>)}
          <View style={s.sectionWrap}>
            <SectionHeader title="All entrance exams" />
          </View>
        </>
      ) : null}
    </>
  )

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={s.header}>
          <Text style={s.title}>Exams</Text>
          <Text style={s.subtitle}>College entrance exams & scholarships</Text>
        </View>

        {/* 2-tab segment */}
        <View style={s.seg}>
          {(['exam', 'scholarship'] as Segment[]).map(seg => (
            <Pressable
              key={seg}
              style={({ pressed }) => [s.segBtn, segment === seg && s.segBtnOn, pressed && { opacity: 0.7 }]}
              onPress={() => onChangeSegment(seg)}
              accessibilityRole="button"
            >
              <Text style={[s.segTxt, segment === seg && s.segTxtOn]}>
                {seg === 'exam' ? 'College Entrance Exams' : 'Scholarships'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Smart search */}
        <View style={s.searchRow}>
          <Text style={{ fontSize: typo.sm }}>{aiLoading ? '✨' : '🔍'}</Text>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={onChangeQuery}
            onSubmitEditing={() => void runAiSearch()}
            placeholder="Search or ask, e.g. 'free nursing scholarships near me'"
            placeholderTextColor={t.textTertiary}
            returnKeyType="search"
          />
          {aiLoading ? <ActivityIndicator size="small" color={t.accentText} /> : null}
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
        {query.trim() ? (
          <Text style={[s.aiHint, showAiActive && s.aiActiveHint]}>
            {showAiActive ? '✨ AI-ranked results' : 'Press search to ask the AI'}
          </Text>
        ) : null}

        {/* Universities directory link */}
        {!query.trim() ? (
          <Pressable
            style={({ pressed }) => [s.uniLink, pressed && { opacity: 0.75 }]}
            onPress={() => router.push('/schools/course' as never)}
            accessibilityRole="button"
          >
            <Text style={s.uniLinkTxt}>🏫 Find top universities by course</Text>
            <Text style={{ fontSize: typo.xs, color: t.textTertiary }}>→</Text>
          </Pressable>
        ) : null}

        {/* Prompt to complete the scholarship-matching profile for accurate eligibility. */}
        {segment === 'scholarship' && !query.trim() && scholarshipProfileIncomplete({
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
        ) : null}

        <FlatList
          data={data}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={!query.trim() ? listHeader : null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} progressBackgroundColor={t.surface} />
          }
          ListEmptyComponent={
            <Text style={s.empty}>
              {query.trim() ? 'No matches found. Try different words.' : `No ${segment === 'exam' ? 'exams' : 'scholarships'} yet.`}
            </Text>
          }
          renderItem={({ item }) => renderCard(item)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
