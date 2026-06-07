import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'

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
    topBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
    backBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    backArrow:     { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:      { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    searchWrap:    { marginHorizontal: 14, marginBottom: 8 },
    searchInput:   { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    chipScroll:    { paddingLeft: 14, paddingBottom: 8 },
    chipRow:       { flexDirection: 'row', gap: 6, paddingRight: 14 },
    chip:          { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    chipActive:    { backgroundColor: t.accentSurface, borderColor: t.accent },
    chipTxt:       { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    chipTxtActive: { color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    scroll:        { paddingBottom: 32 },
    card:          { marginHorizontal: 14, marginBottom: 8, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardBody:      { flex: 1, minWidth: 0 },
    cardName:      { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    cardSub:       { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    badgeRow:      { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
    badge:         { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
    badgeTxt:      { fontSize: 10, fontFamily: 'Lexend_600SemiBold' },
    freeBadge:     { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.25)' },
    freeBadgeTxt:  { color: '#4ade80' },
    chevron:       { color: t.textTertiary, fontSize: 18, flexShrink: 0 },
    empty:         { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60, fontSize: typo.sm },
    countTxt:      { marginHorizontal: 14, marginBottom: 6, fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Schools Directory</Text>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>Schools Directory</Text>
      </View>

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
        <TouchableOpacity
          style={[s.chip, freeTuitionOnly && s.chipActive]}
          onPress={() => setFreeTuitionOnly(v => !v)}
          activeOpacity={0.8}
        >
          <Text style={[s.chipTxt, freeTuitionOnly && s.chipTxtActive]}>Free Tuition</Text>
        </TouchableOpacity>

        {/* Region chips */}
        {regions.map(r => (
          <TouchableOpacity
            key={r}
            style={[s.chip, selRegion === r && s.chipActive]}
            onPress={() => setSelRegion(r)}
            activeOpacity={0.8}
          >
            <Text style={[s.chipTxt, selRegion === r && s.chipTxtActive]}>
              {r === ALL_REGIONS ? 'All Regions' : r}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Type chips */}
        {types.filter(tp => tp !== ALL_TYPES).map(tp => (
          <TouchableOpacity
            key={tp}
            style={[s.chip, selType === tp && s.chipActive]}
            onPress={() => setSelType(prev => prev === tp ? ALL_TYPES : tp)}
            activeOpacity={0.8}
          >
            <Text style={[s.chipTxt, selType === tp && s.chipTxtActive]}>{tp}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Result count */}
        {filtered.length > 0 ? (
          <Text style={s.countTxt}>{filtered.length} school{filtered.length !== 1 ? 's' : ''}</Text>
        ) : null}

        {filtered.length === 0 ? (
          <Text style={s.empty}>No schools found.</Text>
        ) : (
          filtered.map(school => {
            const confidence = (school.dataConfidence?.toUpperCase() ?? null) as ConfidenceLevel
            const badge = confidenceBadgeStyle(confidence)
            const locationParts = [school.region, school.province].filter(Boolean)
            return (
              <TouchableOpacity
                key={school.id}
                style={s.card}
                onPress={() => router.push(`/schools/${school.id}` as never)}
                activeOpacity={0.8}
              >
                <View style={s.cardBody}>
                  <Text style={s.cardName} numberOfLines={2}>{school.name}</Text>
                  <Text style={s.cardSub} numberOfLines={1}>
                    {school.acronym ? `${school.acronym}  ·  ` : ''}
                    {school.type ?? ''}
                    {locationParts.length > 0 ? `  ·  ${locationParts.join(' · ')}` : ''}
                  </Text>
                  <View style={s.badgeRow}>
                    {/* Confidence badge */}
                    <View style={[s.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                      <Text style={[s.badgeTxt, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                    {/* Free tuition badge */}
                    {school.freeTuition ? (
                      <View style={[s.badge, s.freeBadge]}>
                        <Text style={[s.badgeTxt, s.freeBadgeTxt]}>Free Tuition</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            )
          })
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
