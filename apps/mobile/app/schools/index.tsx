import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import {
  StyleSheet, View, Text, ScrollView, Pressable,
  ActivityIndicator, TextInput, FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { Card } from '../../components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolRow {
  id: string
  name: string
  acronym: string | null
  region: string | null
  province: string | null
  type: string | null
  dataConfidence: string | null
  freeTuition: boolean | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY LOW' | null

function confidenceBadgeStyle(level: ConfidenceLevel): { bg: string; border: string; text: string; label: string } {
  switch ((level ?? '').toUpperCase()) {
    case 'HIGH':
      return { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.30)', text: '#4ade80', label: 'HIGH' }
    case 'MEDIUM':
      return { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.30)', text: '#fbbf24', label: 'MED' }
    case 'LOW':
    case 'VERY LOW':
      return { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.38)', label: level === 'VERY LOW' ? 'V-LOW' : 'LOW' }
    default:
      return { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', text: 'rgba(255,255,255,0.30)', label: '—' }
  }
}

const ALL_REGIONS = 'All Regions'
const ALL_TYPES   = 'All Types'

// ---------------------------------------------------------------------------
// Row component (memoized for FlatList)
// ---------------------------------------------------------------------------

type SchoolCardStyles = {
  card: object
  cardBody: object
  cardName: object
  cardSub: object
  badgeRow: object
  badge: object
  badgeTxt: object
  freeBadge: object
  freeBadgeTxt: object
  chevron: object
}

interface SchoolCardProps {
  school: SchoolRow
  styles: SchoolCardStyles
  onPress: (id: string) => void
}

const SchoolCard = memo(function SchoolCard({ school, styles, onPress }: SchoolCardProps) {
  const confidence = (school.dataConfidence?.toUpperCase() ?? null) as ConfidenceLevel
  const badge = confidenceBadgeStyle(confidence)
  const locationParts = [school.region, school.province].filter(Boolean)
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
      onPress={() => onPress(school.id)}
      accessibilityRole="button"
    >
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>{school.name}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {school.acronym ? `${school.acronym}  ·  ` : ''}
          {school.type ?? ''}
          {locationParts.length > 0 ? `  ·  ${locationParts.join(' · ')}` : ''}
        </Text>
        <View style={styles.badgeRow}>
          {/* Confidence badge */}
          <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.badgeTxt, { color: badge.text }]}>{badge.label}</Text>
          </View>
          {/* Free tuition badge */}
          {school.freeTuition ? (
            <View style={[styles.badge, styles.freeBadge]}>
              <Text style={[styles.badgeTxt, styles.freeBadgeTxt]}>Free Tuition</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
})

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SchoolsDirectoryScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [schools, setSchools]     = useState<SchoolRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [query, setQuery]         = useState('')
  const [selRegion, setSelRegion] = useState<string>(ALL_REGIONS)
  const [selType, setSelType]     = useState<string>(ALL_TYPES)
  const [freeTuitionOnly, setFreeTuitionOnly] = useState(false)

  useEffect(() => {
    async function load() {
      const rows = await db
        .select({
          id:             schoolsTable.id,
          name:           schoolsTable.name,
          acronym:        schoolsTable.acronym,
          region:         schoolsTable.region,
          province:       schoolsTable.province,
          type:           schoolsTable.type,
          dataConfidence: profilesTable.dataConfidence,
          freeTuition:    profilesTable.freeTuition,
        })
        .from(schoolsTable)
        .leftJoin(profilesTable, eq(schoolsTable.id, profilesTable.schoolId))

      setSchools(rows as SchoolRow[])
      setLoading(false)
    }
    void load()
  }, [db])

  // Build filter option lists
  const regions = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const s of schools) {
      if (s.region) set.add(s.region)
    }
    return [ALL_REGIONS, ...Array.from(set).sort()]
  }, [schools])

  const types = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const s of schools) {
      if (s.type) set.add(s.type)
    }
    return [ALL_TYPES, ...Array.from(set).sort()]
  }, [schools])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schools.filter(s => {
      if (q && !(
        s.name.toLowerCase().includes(q) ||
        (s.acronym ?? '').toLowerCase().includes(q)
      )) return false
      if (selRegion !== ALL_REGIONS && s.region !== selRegion) return false
      if (selType !== ALL_TYPES && s.type !== selType) return false
      if (freeTuitionOnly && !s.freeTuition) return false
      return true
    })
  }, [schools, query, selRegion, selType, freeTuitionOnly])

  const s = useMemo(() => StyleSheet.create({
    root:          { flex: 1, backgroundColor: t.bg },
    topBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:       { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.md },
    backArrow:     { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    topTitle:      { flex: 1, fontSize: typo.h2, color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    subtitle:      { paddingHorizontal: spacing.lg, marginTop: -spacing.xs, marginBottom: spacing.sm, fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    searchWrap:    { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    searchInput:   { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: typo.base, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    chipScroll:    { paddingLeft: spacing.lg, paddingBottom: spacing.sm },
    chipRow:       { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
    chip:          { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, minHeight: 36, justifyContent: 'center' },
    chipActive:    { backgroundColor: t.accentSurface, borderColor: t.accent },
    chipTxt:       { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    chipTxtActive: { color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    list:          { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
    card:          { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
    cardBody:      { flex: 1, minWidth: 0 },
    cardName:      { fontSize: typo.base, color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs / 2 },
    cardSub:       { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    badgeRow:      { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
    badge:         { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2, borderWidth: 1 },
    badgeTxt:      { fontSize: typo.xs, fontFamily: 'Lexend_600SemiBold' },
    freeBadge:     { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.25)' },
    freeBadgeTxt:  { color: '#4ade80' },
    chevron:       { color: t.textTertiary, fontSize: typo.lg, flexShrink: 0 },
    empty:         { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60, fontSize: typo.sm },
    countTxt:      { marginBottom: spacing.sm, fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  const cardStyles = useMemo<SchoolCardStyles>(() => ({
    card:         s.card,
    cardBody:     s.cardBody,
    cardName:     s.cardName,
    cardSub:      s.cardSub,
    badgeRow:     s.badgeRow,
    badge:        s.badge,
    badgeTxt:     s.badgeTxt,
    freeBadge:    s.freeBadge,
    freeBadgeTxt: s.freeBadgeTxt,
    chevron:      s.chevron,
  }), [s])

  const handlePressSchool = useCallback((id: string) => {
    router.push(`/schools/${id}` as never)
  }, [])

  const renderItem = useCallback(({ item }: { item: SchoolRow }) => (
    <Card elevated padded>
      <SchoolCard school={item} styles={cardStyles} onPress={handlePressSchool} />
    </Card>
  ), [cardStyles, handlePressSchool])

  const keyExtractor = useCallback((item: SchoolRow) => item.id, [])

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
          <Text style={s.topTitle}>Schools Directory</Text>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  const listHeader = filtered.length > 0
    ? <Text style={s.countTxt}>{filtered.length} school{filtered.length !== 1 ? 's' : ''}</Text>
    : null

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle}>Schools Directory</Text>
      </View>
      <Text style={s.subtitle}>Browse tertiary schools across the Philippines</Text>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or acronym..."
          placeholderTextColor={t.textTertiary}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} style={s.chipScroll}>
        {/* Free tuition chip */}
        <Pressable
          style={({ pressed }) => [s.chip, freeTuitionOnly && s.chipActive, pressed && { opacity: 0.7 }]}
          onPress={() => setFreeTuitionOnly(v => !v)}
          accessibilityRole="button"
        >
          <Text style={[s.chipTxt, freeTuitionOnly && s.chipTxtActive]}>Free Tuition</Text>
        </Pressable>

        {/* Region chips */}
        {/* bounded: distinct regions from the loaded set; horizontal chip rail — virtualization unwarranted */}
        {/* eslint-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
        {regions.map(r => (
          <Pressable
            key={r}
            style={({ pressed }) => [s.chip, selRegion === r && s.chipActive, pressed && { opacity: 0.7 }]}
            onPress={() => setSelRegion(r)}
            accessibilityRole="button"
          >
            <Text style={[s.chipTxt, selRegion === r && s.chipTxtActive]}>
              {r === ALL_REGIONS ? 'All Regions' : r}
            </Text>
          </Pressable>
        ))}

        {/* Type chips */}
        {types.filter(tp => tp !== ALL_TYPES).map(tp => (
          <Pressable
            key={tp}
            style={({ pressed }) => [s.chip, selType === tp && s.chipActive, pressed && { opacity: 0.7 }]}
            onPress={() => setSelType(prev => prev === tp ? ALL_TYPES : tp)}
            accessibilityRole="button"
          >
            <Text style={[s.chipTxt, selType === tp && s.chipTxtActive]}>{tp}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<Text style={s.empty}>No schools found.</Text>}
      />
    </SafeAreaView>
  )
}
