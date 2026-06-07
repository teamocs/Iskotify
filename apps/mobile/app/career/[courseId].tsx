import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Linking, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import {
  careerCourses as coursesTable,
  careerDestinations as destinationsTable,
  aiCareerImpact as aiImpactTable,
  careerPrograms as programsTable,
} from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { AiImpactCard, type AiImpactRow } from '../../components/career/AiImpactCard'

// ---------------------------------------------------------------------------
// Types (local — avoid re-exporting db row shapes)
// ---------------------------------------------------------------------------

interface CourseRow {
  courseId: string
  name: string | null
  cluster: string | null
  careerTag: string | null
  demand: string | null
  boardExam: boolean
  boardExamName: string | null
  durationYears: number | null
  topCountries: string
  summary: string | null
  studentTip: string | null
  aiNote: string | null
  remoteUpdatedAt: number | null
}

interface DestinationRow {
  id: string
  courseId: string | null
  country: string | null
  demandRating: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryLocal: string | null
  salaryType: string | null
  visaPathway: string | null
  prPathway: string | null
  credential: string | null
  licensingExam: string | null
  languageRequired: string | null
  timelineMonths: number | null
  programName: string | null
  specializations: string
  notes: string | null
  saturationWarning: string | null
  source: string | null
  remoteUpdatedAt: number | null
}

