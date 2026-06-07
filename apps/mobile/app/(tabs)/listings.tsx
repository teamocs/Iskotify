import { useState, useEffect, useMemo, useCallback } from 'react'
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, ScrollView, RefreshControl } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined, SparkOutlined, Funnel1Outlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { listings as listingsTable, savedListings as savedListingsTable, tertiarySchools as schoolsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { syncOnLaunch } from '../../services/sync'
import { getSettings } from '../../services/settings'
import { matchScholarship } from '../../utils/scholarshipMatch'
import type { MatchInput, MatchStatus, StudentProfile } from '../../utils/scholarshipMatch'
import { MatchPill } from '../../components/scholarships/MatchPill'

type Segment = 'all' | 'exam' | 'scholarship' | 'universities'

interface SchoolRow {
  id: string
  name: string
  acronym: string | null
  region: string | null
  type: string | null
  isSuc: boolean
  isLuc: boolean
}

interface ListingRow {
  id: string
  slug: string
  title: string
  type: string
  status: string
  examDate: number | null
  region: string
  provider: string
  // scholarship-specific fields
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

function hasAnyMatcherField(profile: StudentProfile): boolean {
  return (
    profile.incomeBracket != null ||
    profile.gwa != null ||
    profile.province != null
  )
}

export default function ListingsScreen() {
  const db = useDb()
  const { isInFocus, getPriority } = useFocusListings()
  const [all, setAll] = useState<ListingRow[]>([])
  const [allSchools, setAllSchools] = useState<SchoolRow[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [segment, setSegment] = useState<Segment>('all')
  const [query, setQuery] = useState('')
  const [regionFilter, setRegionFilter] = useState<string | null>(null)
  const [schoolRegionFilter, setSchoolRegionFilter] = useState<string | null>(null)
  const [schoolTypeFilter, setSchoolTypeFilter] = useState<string | null>(null)

  // User profile for eligibility matching
  const [profile, setProfile] = useState<StudentProfile>({})

  // Scholarship facet state
  const [facetProvider, setFacetProvider] = useState<string | null>(null)
  const [facetProvince, setFacetProvince] = useState<string | null>(null)
  const [facetVerifiedOnly, setFacetVerifiedOnly] = useState(false)
  const [facetNearMe, setFacetNearMe] = useState(false)
  const [facetEligibleForMe, setFacetEligibleForMe] = useState(false)

  const loadListings = useCallback(async () => {
    const [rows, saved, settings, schoolRows] = await Promise.all([
      db.select({
        id: listingsTable.id,
        slug: listingsTable.slug,
        title: listingsTable.title,
        type: listingsTable.type,
        status: listingsTable.status,
        examDate: listingsTable.examDate,
        region: listingsTable.region,
        provider: listingsTable.provider,
        province: listingsTable.province,
        city: listingsTable.city,
        scope: listingsTable.scope,
        isVerified: listingsTable.isVerified,
        incomeCeiling: listingsTable.incomeCeiling,
        gwaRequirement: listingsTable.gwaRequirement,
        serviceObligationYears: listingsTable.serviceObligationYears,
        scholarshipMeta: listingsTable.scholarshipMeta,
      }).from(listingsTable),
      db.select({ id: savedListingsTable.id }).from(savedListingsTable),
      getSettings(db),
      db.select({
        id: schoolsTable.id,
        name: schoolsTable.name,
        acronym: schoolsTable.acronym,
        region: schoolsTable.region,
        type: schoolsTable.type,
        isSuc: schoolsTable.isSuc,
        isLuc: schoolsTable.isLuc,
      }).from(schoolsTable),
    ])
    setAll(rows)
    setAllSchools(schoolRows as SchoolRow[])
    setSavedIds(new Set(saved.map(s => s.id)))
    setProfile({
      gradeLevel: settings.gradeLevel ?? undefined,
      incomeBracket: settings.incomeBracket ?? undefined,
      gwa: settings.gwa ?? undefined,
      province: settings.province ?? undefined,
      city: settings.city ?? undefined,
    })
  }, [db])

  useFocusEffect(useCallback(() => { void loadListings() }, [loadListings]))

  const refresh = useCallback(async () => {
    await syncOnLaunch(db)
    await loadListings()
  }, [db, loadListings])

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }, [refresh])

  async function toggleSave(listingId: string) {
    if (savedIds.has(listingId)) {
      await db.delete(savedListingsTable).where(eq(savedListingsTable.id, listingId))
      setSavedIds(prev => { const next = new Set(prev); next.delete(listingId); return next })
    } else {
      await db.insert(savedListingsTable).values({ id: listingId, savedAt: Date.now() }).onConflictDoNothing()
      setSavedIds(prev => new Set([...prev, listingId]))
    }
  }

  // Derive distinct non-empty regions for filter chips
  const regions = useMemo(() => {
    const set = new Set<string>()
    for (const l of all) { if (l.region) set.add(l.region) }
    return Array.from(set).sort()
  }, [all])

  // Scholarship-only derived facet options
  const scholarships = useMemo(() => all.filter(l => l.type === 'scholarship'), [all])

  const scholarProviders = useMemo(() => {
    const set = new Set<string>()
    for (const l of scholarships) { if (l.provider) set.add(l.provider) }
    return Array.from(set).sort().slice(0, 8) // cap at top 8
  }, [scholarships])

  const scholarProvinces = useMemo(() => {
    const set = new Set<string>()
    for (const l of scholarships) { if (l.province) set.add(l.province) }
    return Array.from(set).sort()
  }, [scholarships])

  // Pre-compute match statuses once per listing (only for scholarship segment)
  const matchStatusMap = useMemo<Map<string, MatchStatus>>(() => {
    const map = new Map<string, MatchStatus>()
    for (const l of scholarships) {
      map.set(l.id, matchScholarship(toMatchInput(l), profile).status)
    }
    return map
  }, [scholarships, profile])

  const profileHasData = useMemo(() => hasAnyMatcherField(profile), [profile])

  // ── University-segment derived state ──────────────────────────────────────
  const schoolRegions = useMemo(() => {
    const set = new Set<string>()
    for (const s of allSchools) { if (s.region) set.add(s.region) }
    return Array.from(set).sort()
  }, [allSchools])

  const schoolTypes = useMemo(() => {
    const set = new Set<string>()
    for (const s of allSchools) { if (s.type) set.add(s.type) }
    return Array.from(set).sort()
  }, [allSchools])

  const filteredSchools = useMemo(() => {
    return allSchools
      .filter(s => !schoolRegionFilter || s.region === schoolRegionFilter)
      .filter(s => !schoolTypeFilter || s.type === schoolTypeFilter)
      .filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()) ||
        (s.acronym ?? '').toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allSchools, query, schoolRegionFilter, schoolTypeFilter])

  const filtered = useMemo(() => {
    return all
      .filter(l => segment === 'all' || l.type === segment)
      .filter(l => !regionFilter || l.region === regionFilter)
      .filter(l => !query || l.title.toLowerCase().includes(query.toLowerCase()))
      // Scholarship facets (only apply when segment is 'scholarship')
      .filter(l => {
        if (l.type !== 'scholarship') return true
        if (facetProvider && l.provider !== facetProvider) return false
        if (facetProvince && l.province !== facetProvince) return false
        if (facetVerifiedOnly && !l.isVerified) return false
        if (facetNearMe && profile.province && l.province !== profile.province) return false
        if (facetEligibleForMe && profileHasData) {
          const status = matchStatusMap.get(l.id) ?? 'unknown'
          if (status !== 'eligible' && status !== 'maybe') return false
        }
        return true
      })
      .sort((a, b) => {
        if (!a.examDate) return 1
        if (!b.examDate) return -1
        return a.examDate - b.examDate
      })
  }, [all, segment, query, regionFilter, facetProvider, facetProvince, facetVerifiedOnly, facetNearMe, facetEligibleForMe, matchStatusMap, profile, profileHasData])

  const { theme: t, typo, isDark } = useTheme()
  const scholarColor = isDark ? '#4ade80' : '#16a34a'
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    seg: { flexDirection: 'row', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 10, padding: 3, gap: 2, marginHorizontal: 16, marginBottom: 8 },
    segBtn: { flex: 1, paddingVertical: 5, borderRadius: 8, alignItems: 'center' },
    segBtnOn: { backgroundColor: 'rgba(128,0,0,0.82)' },
    segTxt: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    segTxtOn: { color: '#fff' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8, marginHorizontal: 16, marginBottom: 8 },
    searchInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', padding: 0 },
    searchDivider: { width: 1, height: 13, backgroundColor: t.divider },
    regionWrap: { height: 44, marginBottom: 2 },
    regionScroll: { flex: 1 },
    regionContent: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 },
    regionChip: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 980, paddingHorizontal: 12, paddingVertical: 5 },
    regionChipOn: { backgroundColor: 'rgba(128,0,0,0.75)', borderColor: 'transparent' },
    regionTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    regionTxtOn: { color: '#fff' },
    // Facet chips (same pill style, slightly smaller)
    facetWrap: { marginBottom: 4 },
    facetRow: { paddingHorizontal: 16, flexDirection: 'row', gap: 7, flexWrap: 'wrap', paddingBottom: 4 },
    facetChip: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
    facetChipOn: { backgroundColor: 'rgba(128,0,0,0.75)', borderColor: 'transparent' },
    facetChipDisabled: { opacity: 0.4 },
    facetTxt: { fontSize: typo.xs, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    facetTxtOn: { color: '#fff' },
    facetLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', paddingHorizontal: 16, marginBottom: 2 },
    list: { paddingHorizontal: 16, paddingBottom: 100 },
    card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    cardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    examIcon: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)' },
    scholarIcon: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
    row1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    cardTitle: { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    typeBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
    examBadge: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.25)' },
    scholarBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.22)' },
    typeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    row2: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    dateText: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    regionLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: 'rgba(34,197,94,0.09)', borderColor: 'rgba(34,197,94,0.25)' },
    verifiedTxt: { fontSize: typo.xs, fontWeight: '600', color: '#16a34a', fontFamily: 'Lexend_600SemiBold' },
    unverifiedBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: t.surfaceSubtle, borderColor: t.border },
    unverifiedTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    bookmarkBtn: { padding: 2, flexShrink: 0 },
    bookmarkIcon: { fontSize: 14, opacity: 0.35 },
    bookmarkIconSaved: { opacity: 1 },
    focusBadge: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
    focusBadgeTxt: { fontSize: typo.xs, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },
    empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: 32 },
    eligibleHint: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.xs, marginTop: 6, marginHorizontal: 24 },
    // Universities segment
    uniCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    uniIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: 'rgba(79,70,229,0.12)', borderWidth: 1, borderColor: 'rgba(79,70,229,0.22)' },
    uniIconTxt: { fontSize: 16 },
    uniName: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    uniMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
    uniMetaTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    uniBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(79,70,229,0.10)', borderWidth: 1, borderColor: 'rgba(79,70,229,0.20)' },
    uniBadgeTxt: { fontSize: typo.xs, fontWeight: '600', color: '#818cf8', fontFamily: 'Lexend_600SemiBold' },
    uniLinks: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
    uniLinkRow: { flexDirection: 'row', gap: 8 },
    uniLinkBtn: { flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
    uniLinkTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular', flex: 1 },
    uniLinkArr: { fontSize: typo.xs, color: t.textTertiary },
  }), [t, typo])

  const isExam = (l: ListingRow) => l.type === 'exam'
  const isScholarshipSegment = segment === 'scholarship'
  const isUniversitiesSegment = segment === 'universities'

  const segmentLabel: Record<Segment, string> = {
    all: 'All',
    exam: 'Exams',
    scholarship: 'Scholarships',
    universities: 'Universities',
  }

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >

      <View style={s.header}>
        <Text style={s.title}>Listings</Text>
        <Text style={s.subtitle}>
          {isUniversitiesSegment ? 'University Directory' : 'Exams & Scholarships'}
        </Text>
      </View>

      {/* Segment control */}
      <View style={s.seg}>
        {(['all', 'exam', 'scholarship', 'universities'] as Segment[]).map(seg => (
          <TouchableOpacity key={seg} style={[s.segBtn, segment === seg && s.segBtnOn]} onPress={() => setSegment(seg)}>
            <Text style={[s.segTxt, segment === seg && s.segTxtOn]}>
              {segmentLabel[seg]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <Text style={{ fontSize: 13, color: t.textTertiary }}>🔍</Text>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={isUniversitiesSegment ? 'Search universities...' : 'Search listings...'}
          placeholderTextColor={t.textTertiary}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={{ fontSize: 12, color: t.textTertiary, paddingHorizontal: 4 }}>✕</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={s.searchDivider} />
            <Lineicons icon={Funnel1Outlined} size={13} color={t.textTertiary} />
          </>
        )}
      </View>

      {/* Region filter chips — listings segments only */}
      {!isUniversitiesSegment && regions.length > 0 ? (
        <View style={s.regionWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.regionContent}
            style={s.regionScroll}
          >
            <TouchableOpacity
              style={[s.regionChip, !regionFilter && s.regionChipOn]}
              onPress={() => setRegionFilter(null)}
            >
              <Text style={[s.regionTxt, !regionFilter && s.regionTxtOn]}>All Regions</Text>
            </TouchableOpacity>
            {regions.map(r => (
              <TouchableOpacity
                key={r}
                style={[s.regionChip, regionFilter === r && s.regionChipOn]}
                onPress={() => setRegionFilter(prev => prev === r ? null : r)}
              >
                <Text style={[s.regionTxt, regionFilter === r && s.regionTxtOn]}>📍 {r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Universities filter chips */}
      {isUniversitiesSegment && schoolRegions.length > 0 ? (
        <View style={s.regionWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.regionContent}
            style={s.regionScroll}
          >
            <TouchableOpacity
              style={[s.regionChip, !schoolRegionFilter && s.regionChipOn]}
              onPress={() => setSchoolRegionFilter(null)}
            >
              <Text style={[s.regionTxt, !schoolRegionFilter && s.regionTxtOn]}>All Regions</Text>
            </TouchableOpacity>
            {schoolRegions.map(r => (
              <TouchableOpacity
                key={r}
                style={[s.regionChip, schoolRegionFilter === r && s.regionChipOn]}
                onPress={() => setSchoolRegionFilter(prev => prev === r ? null : r)}
              >
                <Text style={[s.regionTxt, schoolRegionFilter === r && s.regionTxtOn]}>📍 {r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Scholarship facets — only shown in Scholarships segment */}
      {isScholarshipSegment && (
        <View style={s.facetWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.regionContent, { paddingBottom: 2 }]}
          >
            {/* Verified only */}
            <TouchableOpacity
              style={[s.facetChip, facetVerifiedOnly && s.facetChipOn]}
              onPress={() => setFacetVerifiedOnly(v => !v)}
            >
              <Text style={[s.facetTxt, facetVerifiedOnly && s.facetTxtOn]}>✓ Verified</Text>
            </TouchableOpacity>

            {/* Near me — only when user.province is set */}
            {profile.province ? (
              <TouchableOpacity
                style={[s.facetChip, facetNearMe && s.facetChipOn]}
                onPress={() => setFacetNearMe(v => !v)}
              >
                <Text style={[s.facetTxt, facetNearMe && s.facetTxtOn]}>📍 Near me</Text>
              </TouchableOpacity>
            ) : null}

            {/* Eligible for me */}
            <TouchableOpacity
              style={[s.facetChip, facetEligibleForMe && s.facetChipOn, !profileHasData && s.facetChipDisabled]}
              onPress={() => { if (profileHasData) setFacetEligibleForMe(v => !v) }}
              disabled={!profileHasData}
            >
              <Text style={[s.facetTxt, facetEligibleForMe && s.facetTxtOn]}>⭐ Eligible for me</Text>
            </TouchableOpacity>

            {/* Province chips */}
            {scholarProvinces.map(prov => (
              <TouchableOpacity
                key={prov}
                style={[s.facetChip, facetProvince === prov && s.facetChipOn]}
                onPress={() => setFacetProvince(prev => prev === prov ? null : prov)}
              >
                <Text style={[s.facetTxt, facetProvince === prov && s.facetTxtOn]}>{prov}</Text>
              </TouchableOpacity>
            ))}

            {/* Provider chips */}
            {scholarProviders.map(prov => (
              <TouchableOpacity
                key={prov}
                style={[s.facetChip, facetProvider === prov && s.facetChipOn]}
                onPress={() => setFacetProvider(prev => prev === prov ? null : prov)}
              >
                <Text style={[s.facetTxt, facetProvider === prov && s.facetTxtOn]}>{prov}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Hint when eligible filter is active but profile has no data */}
          {facetEligibleForMe && !profileHasData ? (
            <Text style={s.eligibleHint}>Complete your profile (GWA, income, province) to use this filter.</Text>
          ) : null}
        </View>
      )}

      {/* Universities type filter chips */}
      {isUniversitiesSegment && schoolTypes.length > 0 ? (
        <View style={s.facetWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.regionContent, { paddingBottom: 2 }]}
          >
            <TouchableOpacity
              style={[s.facetChip, !schoolTypeFilter && s.facetChipOn]}
              onPress={() => setSchoolTypeFilter(null)}
            >
              <Text style={[s.facetTxt, !schoolTypeFilter && s.facetTxtOn]}>All Types</Text>
            </TouchableOpacity>
            {schoolTypes.map(typ => (
              <TouchableOpacity
                key={typ}
                style={[s.facetChip, schoolTypeFilter === typ && s.facetChipOn]}
                onPress={() => setSchoolTypeFilter(prev => prev === typ ? null : typ)}
              >
                <Text style={[s.facetTxt, schoolTypeFilter === typ && s.facetTxtOn]}>{typ}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Universities quick-links */}
      {isUniversitiesSegment ? (
        <View style={s.uniLinks}>
          <View style={s.uniLinkRow}>
            <TouchableOpacity
              style={s.uniLinkBtn}
              onPress={() => router.push('/schools/course' as never)}
              activeOpacity={0.75}
            >
              <Text style={s.uniLinkTxt}>Find top schools by course</Text>
              <Text style={s.uniLinkArr}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Universities list */}
      {isUniversitiesSegment ? (
        <FlatList
          data={filteredSchools}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.accent}
              colors={[t.accent]}
              progressBackgroundColor={t.surface}
            />
          }
          ListEmptyComponent={<Text style={s.empty}>No universities found.</Text>}
          renderItem={({ item: school }) => (
            <TouchableOpacity
              style={s.uniCard}
              onPress={() => router.push(`/schools/${school.id}` as never)}
              activeOpacity={0.8}
            >
              <View style={s.uniIcon}>
                <Text style={s.uniIconTxt}>🏫</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.uniName} numberOfLines={2}>{school.name}</Text>
                <View style={s.uniMeta}>
                  {school.region ? <Text style={s.uniMetaTxt}>📍 {school.region}</Text> : null}
                  {school.type ? (
                    <View style={s.uniBadge}>
                      <Text style={s.uniBadgeTxt}>{school.type}</Text>
                    </View>
                  ) : null}
                  {school.isSuc ? (
                    <View style={s.uniBadge}>
                      <Text style={s.uniBadgeTxt}>SUC</Text>
                    </View>
                  ) : null}
                  {school.isLuc ? (
                    <View style={s.uniBadge}>
                      <Text style={s.uniBadgeTxt}>LUC</Text>
                    </View>
                  ) : null}
                  {school.acronym ? <Text style={s.uniMetaTxt}>· {school.acronym}</Text> : null}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.accent}
              colors={[t.accent]}
              progressBackgroundColor={t.surface}
            />
          }
          ListEmptyComponent={<Text style={s.empty}>No listings found.</Text>}
          renderItem={({ item: l }) => {
            const exam = isExam(l)
            const isSaved = savedIds.has(l.id)
            const matchStatus: MatchStatus = (!exam && matchStatusMap.has(l.id))
              ? (matchStatusMap.get(l.id) as MatchStatus)
              : 'unknown'
            return (
              <TouchableOpacity
                style={s.card}
                onPress={() => router.push(`/listings/${l.slug}`)}
                activeOpacity={0.8}
              >
                <View style={[s.cardIcon, exam ? s.examIcon : s.scholarIcon]}>
                  <Lineicons
                    icon={exam ? GraduationCap1Outlined : SparkOutlined}
                    size={16}
                    color={exam ? t.accentText : scholarColor}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.row1}>
                    <Text style={s.cardTitle} numberOfLines={1}>{l.title}</Text>
                    <View style={[s.typeBadge, exam ? s.examBadge : s.scholarBadge]}>
                      <Text style={[s.typeTxt, { color: exam ? t.accentText : scholarColor }]}>
                        {exam ? 'Exam' : 'Scholar'}
                      </Text>
                    </View>
                    {(() => {
                      const p = getPriority(l.slug)
                      return p !== null ? (
                        <View style={s.focusBadge}>
                          <Text style={s.focusBadgeTxt}>#{p} Focus</Text>
                        </View>
                      ) : null
                    })()}
                  </View>
                  <View style={s.row2}>
                    <Text style={s.dateText}>{fmtDate(l.examDate)}</Text>
                    {l.region ? <Text style={s.regionLabel}>📍 {l.region}</Text> : null}
                    {/* Scholarship-specific: province, verified badge, match pill */}
                    {!exam && l.province ? (
                      <Text style={s.regionLabel}>{l.province}</Text>
                    ) : null}
                    {!exam ? (
                      l.isVerified
                        ? <View style={s.verifiedBadge}><Text style={s.verifiedTxt}>✓ Verified</Text></View>
                        : <View style={s.unverifiedBadge}><Text style={s.unverifiedTxt}>Unverified</Text></View>
                    ) : null}
                    {!exam ? <MatchPill status={matchStatus} /> : null}
                  </View>
                </View>
                <TouchableOpacity
                  style={s.bookmarkBtn}
                  onPress={() => toggleSave(l.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[s.bookmarkIcon, isSaved && s.bookmarkIconSaved]}>🔖</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )
          }}
        />
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
