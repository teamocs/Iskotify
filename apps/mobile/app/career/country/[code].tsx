import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import {
  careerCountries as countriesTable,
  careerDestinations as destinationsTable,
  careerCourses as coursesTable,
} from '../../../db/schema'
import { useTheme } from '../../../theme/ThemeContext'
import { countryCodeFromName } from '../../../utils/careerSlug'
import { ScreenScroll } from '../../../components/ui/ScreenScroll'
import { Card } from '../../../components/ui/Card'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { spacing, radius } from '../../../theme/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CountryRow {
  code: string
  name: string | null
  region: string | null
  immigrationSystem: string | null
  whyDemand: string | null
  languageRequired: string | null
  prPathway: string | null
  notes: string | null
  remoteUpdatedAt: number | null
}

interface DestRow {
  id: string
  courseId: string | null
  country: string | null
  demandRating: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryLocal: string | null
  salaryType: string | null
  timelineMonths: number | null
  notes: string | null
  remoteUpdatedAt: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSalary(dest: DestRow): string {
  if (dest.salaryMin != null && dest.salaryMax != null) {
    return `$${dest.salaryMin.toLocaleString()}–${dest.salaryMax.toLocaleString()}/yr`
  }
  return dest.salaryLocal ?? '—'
}

function demandOrder(rating: string | null): number {
  switch ((rating ?? '').toLowerCase()) {
    case 'very high': return 4
    case 'high':      return 3
    case 'moderate':  return 2
    case 'low':       return 1
    default:          return 0
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CareerCountryScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [country, setCountry] = useState<CountryRow | null>(null)
  const [dests, setDests]     = useState<DestRow[]>([])
  const [courseNameMap, setCourseNameMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [countryRows, allDests, allCourses] = await Promise.all([
        db.select().from(countriesTable).where(eq(countriesTable.code, code)).limit(1),
        db.select().from(destinationsTable),
        db.select({ courseId: coursesTable.courseId, name: coursesTable.name }).from(coursesTable),
      ])

      setCountry((countryRows[0] ?? null) as CountryRow | null)

      // Build a Map<courseId, name> for display
      const nameMap = new Map<string, string>()
      for (const c of allCourses) {
        if (c.courseId && c.name) nameMap.set(c.courseId, c.name)
      }
      setCourseNameMap(nameMap)

      // Filter & sort destinations that map to this country code
      const matched = (allDests as DestRow[])
        .filter(d => d.country != null && countryCodeFromName(d.country) === code)
        .sort((a, b) => demandOrder(b.demandRating) - demandOrder(a.demandRating))
      setDests(matched)

      setLoading(false)
    }
    void load()
  }, [db, code])

  const s = useMemo(() => StyleSheet.create({
    root:          { flex: 1, backgroundColor: t.bg },
    topBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:       { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backArrow:     { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:      { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    pageTitle:     { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
    regionBadge:   { alignSelf: 'flex-start', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', marginBottom: spacing.sm },
    regionTxt:     { fontSize: typo.xs, color: t.accentText, fontFamily: 'Lexend_600SemiBold', fontWeight: '700' },
    whyTxt:        { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    infoRow:       { flexDirection: 'row', marginBottom: spacing.sm },
    infoLabel:     { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold', width: 110, flexShrink: 0 },
    infoValue:     { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular', flex: 1, lineHeight: 17 },
    destTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
    destCourse:    { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', flex: 1, marginRight: spacing.sm },
    destDemand:    { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold', color: t.success, flexShrink: 0 },
    destSalary:    { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', fontWeight: '600', marginBottom: 3 },
    destTimeline:  { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    destLink:      { marginTop: spacing.sm, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    destLinkTxt:   { fontSize: typo.xs, color: t.accent, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
    disclaimer:    { backgroundColor: t.warningSurface, borderColor: 'rgba(245,158,11,0.20)' },
    disclaimerTxt: { fontSize: typo.xs, color: t.warning, fontFamily: 'Lexend_400Regular', lineHeight: 17 },
    empty:         { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60, fontSize: typo.sm },
    emptySection:  { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' },
  }), [t, typo])

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (country === null) {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
        </View>
        <Text style={s.empty}>Country not found.</Text>
      </SafeAreaView>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />

      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>{country.name ?? code}</Text>
      </View>

      <ScreenScroll tabBarInset={false} contentContainerStyle={{ gap: spacing.md }}>

        {/* ── Hero ── */}
        <Card elevated>
          <Text style={s.pageTitle}>{country.name ?? code}</Text>
          {country.region ? (
            <View style={s.regionBadge}>
              <Text style={s.regionTxt}>{country.region}</Text>
            </View>
          ) : null}
          {country.whyDemand ? (
            <Text style={s.whyTxt}>
              {country.whyDemand}
            </Text>
          ) : null}
        </Card>

        {/* ── Country info ── */}
        <View>
          <SectionHeader title="Country Profile" />
          <Card elevated>
            {country.immigrationSystem ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Immigration</Text>
                <Text style={s.infoValue}>{country.immigrationSystem}</Text>
              </View>
            ) : null}
            {country.languageRequired ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Language req.</Text>
                <Text style={s.infoValue}>{country.languageRequired}</Text>
              </View>
            ) : null}
            {country.prPathway ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>PR / Citizenship</Text>
                <Text style={s.infoValue}>{country.prPathway}</Text>
              </View>
            ) : null}
            {country.notes ? (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Notes</Text>
                <Text style={s.infoValue}>{country.notes}</Text>
              </View>
            ) : null}
          </Card>
        </View>

        {/* ── Courses in demand ── */}
        <View style={{ gap: spacing.md }}>
          <SectionHeader title="Courses in demand here" />
          {dests.length > 0 ? dests.map(dest => (
            <Card key={dest.id} elevated>
              <View style={s.destTopRow}>
                <Text style={s.destCourse} numberOfLines={2}>
                  {dest.courseId != null
                    ? (courseNameMap.get(dest.courseId) ?? dest.courseId)
                    : '—'}
                </Text>
                {dest.demandRating ? (
                  <Text style={s.destDemand}>{dest.demandRating}</Text>
                ) : null}
              </View>
              <Text style={s.destSalary}>{fmtSalary(dest)}</Text>
              {dest.timelineMonths != null ? (
                <Text style={s.destTimeline}>{dest.timelineMonths} mo timeline</Text>
              ) : null}
              {dest.courseId ? (
                <Pressable
                  style={({ pressed }) => [s.destLink, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  onPress={() => router.push(`/career/${dest.courseId}?country=${code}` as never)}
                >
                  <Text style={s.destLinkTxt}>View course details →</Text>
                </Pressable>
              ) : null}
            </Card>
          )) : (
            <Text style={s.emptySection}>No course data found for this country yet.</Text>
          )}
        </View>

        {/* ── Disclaimer ── */}
        <Card style={s.disclaimer}>
          <Text style={s.disclaimerTxt}>
            Verify all pathways, salary ranges, and immigration rules with DMW/POEA and official government sources before making any career decisions.
          </Text>
        </Card>

      </ScreenScroll>
    </SafeAreaView>
  )
}
