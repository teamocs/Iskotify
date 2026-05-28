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
import { listings as listingsTable, savedListings as savedListingsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { syncOnLaunch } from '../../services/sync'

type Segment = 'all' | 'exam' | 'scholarship'

interface ListingRow {
  id: string
  slug: string
  title: string
  type: string
  status: string
  examDate: number | null
  region: string
  provider: string
}

function fmtDate(ts: number | null): string {
  if (!ts) return 'Date TBA'
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ListingsScreen() {
  const db = useDb()
  const { isInFocus, getPriority } = useFocusListings()
  const [all, setAll] = useState<ListingRow[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [segment, setSegment] = useState<Segment>('all')
  const [query, setQuery] = useState('')
  const [regionFilter, setRegionFilter] = useState<string | null>(null)

  const loadListings = useCallback(async () => {
    const [rows, saved] = await Promise.all([
      db.select({
        id: listingsTable.id,
        slug: listingsTable.slug,
        title: listingsTable.title,
        type: listingsTable.type,
        status: listingsTable.status,
        examDate: listingsTable.examDate,
        region: listingsTable.region,
        provider: listingsTable.provider,
      }).from(listingsTable),
      db.select({ id: savedListingsTable.id }).from(savedListingsTable),
    ])
    setAll(rows)
    setSavedIds(new Set(saved.map(s => s.id)))
  }, [db])

  useFocusEffect(useCallback(() => { void loadListings() }, [loadListings]))

  const refresh = useCallback(async () => {
    // Pull fresh listings from Supabase; syncOnLaunch handles offline via try/catch internally
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

  const filtered = useMemo(() => {
    return all
      .filter(l => segment === 'all' || l.type === segment)
      .filter(l => !regionFilter || l.region === regionFilter)
      .filter(l => !query || l.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (!a.examDate) return 1
        if (!b.examDate) return -1
        return a.examDate - b.examDate
      })
  }, [all, segment, query, regionFilter])

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
    row2: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateText: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    regionLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    bookmarkBtn: { padding: 2, flexShrink: 0 },
    bookmarkIcon: { fontSize: 14, opacity: 0.35 },
    bookmarkIconSaved: { opacity: 1 },
    focusBadge: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
    focusBadgeTxt: { fontSize: typo.xs, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },
    empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: 32 },
  }), [t, typo])

  const isExam = (l: ListingRow) => l.type === 'exam'

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >

      <View style={s.header}>
        <Text style={s.title}>Listings</Text>
        <Text style={s.subtitle}>Exams & Scholarships</Text>
      </View>

      {/* Segment control */}
      <View style={s.seg}>
        {(['all', 'exam', 'scholarship'] as Segment[]).map(seg => (
          <TouchableOpacity key={seg} style={[s.segBtn, segment === seg && s.segBtnOn]} onPress={() => setSegment(seg)}>
            <Text style={[s.segTxt, segment === seg && s.segTxtOn]}>
              {seg === 'all' ? 'All' : seg === 'exam' ? 'Exams' : 'Scholarships'}
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
          placeholder="Search listings..."
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

      {/* Region filter chips */}
      {regions.length > 0 && (
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
      )}

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
