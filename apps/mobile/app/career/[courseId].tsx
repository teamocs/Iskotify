import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, Pressable,
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
  courseTaxonomyMap as taxonomyTable,
} from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { AiImpactCard, type AiImpactRow } from '../../components/career/AiImpactCard'
import { countryCodeFromName } from '../../utils/careerSlug'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { spacing, radius } from '../../theme/tokens'

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
// Destination card (Wave 3c: collapsed meta, "Details" expand per card)
// ---------------------------------------------------------------------------

interface DestinationCardProps {
  dest: DestinationRow
  fmtSalary: (d: DestinationRow) => string
  styles: ReturnType<typeof makeStyles>
}

function DestinationCard({ dest, fmtSalary, styles: s }: DestinationCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const specializations = safeParseArray(dest.specializations)
  const countrySlug = dest.country ? countryCodeFromName(dest.country) : null
  const hasDetails = !!(
    dest.visaPathway || dest.prPathway || dest.timelineMonths != null ||
    dest.credential || dest.languageRequired || specializations.length > 0 ||
    dest.source || dest.saturationWarning
  )

  return (
    <Card elevated>
      {/* Always visible: country + demand + salary */}
      <View style={s.destCountryRow}>
        <Text style={s.destCountry}>{dest.country ?? '—'}</Text>
        {dest.demandRating ? (
          <Text style={s.destDemand}>{dest.demandRating}</Text>
        ) : null}
      </View>
      <Text style={s.destSalary}>{fmtSalary(dest)}</Text>

      {/* Compact saturation indicator (always visible when present — safety-relevant) */}
      {dest.saturationWarning && !detailsOpen ? (
        <View style={s.saturationIndicator}>
          <Text style={s.saturationIndicatorTxt}>⚠ Market saturation noted</Text>
        </View>
      ) : null}

      {/* Details expand toggle */}
      {hasDetails ? (
        <Pressable
          style={s.detailsToggle}
          onPress={() => setDetailsOpen(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
          hitSlop={8}
        >
          <Text style={s.detailsToggleTxt}>{detailsOpen ? 'Details ↑' : 'Details ↓'}</Text>
        </Pressable>
      ) : null}

      {/* Expanded meta details */}
      {detailsOpen ? (
        <>
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

          {specializations.length > 0 ? (
            <Text style={s.destMetaTxt}>
              Specializations: {specializations.join(', ')}
            </Text>
          ) : null}

          {dest.saturationWarning ? (
            <View style={s.saturationWarn}>
              <Text style={s.saturationTxt}>⚠ {dest.saturationWarning}</Text>
            </View>
          ) : null}

          {dest.source ? (
            <Text style={s.destSourceTxt}>Source: {dest.source}</Text>
          ) : null}
        </>
      ) : null}

      {/* Link to country detail screen — always visible */}
      {countrySlug ? (
        <Pressable
          style={({ pressed }) => [s.countryLink, pressed && { opacity: 0.7 }]}
          onPress={() => router.push(`/career/country/${countrySlug}` as never)}
          accessibilityRole="button"
        >
          <Text style={s.countryLinkTxt}>View {dest.country} details →</Text>
        </Pressable>
      ) : null}
    </Card>
  )
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
  const [topSchoolsTab, setTopSchoolsTab] = useState<string | null>(null)
  const [loading, setLoading]          = useState(true)

  // Wave 3c: Programs expand
  const [programsExpanded, setProgramsExpanded] = useState(false)

  useEffect(() => {
    async function load() {
      const [courseRows, destRows, aiRows, allPrograms, taxRows] = await Promise.all([
        db.select().from(coursesTable).where(eq(coursesTable.courseId, courseId)).limit(1),
        db.select().from(destinationsTable).where(eq(destinationsTable.courseId, courseId)),
        db.select().from(aiImpactTable).where(eq(aiImpactTable.courseId, courseId)).limit(1),
        db.select().from(programsTable),
        db.select({
          courseTab: taxonomyTable.courseTab,
          careerCourseId: taxonomyTable.careerCourseId,
        }).from(taxonomyTable).where(eq(taxonomyTable.careerCourseId, courseId)).limit(1),
      ])

      const c = courseRows[0] ?? null
      setCourse(c as CourseRow | null)

      // Sort destinations by demand rating descending
      const sorted = (destRows as DestinationRow[]).slice().sort(
        (a, b) => demandRatingOrder(b.demandRating) - demandRatingOrder(a.demandRating),
      )
      setDestinations(sorted)

      setAiImpact((aiRows[0] ?? null) as AiImpactRow | null)

      // Top schools tab mapping
      const taxRow = taxRows[0] ?? null
      setTopSchoolsTab(taxRow?.courseTab ?? null)

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

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
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

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!course) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
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

  // Wave 3c: Programs — show first 1 + "See all (n)" expand
  const TOP_PROGRAMS = 1
  const visiblePrograms = programsExpanded ? programs : programs.slice(0, TOP_PROGRAMS)
  const hiddenProgramCount = programs.length - TOP_PROGRAMS

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>{course.name ?? 'Course Detail'}</Text>
      </View>

      <ScreenScroll tabBarInset={false} contentContainerStyle={{ gap: spacing.md }}>

        {/* ── Hero card ── */}
        <Card elevated>
          <Text style={s.heroName}>{course.name}</Text>
          {course.cluster ? (
            <Text style={s.heroCluster}>
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
        </Card>

        {/* ── AI Impact Card ── */}
        {aiImpact ? (
          <AiImpactCard impact={aiImpact} />
        ) : null}

        {/* ── Top Schools cross-link ── */}
        {topSchoolsTab ? (
          <Pressable
            onPress={() => router.push(`/schools/course/${topSchoolsTab}` as never)}
            accessibilityRole="button"
            style={({ pressed }) => pressed && { opacity: 0.8 }}
          >
            <Card elevated style={s.schoolsLink}>
              <Text style={s.schoolsLinkIcon}>🏫</Text>
              <View style={s.schoolsLinkBody}>
                <Text style={s.schoolsLinkTitle}>Top schools for this course</Text>
                <Text style={s.schoolsLinkSub}>PRC board exam rankings by pass rate</Text>
              </View>
              <Text style={s.schoolsLinkArr}>›</Text>
            </Card>
          </Pressable>
        ) : null}

        {/* ── Destinations (Wave 3c: collapsed meta per card) ── */}
        <View>
          <SectionHeader title="Where can this take you?" />
          {destinations.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              {destinations.map(dest => (
                <DestinationCard
                  key={dest.id}
                  dest={dest}
                  fmtSalary={fmtSalary}
                  styles={s}
                />
              ))}
            </View>
          ) : (
            <Text style={s.emptySection}>No destination data available yet.</Text>
          )}
        </View>

        {/* ── Bilateral Programs (Wave 3c: first 1 + See all) ── */}
        {programs.length > 0 ? (
          <View>
            <SectionHeader title="Programs" />
            <View style={{ gap: spacing.md }}>
              {visiblePrograms.map(prog => (
                <Card key={prog.id} elevated>
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
                    <Pressable
                      style={({ pressed }) => [s.progLinkBtn, pressed && { opacity: 0.7 }]}
                      onPress={() => prog.website && Linking.openURL(prog.website)}
                      accessibilityRole="button"
                    >
                      <Text style={s.progLink}>Official site ↗</Text>
                    </Pressable>
                  ) : null}
                </Card>
              ))}
            </View>
            {!programsExpanded && hiddenProgramCount > 0 ? (
              <Pressable
                style={s.seeAllBtn}
                onPress={() => setProgramsExpanded(true)}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={s.seeAllTxt}>See all ({hiddenProgramCount} more)</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Indicative data disclaimer (Wave 3c: footnote style) ── */}
        <Text style={s.disclaimerFootnote}>
          ⚠ Salaries, timelines &amp; pathways are indicative — verify with DMW/POEA, embassies &amp; official program sites.
        </Text>

      </ScreenScroll>
    </SafeAreaView>
  )
}

function makeStyles(
  t: ReturnType<typeof import('../../theme/ThemeContext').useTheme>['theme'],
  typo: ReturnType<typeof import('../../theme/ThemeContext').useTheme>['typo'],
) {
  return StyleSheet.create({
    root:            { flex: 1, backgroundColor: t.bg },
    topBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:         { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backArrow:       { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:        { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    heroName:        { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs },
    heroCluster:     { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    badgeRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
    badge:           { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border },
    badgeTxt:        { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    demandBadge:     { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.25)' },
    demandTxt:       { color: '#4ade80', fontFamily: 'Lexend_600SemiBold', fontWeight: '700', fontSize: typo.xs },
    boardBadge:      { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    boardTxt:        { color: t.accentText, fontFamily: 'Lexend_600SemiBold', fontWeight: '700', fontSize: typo.xs },
    summaryTxt:      { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19, marginTop: spacing.md },
    tipTxt:          { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 16, marginTop: spacing.sm, fontStyle: 'italic' },
    destCountryRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
    destCountry:     { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    destDemand:      { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold', color: '#4ade80' },
    destSalary:      { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', fontWeight: '600', marginBottom: 3 },
    destMetaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs, marginTop: spacing.xs },
    destMetaChip:    { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border },
    destMetaTxt:     { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    // Compact saturation indicator on collapsed card
    saturationIndicator: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)',
      borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginTop: spacing.xs, alignSelf: 'flex-start',
    },
    saturationIndicatorTxt: { fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_600SemiBold' },
    saturationWarn:  { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 5, marginTop: spacing.xs },
    saturationTxt:   { fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 15, flex: 1 },
    destSourceTxt:   { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontStyle: 'italic', marginTop: spacing.xs },
    // Details expand toggle
    detailsToggle:   { marginTop: spacing.sm, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: spacing.md },
    detailsToggleTxt: { fontSize: typo.xs, color: t.accentText, fontFamily: 'Lexend_600SemiBold', textDecorationLine: 'underline' },
    countryLink:     { marginTop: spacing.sm, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    countryLinkTxt:  { fontSize: typo.xs, color: t.accent, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
    progName:        { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    progBody:        { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 17, marginBottom: 3 },
    progLink:        { fontSize: typo.xs, color: t.accent, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline', marginTop: spacing.xs },
    progLinkBtn:     { minHeight: 44, justifyContent: 'center' },
    // Programs "See all" button
    seeAllBtn:       { marginTop: spacing.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
    seeAllTxt:       { fontSize: typo.sm, color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    // Disclaimer as footnote
    disclaimerFootnote: {
      fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular',
      lineHeight: 17, fontStyle: 'italic', textAlign: 'center',
      paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    },
    empty:           { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60 },
    emptySection:    { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' },
    schoolsLink:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    schoolsLinkIcon: { fontSize: 20 },
    schoolsLinkBody: { flex: 1 },
    schoolsLinkTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    schoolsLinkSub:  { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    schoolsLinkArr:  { fontSize: typo.md, color: t.textTertiary },
  })
}
