import { useState, useEffect, useMemo, useCallback, memo, type ReactElement } from 'react'
import { StyleSheet, View, Text, ScrollView, Pressable, ActivityIndicator, FlatList } from 'react-native'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { Card } from '../ui/Card'
import { useWebContentWidth } from '../ui/webMaxWidth'

// ---------------------------------------------------------------------------
// Shared tertiary-schools directory: data load + region/type/free-tuition
// filters + searchable card list. Used by the /schools screen and by the
// Lists → Universities tab. The search query is supplied by the parent so the
// host screen can own the search input (the /schools top bar; the Lists shared
// search row).
// ---------------------------------------------------------------------------

export interface SchoolRow {
  id: string
  name: string
  acronym: string | null
  region: string | null
  province: string | null
  type: string | null
  dataConfidence: string | null
  freeTuition: boolean | null
}

type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY LOW' | null

function confidenceBadgeStyle(level: ConfidenceLevel): { bg: string; border: string; text: string; label: string } {
  switch ((level ?? '').toUpperCase()) {
    case 'HIGH':
      return { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.30)', text: '#16a34a', label: 'HIGH' }
    case 'MEDIUM':
      return { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.30)', text: '#b45309', label: 'MED' }
    case 'LOW':
    case 'VERY LOW':
      return { bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.10)', text: 'rgba(45,10,10,0.45)', label: level === 'VERY LOW' ? 'V-LOW' : 'LOW' }
    default:
      return { bg: 'rgba(0,0,0,0.04)', border: 'rgba(0,0,0,0.08)', text: 'rgba(45,10,10,0.40)', label: '—' }
  }
}

const ALL_REGIONS = 'All Regions'
const ALL_TYPES   = 'All Types'

type SchoolCardStyles = {
  card: object; cardBody: object; cardName: object; cardSub: object
  badgeRow: object; badge: object; badgeTxt: object
  freeBadge: object; freeBadgeTxt: object; chevron: object
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
        <Text style={styles.cardName} numberOfLines={2} maxFontSizeMultiplier={1.4}>{school.name}</Text>
        <Text style={styles.cardSub} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {school.acronym ? `${school.acronym}  ·  ` : ''}
          {school.type ?? ''}
          {locationParts.length > 0 ? `  ·  ${locationParts.join(' · ')}` : ''}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.badgeTxt, { color: badge.text }]} maxFontSizeMultiplier={1.4}>{badge.label}</Text>
          </View>
          {school.freeTuition ? (
            <View style={[styles.badge, styles.freeBadge]}>
              <Text style={[styles.badgeTxt, styles.freeBadgeTxt]} maxFontSizeMultiplier={1.4}>Free Tuition</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
})

interface SchoolsDirectoryProps {
  /** Search text (name/acronym), owned by the host screen. */
  query: string
  /** Bottom padding for the list (e.g. tab-bar clearance). */
  bottomInset?: number
  /** Optional region to preselect when it exists in the data (canonical form). */
  defaultRegion?: string | null
  /** Optional element rendered (and scrolled) above the school list — e.g. the
      pinned "Entrance exams" section on the Lists → Universities tab. */
  listHeader?: ReactElement | null
}

export function SchoolsDirectory({ query, bottomInset = spacing.xxxl, defaultRegion = null, listHeader = null }: SchoolsDirectoryProps) {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  // Web-only max-width centering (null on native/sm). Applied to the vertical
  // list's contentContainerStyle and to the chip rail's OUTER style (never to a
  // horizontal ScrollView's content container — that would break scrolling).
  const webWidth = useWebContentWidth()

  const [schools, setSchools] = useState<SchoolRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selRegion, setSelRegion] = useState<string>(ALL_REGIONS)
  const [selType, setSelType]     = useState<string>(ALL_TYPES)
  const [freeTuitionOnly, setFreeTuitionOnly] = useState(false)

  useEffect(() => {
    let alive = true
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
      if (!alive) return
      setSchools(rows as SchoolRow[])
      setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [db])

  // Preselect the user's region once the data is loaded, if it exists as an option.
  useEffect(() => {
    if (!defaultRegion || schools.length === 0) return
    const hit = schools.some(s => s.region === defaultRegion)
    if (hit) setSelRegion(prev => (prev === ALL_REGIONS ? defaultRegion : prev))
  }, [defaultRegion, schools])

  const regions = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const s of schools) if (s.region) set.add(s.region)
    return [ALL_REGIONS, ...Array.from(set).sort()]
  }, [schools])

  const types = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const s of schools) if (s.type) set.add(s.type)
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
    root:          { flex: 1 },
    chipScroll:    { paddingTop: spacing.sm, paddingLeft: spacing.lg, paddingBottom: spacing.sm, flexGrow: 0 },
    chipRow:       { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
    chip:          { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, minHeight: 36, justifyContent: 'center' },
    chipActive:    { backgroundColor: t.accentSurface, borderColor: t.accent },
    chipTxt:       { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    chipTxtActive: { color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    list:          { paddingHorizontal: spacing.lg, paddingBottom: bottomInset, gap: spacing.md },
    card:          { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
    cardBody:      { flex: 1, minWidth: 0 },
    cardName:      { fontSize: typo.base, color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs / 2 },
    cardSub:       { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    badgeRow:      { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
    badge:         { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2, borderWidth: 1 },
    badgeTxt:      { fontSize: typo.xs, fontFamily: 'Lexend_600SemiBold' },
    freeBadge:     { backgroundColor: 'rgba(22,163,74,0.10)', borderColor: 'rgba(22,163,74,0.25)' },
    freeBadgeTxt:  { color: '#16a34a' },
    chevron:       { color: t.textTertiary, fontSize: typo.lg, flexShrink: 0 },
    empty:         { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60, fontSize: typo.sm },
    countTxt:      { paddingHorizontal: spacing.lg, marginBottom: spacing.sm, fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    loading:       { marginTop: 60 },
  }), [t, typo, bottomInset])

  const cardStyles = useMemo<SchoolCardStyles>(() => ({
    card: s.card, cardBody: s.cardBody, cardName: s.cardName, cardSub: s.cardSub,
    badgeRow: s.badgeRow, badge: s.badge, badgeTxt: s.badgeTxt,
    freeBadge: s.freeBadge, freeBadgeTxt: s.freeBadgeTxt, chevron: s.chevron,
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
    return <ActivityIndicator color={t.accent} style={s.loading} />
  }

  const countHeader = filtered.length > 0
    ? <Text style={s.countTxt}>{filtered.length} school{filtered.length !== 1 ? 's' : ''}</Text>
    : null
  const fullHeader = (listHeader || countHeader)
    ? <>{listHeader}{countHeader}</>
    : null

  return (
    <View style={s.root}>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} style={[s.chipScroll, webWidth]}>
        <Pressable
          style={({ pressed }) => [s.chip, freeTuitionOnly && s.chipActive, pressed && { opacity: 0.7 }]}
          onPress={() => setFreeTuitionOnly(v => !v)}
          accessibilityRole="button"
        >
          <Text style={[s.chipTxt, freeTuitionOnly && s.chipTxtActive]}>Free Tuition</Text>
        </Pressable>

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
        contentContainerStyle={[s.list, webWidth]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={fullHeader}
        ListEmptyComponent={<Text style={s.empty}>No schools found.</Text>}
      />
    </View>
  )
}
