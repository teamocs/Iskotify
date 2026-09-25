import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Buildings1Outlined, Shield2CheckOutlined, FileQuestionOutlined, SparkOutlined } from '@lineiconshq/free-icons'
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
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { ListRow } from '../../components/ui/ListRow'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { decorative } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { LinkRow } from '../../components/explore/LinkRow'
import { spacing, radius, textStyle, type Theme } from '../../theme/tokens'

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
  /** When set, this card starts expanded if countryCodeFromName(dest.country) matches. */
  highlightCountryCode?: string
}

function DestinationCard({ dest, fmtSalary, styles: s, highlightCountryCode }: DestinationCardProps) {
  const isHighlighted = !!highlightCountryCode && !!dest.country &&
    countryCodeFromName(dest.country) === highlightCountryCode
  const [detailsOpen, setDetailsOpen] = useState(isHighlighted)
  const specializations = safeParseArray(dest.specializations)
  const countrySlug = dest.country ? countryCodeFromName(dest.country) : null
  const hasDetails = !!(
    dest.visaPathway || dest.prPathway || dest.timelineMonths != null ||
    dest.credential || dest.languageRequired || specializations.length > 0 ||
    dest.source || dest.saturationWarning
  )

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={s.destCountryRow}>
        <Text style={s.destCountry} maxFontSizeMultiplier={1.6}>{dest.country ?? '–'}</Text>
        {dest.demandRating ? <Badge label={`${dest.demandRating} demand`} tone="success" /> : null}
      </View>
      <Text style={s.destSalary} maxFontSizeMultiplier={1.6}>{fmtSalary(dest)}</Text>

      {/* Saturation stays visible when collapsed — it is safety-relevant. */}
      {dest.saturationWarning && !detailsOpen ? <Badge label="Market saturation noted" tone="warning" /> : null}

      {detailsOpen ? (
        <View style={{ gap: spacing.sm }}>
          <View style={s.destMetaRow}>
            {dest.visaPathway ? <Chip label={`Visa: ${dest.visaPathway}`} /> : null}
            {dest.prPathway ? <Chip label={`PR: ${dest.prPathway}`} /> : null}
            {dest.timelineMonths != null ? <Chip label={`${dest.timelineMonths} months`} /> : null}
            {dest.credential ? <Chip label={dest.credential} /> : null}
            {dest.languageRequired ? <Chip label={`Language: ${dest.languageRequired}`} /> : null}
          </View>
          {specializations.length > 0 ? (
            <Text style={s.destMetaTxt} maxFontSizeMultiplier={1.6}>Specializations: {specializations.join(', ')}</Text>
          ) : null}
          {dest.saturationWarning ? <Callout t={s.theme}>{dest.saturationWarning}</Callout> : null}
          {dest.source ? <Text style={s.destMetaTxt} maxFontSizeMultiplier={1.6}>Source: {dest.source}</Text> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginLeft: -spacing.lg }}>
        {hasDetails ? (
          <Button
            label={detailsOpen ? 'Hide details' : 'Show details'}
            accessibilityLabel={`${detailsOpen ? 'Hide' : 'Show'} ${dest.country ?? ''} details`}
            variant="ghost"
            size="sm"
            onPress={() => setDetailsOpen(v => !v)}
          />
        ) : null}
        {countrySlug ? (
          <Button
            label={`About ${dest.country}`}
            variant="ghost"
            size="sm"
            onPress={() => router.push(`/career/country/${countrySlug}` as never)}
          />
        ) : null}
      </View>
    </Card>
  )
}

