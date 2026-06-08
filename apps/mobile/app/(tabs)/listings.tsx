import { useState, useMemo, useCallback } from 'react'
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined, SparkOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { listings as listingsTable, savedListings as savedListingsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { syncOnLaunch } from '../../services/sync'
import { getSettings } from '../../services/settings'
import { matchScholarship } from '../../utils/scholarshipMatch'
import type { MatchInput, MatchStatus, StudentProfile } from '../../utils/scholarshipMatch'
import { MatchPill } from '../../components/scholarships/MatchPill'
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
}

function fmtDate(ts: number | null): string {
  if (!ts) return 'Date TBA'
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
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

  const [all, setAll] = useState<ListingRow[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [profile, setProfile] = useState<StudentProfile>({})
  const [userRegion, setUserRegion] = useState<string>('')
  const [segment, setSegment] = useState<Segment>('exam')
  const [query, setQuery] = useState('')

  // Hybrid search: keyword (instant) is the base; AI (on submit) reorders if available.
  const [aiResults, setAiResults] = useState<ListingRow[] | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadListings = useCallback(async () => {
    const [rows, saved, settings] = await Promise.all([
      db.select({
        id: listingsTable.id, slug: listingsTable.slug, title: listingsTable.title,
        type: listingsTable.type, examDate: listingsTable.examDate, region: listingsTable.region,
        provider: listingsTable.provider, province: listingsTable.province, city: listingsTable.city, scope: listingsTable.scope,
        isVerified: listingsTable.isVerified, incomeCeiling: listingsTable.incomeCeiling,
        gwaRequirement: listingsTable.gwaRequirement, serviceObligationYears: listingsTable.serviceObligationYears,
        scholarshipMeta: listingsTable.scholarshipMeta,
      }).from(listingsTable),
      db.select({ id: savedListingsTable.id }).from(savedListingsTable),
      getSettings(db),
    ])
    setAll(rows as ListingRow[])
    setSavedIds(new Set(saved.map(s => s.id)))
    setUserRegion(settings.schoolRegion ?? '')
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
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    seg: { flexDirection: 'row', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 12, padding: 3, gap: 3, marginHorizontal: 16, marginBottom: 8 },
    segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
    segBtnOn: { backgroundColor: 'rgba(128,0,0,0.82)' },
    segTxt: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    segTxtOn: { color: '#fff' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9, marginHorizontal: 16, marginBottom: 6 },
    searchInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', padding: 0 },
    aiHint: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', paddingHorizontal: 16, marginBottom: 6 },
    aiActiveHint: { color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    sectionLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 8 },
    list: { paddingHorizontal: 16, paddingBottom: 110 },
    card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 20, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    cardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    examIcon: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)' },
    scholarIcon: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
    row1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    cardTitle: { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    row2: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    dateText: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    regionLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    verifiedBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: 'rgba(34,197,94,0.09)', borderColor: 'rgba(34,197,94,0.25)' },
    verifiedTxt: { fontSize: typo.xs, fontWeight: '600', color: '#16a34a', fontFamily: 'Lexend_600SemiBold' },
    focusBadge: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
    focusBadgeTxt: { fontSize: typo.xs, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },
    bookmarkBtn: { padding: 2, flexShrink: 0 },
    bookmarkIcon: { fontSize: 14, opacity: 0.35 },
    bookmarkIconSaved: { opacity: 1 },
    empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: 32 },
    uniLink: { marginHorizontal: 16, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
    uniLinkTxt: { flex: 1, fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  const renderCard = useCallback((l: ListingRow) => {
    const exam = l.type === 'exam'
    const isSaved = savedIds.has(l.id)
    const matchStatus: MatchStatus = (!exam && matchStatusMap.has(l.id)) ? matchStatusMap.get(l.id)! : 'unknown'
    const p = getPriority(l.slug)
    return (
      <TouchableOpacity style={s.card} onPress={() => router.push(`/listings/${l.slug}`)} activeOpacity={0.8}>
        <View style={[s.cardIcon, exam ? s.examIcon : s.scholarIcon]}>
          <Lineicons icon={exam ? GraduationCap1Outlined : SparkOutlined} size={16} color={exam ? t.accentText : scholarColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.row1}>
            <Text style={s.cardTitle} numberOfLines={1}>{l.title}</Text>
            {p !== null ? <View style={s.focusBadge}><Text style={s.focusBadgeTxt}>#{p} Focus</Text></View> : null}
          </View>
          <View style={s.row2}>
            {exam ? <Text style={s.dateText}>{fmtDate(l.examDate)}</Text> : null}
            {l.region ? <Text style={s.regionLabel}>📍 {l.region}</Text> : null}
            {!exam && l.province ? <Text style={s.regionLabel}>{l.province}</Text> : null}
            {!exam && l.isVerified ? <View style={s.verifiedBadge}><Text style={s.verifiedTxt}>✓ Verified</Text></View> : null}
            {!exam ? <MatchPill status={matchStatus} /> : null}
          </View>
        </View>
        <TouchableOpacity style={s.bookmarkBtn} onPress={() => toggleSave(l.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[s.bookmarkIcon, isSaved && s.bookmarkIconSaved]}>🔖</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedIds, matchStatusMap, getPriority, s, t, scholarColor])

  const showAiActive = !!query.trim() && aiResults !== null
  const listHeader = (
    <>
      {recommended.length > 0 ? (
        <>
          <Text style={s.sectionLabel}>★ Recommended for {canonicalizeRegion(userRegion)}</Text>
          {recommended.map(l => <View key={`rec-${l.id}`}>{renderCard(l)}</View>)}
          <Text style={s.sectionLabel}>All entrance exams</Text>
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
            <TouchableOpacity key={seg} style={[s.segBtn, segment === seg && s.segBtnOn]} onPress={() => onChangeSegment(seg)}>
              <Text style={[s.segTxt, segment === seg && s.segTxtOn]}>
                {seg === 'exam' ? 'College Entrance Exams' : 'Scholarships'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Smart search */}
        <View style={s.searchRow}>
          <Text style={{ fontSize: 13 }}>{aiLoading ? '✨' : '🔍'}</Text>
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
            <TouchableOpacity onPress={() => onChangeQuery('')}>
              <Text style={{ fontSize: 12, color: t.textTertiary, paddingHorizontal: 4 }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {query.trim() ? (
          <Text style={[s.aiHint, showAiActive && s.aiActiveHint]}>
            {showAiActive ? '✨ AI-ranked results' : 'Press search to ask the AI'}
          </Text>
        ) : null}

        {/* Universities directory link */}
        {!query.trim() ? (
          <TouchableOpacity style={s.uniLink} onPress={() => router.push('/schools/course' as never)} activeOpacity={0.75}>
            <Text style={s.uniLinkTxt}>🏫 Find top universities by course</Text>
            <Text style={{ fontSize: typo.xs, color: t.textTertiary }}>→</Text>
          </TouchableOpacity>
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