interface ProgramRow {
  id: string
  name: string | null
  countryRegion: string | null
  coursesCovered: string
  managingBody: string | null
  slots: string | null
  requirements: string | null
  immigrationOutcome: string | null
  website: string | null
  notes: string | null
  remoteUpdatedAt: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/**
 * Slugify a country name for routing to /career/country/[slug].
 * Convention: lowercase, runs of non-alphanumeric chars become a single '-',
 * leading/trailing '-' stripped.
 * Example: "United Kingdom" → "united-kingdom"
 * Must match Task 7's country screen and the seeded career_countries.code format.
 */
function slugifyCountry(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function demandRatingOrder(rating: string | null): number {
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

export default function CourseCareerDetailScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [course, setCourse]           = useState<CourseRow | null>(null)
  const [destinations, setDestinations] = useState<DestinationRow[]>([])
  const [aiImpact, setAiImpact]       = useState<AiImpactRow | null>(null)
  const [programs, setPrograms]        = useState<ProgramRow[]>([])
  const [loading, setLoading]          = useState(true)

  useEffect(() => {
    async function load() {
      const [courseRows, destRows, aiRows, allPrograms] = await Promise.all([
        db.select().from(coursesTable).where(eq(coursesTable.courseId, courseId)).limit(1),
        db.select().from(destinationsTable).where(eq(destinationsTable.courseId, courseId)),
        db.select().from(aiImpactTable).where(eq(aiImpactTable.courseId, courseId)).limit(1),
        db.select().from(programsTable),
      ])

      const c = courseRows[0] ?? null
      setCourse(c as CourseRow | null)

      // Sort destinations by demand rating descending
      const sorted = (destRows as DestinationRow[]).slice().sort(
        (a, b) => demandRatingOrder(b.demandRating) - demandRatingOrder(a.demandRating),
      )
      setDestinations(sorted)

      setAiImpact((aiRows[0] ?? null) as AiImpactRow | null)

      // Filter programs whose coursesCovered includes the course name
      const courseName = (c as CourseRow | null)?.name ?? ''
      const matchedPrograms = (allPrograms as ProgramRow[]).filter(p => {
        const covered = safeParseArray(p.coursesCovered)
        return covered.some(n => n.toLowerCase() === courseName.toLowerCase())
      })
      setPrograms(matchedPrograms)

      setLoading(false)
    }
    void load()
  }, [db, courseId])

  const s = useMemo(() => StyleSheet.create({
    root:            { flex: 1, backgroundColor: t.bg },
    topBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
    backBtn:         { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    backArrow:       { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:        { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    scroll:          { paddingBottom: 32 },
    hero:            { marginHorizontal: 14, borderRadius: 18, padding: 16, marginBottom: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
    heroName:        { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 4 },
    badgeRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    badge:           { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border },
    badgeTxt:        { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    demandBadge:     { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.25)' },
    demandTxt:       { color: '#4ade80', fontFamily: 'Lexend_600SemiBold', fontWeight: '700', fontSize: typo.xs },
    boardBadge:      { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    boardTxt:        { color: t.accentText, fontFamily: 'Lexend_600SemiBold', fontWeight: '700', fontSize: typo.xs },
    summaryTxt:      { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19, marginTop: 10 },
    tipTxt:          { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 16, marginTop: 6, fontStyle: 'italic' },
    section:         { marginHorizontal: 14, marginBottom: 14 },
    sectionTitle:    { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', marginBottom: 10 },
    destCard:        { backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, padding: 14, marginBottom: 10 },
    destCountryRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    destCountry:     { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    destDemand:      { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold', color: '#4ade80' },
    destSalary:      { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', fontWeight: '600', marginBottom: 3 },
    destMetaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    destMetaChip:    { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border },
    destMetaTxt:     { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    saturationWarn:  { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginTop: 4 },
    saturationTxt:   { fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 15, flex: 1 },
    destSourceTxt:   { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontStyle: 'italic', marginTop: 4 },
    countryLink:     { marginTop: 6, alignSelf: 'flex-start' },
    countryLinkTxt:  { fontSize: typo.xs, color: t.accent, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
    progCard:        { backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, padding: 14, marginBottom: 10 },
    progName:        { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    progBody:        { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 17, marginBottom: 3 },
    progLink:        { fontSize: typo.xs, color: t.accent, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline', marginTop: 4 },
    disclaimer:      { marginHorizontal: 14, marginBottom: 16, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: 12, padding: 12 },
    disclaimerTxt:   { fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 17 },
    empty:           { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60 },
    emptySection:    { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' },
  }), [t, typo])

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!course) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.empty}>Course not found.</Text>
      </SafeAreaView>
    )
  }

  // ── Helpers for render ─────────────────────────────────────────────────────

  function fmtSalary(dest: DestinationRow): string {
    if (dest.salaryMin != null && dest.salaryMax != null) {
      return `$${dest.salaryMin.toLocaleString()}–${dest.salaryMax.toLocaleString()}/yr`
    }
    return dest.salaryLocal ?? '—'
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>{course.name ?? 'Course Detail'}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={s.hero}>
          <Text style={s.heroName}>{course.name}</Text>
          {course.cluster ? (
            <Text style={{ fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' }}>
              {course.cluster}
            </Text>
          ) : null}
          <View style={s.badgeRow}>
            {course.demand ? (
              <View style={[s.badge, s.demandBadge]}>
                <Text style={s.demandTxt}>📈 {course.demand} demand</Text>
              </View>
            ) : null}
            {course.boardExam ? (
              <View style={[s.badge, s.boardBadge]}>
                <Text style={s.boardTxt}>Board Exam{course.boardExamName ? `: ${course.boardExamName}` : ''}</Text>
              </View>
            ) : null}
            {course.durationYears != null ? (
              <View style={s.badge}>
                <Text style={s.badgeTxt}>{course.durationYears} yr program</Text>
              </View>
            ) : null}
            {course.careerTag ? (
              <View style={s.badge}>
                <Text style={s.badgeTxt}>{course.careerTag}</Text>
              </View>
            ) : null}
          </View>
          {course.summary ? <Text style={s.summaryTxt}>{course.summary}</Text> : null}
          {course.studentTip ? <Text style={s.tipTxt}>💡 {course.studentTip}</Text> : null}
        </View>

        {/* ── AI Impact Card ── */}
        {aiImpact ? (
          <View style={{ marginHorizontal: 14, marginBottom: 2 }}>
            <AiImpactCard impact={aiImpact} />
          </View>
        ) : null}

        {/* ── Destinations ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Where can this take you?</Text>
          {destinations.length > 0 ? destinations.map(dest => {
            const specializations = safeParseArray(dest.specializations)
            const countrySlug = dest.country ? slugifyCountry(dest.country) : null
            return (
              <View key={dest.id} style={s.destCard}>
                {/* Country + demand */}
                <View style={s.destCountryRow}>
                  <Text style={s.destCountry}>{dest.country ?? '—'}</Text>
                  {dest.demandRating ? (
                    <Text style={s.destDemand}>{dest.demandRating}</Text>
                  ) : null}
                </View>

                {/* Salary */}
                <Text style={s.destSalary}>{fmtSalary(dest)}</Text>

                {/* Meta chips row */}
                <View style={s.destMetaRow}>
                  {dest.visaPathway ? (
                    <View style={s.destMetaChip}>
                      <Text style={s.destMetaTxt}>Visa: {dest.visaPathway}</Text>
                    </View>
                  ) : null}
                  {dest.prPathway ? (
                    <View style={s.destMetaChip}>
                      <Text style={s.destMetaTxt}>PR: {dest.prPathway}</Text>
                    </View>
                  ) : null}
                  {dest.timelineMonths != null ? (
                    <View style={s.destMetaChip}>
                      <Text style={s.destMetaTxt}>{dest.timelineMonths} mo</Text>
                    </View>
                  ) : null}
                  {dest.credential ? (
                    <View style={s.destMetaChip}>
                      <Text style={s.destMetaTxt}>{dest.credential}</Text>
                    </View>
                  ) : null}
                  {dest.languageRequired ? (
                    <View style={s.destMetaChip}>
                      <Text style={s.destMetaTxt}>Lang: {dest.languageRequired}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Specializations */}
                {specializations.length > 0 ? (
                  <Text style={s.destMetaTxt}>
                    Specializations: {specializations.join(', ')}
                  </Text>
                ) : null}

                {/* Saturation warning */}
                {dest.saturationWarning ? (
                  <View style={s.saturationWarn}>
                    <Text style={s.saturationTxt}>⚠ {dest.saturationWarning}</Text>
                  </View>
                ) : null}

                {/* Source */}
                {dest.source ? (
                  <Text style={s.destSourceTxt}>Source: {dest.source}</Text>
                ) : null}

                {/* Link to country detail screen */}
                {countrySlug ? (
                  <TouchableOpacity
                    style={s.countryLink}
                    onPress={() => router.push(`/career/country/${countrySlug}` as never)}
                  >
                    <Text style={s.countryLinkTxt}>View {dest.country} details →</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )
          }) : (
            <Text style={s.emptySection}>No destination data available yet.</Text>
          )}
        </View>

        {/* ── Bilateral Programs ── */}
        {programs.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Programs</Text>
            {programs.map(prog => (
              <View key={prog.id} style={s.progCard}>
                <Text style={s.progName}>{prog.name ?? '—'}</Text>
                {prog.managingBody ? (
                  <Text style={s.progBody}>Managing body: {prog.managingBody}</Text>
                ) : null}
                {prog.countryRegion ? (
                  <Text style={s.progBody}>Region: {prog.countryRegion}</Text>
                ) : null}
                {prog.immigrationOutcome ? (
                  <Text style={s.progBody}>Immigration outcome: {prog.immigrationOutcome}</Text>
                ) : null}
                {prog.slots ? (
                  <Text style={s.progBody}>Slots: {prog.slots}</Text>
                ) : null}
                {prog.notes ? (
                  <Text style={[s.progBody, { fontStyle: 'italic' }]}>{prog.notes}</Text>
                ) : null}
                {prog.website ? (
                  <TouchableOpacity onPress={() => prog.website && Linking.openURL(prog.website)}>
                    <Text style={s.progLink}>Official site ↗</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Indicative data disclaimer ── */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTxt}>
            ⚠ Salaries, timelines & pathways are indicative — verify with DMW/POEA, embassies & official program sites.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