/** A warning-tinted note: strong text on its own tint, with a drawn icon. */
function Callout({ children, t }: { children: string; t: Theme }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.sm, backgroundColor: t.warningSurface }}>
      <View {...decorative} style={{ marginTop: 2 }}>
        <Lineicons icon={Shield2CheckOutlined} size={16} color={t.warningStrong} />
      </View>
      <Text style={[textStyle('bodySm', t.warningStrong), { flex: 1 }]} maxFontSizeMultiplier={1.6}>{children}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CourseCareerDetailScreen() {
  const { courseId, country: countryParam } = useLocalSearchParams<{ courseId: string; country?: string }>()
  const db = useDb()
  const { theme: t } = useTheme()

  const [course, setCourse]           = useState<CourseRow | null>(null)
  const [destinations, setDestinations] = useState<DestinationRow[]>([])
  const [aiImpact, setAiImpact]       = useState<AiImpactRow | null>(null)
  const [programs, setPrograms]        = useState<ProgramRow[]>([])
  const [topSchoolsTab, setTopSchoolsTab] = useState<string | null>(null)
  const [status, setStatus]            = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt]          = useState(0)

  // Wave 3c: Programs expand
  const [programsExpanded, setProgramsExpanded] = useState(false)

  useEffect(() => {
    async function load() {
      setStatus('loading')
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

      setStatus('ready')
    }
    load().catch((e: unknown) => {
      console.warn('[career] load failed:', e)
      setStatus('error')
    })
  }, [db, courseId, attempt])

  const s = useMemo(() => makeStyles(t), [t])

  // ── Loading / error / missing ──────────────────────────────────────────────

  if (status !== 'ready' || !course) {
    return (
      <SafeAreaView style={s.root}>
        <DetailTopBar fallbackHref="/explore?section=courses" />
        <ScreenScroll tabBarInset={false}>
          {status === 'loading' ? (
            <View accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={{ gap: spacing.lg, paddingTop: spacing.md }}>
              <Skeleton width="75%" height={28} />
              <Skeleton height={140} radius={radius.xl} />
              <Skeleton height={120} radius={radius.xl} />
            </View>
          ) : status === 'error' ? (
            <ErrorState title="Couldn't load this course" onRetry={() => setAttempt(a => a + 1)} />
          ) : (
            <EmptyState
              icon={<Lineicons icon={FileQuestionOutlined} size={26} color={t.textSecondary} />}
              title="We couldn't find this course"
              actionLabel="Back to Explore"
              onAction={() => router.replace('/explore?section=courses')}
            />
          )}
        </ScreenScroll>
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
      <DetailTopBar fallbackHref="/explore?section=courses" />

      <ScreenScroll tabBarInset={false} contentContainerStyle={{ gap: spacing.xl, paddingTop: spacing.sm }}>

        {/* ── Hero ── */}
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={s.heroName} maxFontSizeMultiplier={1.4}>{course.name}</Text>
          {course.cluster ? <Text style={s.heroCluster} maxFontSizeMultiplier={1.6}>{course.cluster}</Text> : null}
          <View style={s.badgeRow}>
            {course.demand ? <Badge label={`${course.demand} demand`} tone="success" /> : null}
            {course.boardExam ? <Badge label={`Board exam${course.boardExamName ? `: ${course.boardExamName}` : ''}`} tone="accent" /> : null}
            {course.durationYears != null ? <Badge label={`${course.durationYears}-year programme`} tone="neutral" /> : null}
            {course.careerTag ? <Badge label={course.careerTag} tone="neutral" /> : null}
          </View>
          {course.summary ? <Text style={s.summaryTxt} maxFontSizeMultiplier={1.6}>{course.summary}</Text> : null}
          {course.studentTip ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              <View {...decorative} style={{ marginTop: 2 }}>
                <Lineicons icon={SparkOutlined} size={16} color={t.accentText} />
              </View>
              <Text style={[s.tipTxt, { flex: 1 }]} maxFontSizeMultiplier={1.6}>{course.studentTip}</Text>
            </View>
          ) : null}
        </View>

        {aiImpact ? <AiImpactCard impact={aiImpact} /> : null}

        {topSchoolsTab ? (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            <ListRow
              leading={(
                <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Lineicons icon={Buildings1Outlined} size={20} color={t.textSecondary} />
                </View>
              )}
              title="Top schools for this course"
              subtitle="Ranked by PRC board-exam pass rate"
              onPress={() => router.push(`/schools/course/${topSchoolsTab}` as never)}
            />
          </Card>
        ) : null}

        {/* ── Destinations ── */}
        <View>
          <SectionHeader title="Where can this take you?" subtitle="Countries hiring for this course, highest demand first" />
          {destinations.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              {destinations.map(dest => (
                <DestinationCard
                  key={dest.id}
                  dest={dest}
                  fmtSalary={fmtSalary}
                  styles={s}
                  highlightCountryCode={countryParam}
                />
              ))}
            </View>
          ) : (
            <Text style={s.emptySection} maxFontSizeMultiplier={1.6}>No destination data yet.</Text>
          )}
        </View>

        {/* ── Bilateral programmes: first one + See all ── */}
        {programs.length > 0 ? (
          <View>
            <SectionHeader title="Programmes" subtitle="Government-to-government hiring programmes" />
            <View style={{ gap: spacing.md }}>
              {visiblePrograms.map(prog => (
                <Card key={prog.id} style={{ gap: spacing.xs }}>
                  <Text style={s.progName} maxFontSizeMultiplier={1.6}>{prog.name ?? '–'}</Text>
                  {prog.managingBody ? <Text style={s.progBody} maxFontSizeMultiplier={1.6}>Managed by {prog.managingBody}</Text> : null}
                  {prog.countryRegion ? <Text style={s.progBody} maxFontSizeMultiplier={1.6}>Region: {prog.countryRegion}</Text> : null}
                  {prog.immigrationOutcome ? <Text style={s.progBody} maxFontSizeMultiplier={1.6}>Immigration outcome: {prog.immigrationOutcome}</Text> : null}
                  {prog.slots ? <Text style={s.progBody} maxFontSizeMultiplier={1.6}>Slots: {prog.slots}</Text> : null}
                  {prog.notes ? <Text style={s.progBody} maxFontSizeMultiplier={1.6}>{prog.notes}</Text> : null}
                  {prog.website ? <LinkRow label="Official site" url={prog.website} /> : null}
                </Card>
              ))}
            </View>
            {!programsExpanded && hiddenProgramCount > 0 ? (
              <Button
                label={`See all programmes (${hiddenProgramCount} more)`}
                variant="ghost"
                onPress={() => setProgramsExpanded(true)}
                style={{ alignSelf: 'center', marginTop: spacing.sm }}
              />
            ) : null}
          </View>
        ) : null}

        <Callout t={t}>
          Salaries, timelines and pathways are indicative. Check with DMW, embassies and official programme sites.
        </Callout>

      </ScreenScroll>
    </SafeAreaView>
  )
}

function makeStyles(t: Theme) {
  return {
    ...StyleSheet.create({
      root:            { flex: 1, backgroundColor: t.bg },
      heroName:        textStyle('title', t.textPrimary),
      heroCluster:     textStyle('bodySm', t.textSecondary),
      badgeRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
      summaryTxt:      textStyle('body', t.textSecondary),
      tipTxt:          textStyle('bodySm', t.textPrimary),
      destCountryRow:  { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
      destCountry:     textStyle('titleSm', t.textPrimary),
      destSalary:      { ...textStyle('label', t.textPrimary), fontVariant: ['tabular-nums'] },
      destMetaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
      destMetaTxt:     textStyle('bodySm', t.textSecondary),
      progName:        textStyle('titleSm', t.textPrimary),
      progBody:        textStyle('bodySm', t.textSecondary),
      emptySection:    textStyle('bodySm', t.textSecondary),
    }),
    theme: t,
  }
}
