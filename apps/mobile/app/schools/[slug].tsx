import { useState, useEffect, type ReactNode } from 'react'
import { View, Platform, Share } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Bookmark1Outlined, CheckCircle1Outlined, ChevronLeftOutlined, FileQuestionOutlined, GraduationCap1Outlined,
  Share1Outlined, Shield2CheckOutlined, XmarkOutlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { useFocusListings } from '../../hooks/useFocusListings'
import { schoolFocusSlug } from '../../utils/focusSlug'
import { examAcronymToListingSlug, isRealExamAcronym } from '../../utils/targetExams'
import { listRunnableBlueprints } from '../../services/examBlueprints'
import { hasReviewContent } from '../../services/practiceSignals'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Glass } from '../../components/ui/Glass'
import { InsetGroup, InsetRow } from '../../components/ui/InsetGroup'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Text } from '../../components/ui/Text'
import { decorative, heading } from '../../components/ui/a11y'
import { GlassIconButton } from '../../components/navigation/GlassIconButton'
import { goBackOr } from '../../components/explore/DetailTopBar'
import { LinkRow } from '../../components/explore/LinkRow'
import { LogoTile } from '../../components/explore/LogoTile'
import { RequirementsChecklist } from '../../components/RequirementsChecklist'
import { confidenceBadge, splitListField } from '../../components/schools/schoolModel'
import { pagePadding, useBreakpoint } from '../../hooks/useBreakpoint'
import { radius, spacing, weight } from '../../theme/tokens'

// ---------------------------------------------------------------------------
// A school's profile, presented as a routed sheet on native (half height,
// drags to full; components/schools/schoolSheet) and a push on web:
// a maroon hero band with glass close and share buttons, the logo tile, the
// name, fact chips, then Overview / Courses / Admissions. The one primary
// action, "Add to my focus", sits in the bottom bar. Only what the catalog
// holds is shown; a missing fact reads "Not yet available".
// ---------------------------------------------------------------------------

interface SchoolDetail {
  id: string
  name: string
  acronym: string | null
  region: string | null
  province: string | null
  city: string | null
  type: string | null
  isSuc: boolean
  isLuc: boolean
}

interface ProfileDetail {
  schoolId: string
  dataTier: string | null
  institutionType: string | null
  yearEstablished: string | null
  knownForCourses: string
  prcTopCourses: string
  chedCoeCod: string | null
  accreditation: string | null
  entranceExamName: string | null
  entranceExamAcronym: string | null
  testingCenterType: string | null
  applicationOpen: string | null
  applicationClose: string | null
  examMonth: string | null
  estimatedPassingRate: string | null
  estimatedSlots: string | null
  tuitionFeeRange: string | null
  freeTuition: boolean | null
  academicCalendar: string | null
  coursesOffered: string
  scholarshipsOffered: string
  requirements: string
  qualifications: string
  websiteUrl: string | null
  applicationPortalUrl: string | null
  facebookUrl: string | null
  examDifficulty: number | null
  notablePrograms: string
  prcStrongBoards: string
  notes: string | null
  dataConfidence: string | null
}

type Status = 'loading' | 'ready' | 'missing' | 'error'
type Segment = 'overview' | 'courses' | 'admissions'

const SEGMENTS = [
  { value: 'overview', label: 'Overview' },
  { value: 'courses', label: 'Courses' },
  { value: 'admissions', label: 'Admissions' },
] as const

const FALLBACK = '/explore?section=universities'
/** The general entrance exam a school-level focus practises with (see app/practice/start/[slug].tsx). */
const GENERAL_EXAM_SLUG = 'general-cet'
/** What a fact the catalog does not hold reads as. */
const NOT_YET = 'Not yet available'

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** One key-fact tile of the 2×2 grid: a label over its value, or "Not yet available". */
function FactTile({ label, value }: { label: string; value: string | null | undefined }) {
  const { theme: t } = useTheme()
  const has = !!(value && value.trim())
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${has ? value : NOT_YET}`}
      style={{
        flexBasis: '47%', flexGrow: 1, minWidth: 0, minHeight: 76,
        padding: spacing.md, gap: 2,
        backgroundColor: t.surface, borderRadius: radius.group, borderCurve: 'continuous',
      }}
    >
      <Text role="footnote" color={t.textSecondary}>{label}</Text>
      <Text role={has ? 'headline' : 'subheadline'} color={has ? t.textPrimary : t.textTertiary}>
        {has ? value : NOT_YET}
      </Text>
    </View>
  )
}

/** Exam difficulty as five drawn dots, spoken as words. */
function DifficultyDots({ count }: { count: number }) {
  const { theme: t } = useTheme()
  const n = Math.max(0, Math.min(5, Math.round(count)))
  return (
    <View {...decorative} style={{ flexDirection: 'row', gap: spacing.xs }}>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i < n ? t.accent : t.divider }} />
      ))}
    </View>
  )
}

function ChipList({ items }: { items: string[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
      {items.map(item => <Chip key={item} label={item} />)}
    </View>
  )
}

/** A titled block in a panel: a footnote heading (h3) over its content. */
function Block({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  const { theme: t } = useTheme()
  return (
    <View testID={testID} style={{ gap: spacing.sm }}>
      <Text role="footnote" color={t.textSecondary} {...heading(3)} style={[weight('600'), { paddingHorizontal: spacing.lg }]}>
        {title}
      </Text>
      {children}
    </View>
  )
}

function SchoolSkeleton() {
  return (
    <View testID="school-skeleton" accessible accessibilityLabel="Loading" aria-busy style={{ gap: spacing.lg, paddingTop: spacing.md }}>
      <Skeleton width="85%" height={28} />
      <Skeleton width="45%" height={14} />
      <Skeleton height={44} radius={radius.capsule} />
      <Skeleton height={160} radius={radius.group} />
    </View>
  )
}

/**
 * The maroon hero band with its glass circle buttons. Native: Close
 * dismisses the sheet. Web (a push): Back, with the parent route after a
 * deep link. Share appears once there is a school to share.
 */
function HeroBand({ onShare }: { onShare?: () => void }) {
  const { theme: t } = useTheme()
  const insets = useSafeInsets()
  const web = Platform.OS === 'web'
  const close = () => {
    if (!web && router.canDismiss?.()) router.dismiss()
    else goBackOr(FALLBACK)
  }
  return (
    <View
      testID="school-hero"
      style={{
        backgroundColor: t.accent,
        minHeight: 132 + (web ? insets.top : 0),
        paddingTop: (web ? insets.top : 0) + spacing.md,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
      }}
    >
      <GlassIconButton
        icon={web ? ChevronLeftOutlined : XmarkOutlined}
        accessibilityLabel={web ? 'Go back' : 'Close'}
        onPress={close}
      />
      {onShare ? <GlassIconButton icon={Share1Outlined} accessibilityLabel="Share" accessibilityHint="Shares this school's name and official site" onPress={onShare} /> : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SchoolProfileScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t } = useTheme()
  const gutter = pagePadding(useBreakpoint())
  const insets = useSafeInsets()
  const { isInFocus, getPriority, addListing, removeListing } = useFocusListings()

  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [profile, setProfile] = useState<ProfileDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)
  const [segment, setSegment] = useState<Segment>('overview')

  useEffect(() => {
    let alive = true
    setStatus('loading')
    Promise.all([
      db.select().from(schoolsTable).where(eq(schoolsTable.id, slug)).limit(1),
      db.select().from(profilesTable).where(eq(profilesTable.schoolId, slug)).limit(1),
    ]).then(([schoolRows, profileRows]) => {
      if (!alive) return
      const sc = (schoolRows[0] ?? null) as SchoolDetail | null
      setSchool(sc)
      setProfile((profileRows[0] ?? null) as ProfileDetail | null)
      setStatus(sc ? 'ready' : 'missing')
    }).catch((e: unknown) => {
      console.warn('[school] load failed:', e)
      if (alive) setStatus('error')
    })
    return () => { alive = false }
  }, [db, slug, attempt])

  // A school whose own exam has no content practises with the general entrance
  // exam ('general-cet'): say "mock" only when that mock can run, else offer
  // its topic review, else nothing (null while unknown).
  const examAcronym = profile?.entranceExamAcronym
  const needsGeneral = !examAcronymToListingSlug(examAcronym) && isRealExamAcronym(examAcronym)
  const [generalPractice, setGeneralPractice] = useState<'mock' | 'review' | 'none' | null>(null)
  useEffect(() => {
    if (!needsGeneral) return
    let alive = true
    Promise.all([listRunnableBlueprints(db), hasReviewContent(db, GENERAL_EXAM_SLUG)])
      .then(([runnable, review]) => {
        if (alive) setGeneralPractice(runnable.some(b => b.slug === GENERAL_EXAM_SLUG) ? 'mock' : review ? 'review' : 'none')
      })
      .catch((e: unknown) => console.warn('[school] general practice lookup failed:', e))
    return () => { alive = false }
  }, [db, needsGeneral])

  // The native sheet has its own top edge (the grabber); the web push keeps
  // the top safe area inside the hero band.
  const root = (children: ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{children}</View>
  )

  if (status !== 'ready' || !school) {
    return root(
      <ScreenScroll tabBarInset={false} padded={false}>
        <HeroBand />
        <View style={{ paddingHorizontal: gutter }}>
          {status === 'loading' ? <SchoolSkeleton /> : status === 'error' ? (
            <ErrorState title="Couldn't load this school" onRetry={() => setAttempt(a => a + 1)} />
          ) : (
            <EmptyState
              icon={<Lineicons icon={FileQuestionOutlined} size={26} color={t.textSecondary} />}
              title="We couldn't find this school"
              body="It may have been merged or renamed since your last sync."
              actionLabel="Back to Explore"
              onAction={() => {
                // Inside the native sheet: close it, never replace the sheet route with the tabs.
                if (Platform.OS !== 'web' && router.canDismiss?.()) router.dismiss()
                else router.replace('/explore')
              }}
            />
          )}
        </View>
      </ScreenScroll>,
    )
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const conf = confidenceBadge(profile?.dataConfidence) ?? { label: 'Unverified', tone: 'neutral' as const }
  const lowConfidence = conf.label !== 'High confidence'
  const place = [school.city, school.province, school.region].filter(Boolean).join(', ')

  const knownFor = [...splitListField(profile?.knownForCourses), ...splitListField(profile?.notablePrograms)]
  const prcTopCourses = splitListField(profile?.prcTopCourses)
  const coursesOffered = splitListField(profile?.coursesOffered)
  const scholarships = splitListField(profile?.scholarshipsOffered)
  const prcStrongBoards = splitListField(profile?.prcStrongBoards)
  const requirements = splitListField(profile?.requirements)
  const qualifications = splitListField(profile?.qualifications)

  const examName = [profile?.entranceExamName, profile?.entranceExamAcronym ? `(${profile.entranceExamAcronym})` : null]
    .filter(Boolean).join(' ')
  const applyWindow = [profile?.applicationOpen, profile?.applicationClose].filter(Boolean).join(' – ')
  const hasEntranceExam = !!(examName || profile?.examMonth || profile?.examDifficulty)
  const tuition = profile?.freeTuition ? 'Free (RA 10931)' : profile?.tuitionFeeRange ?? null

  // Focusable when the exam maps to a content-backed listing (UPCAT, ACET, …);
  // otherwise schools with a real exam get general entrance practice and the
  // school itself is what goes into Focus.
  const examSlug = examAcronymToListingSlug(profile?.entranceExamAcronym)
  const showGenericPractice = !examSlug && isRealExamAcronym(profile?.entranceExamAcronym)
  const focusSlug = examSlug ?? (showGenericPractice ? schoolFocusSlug(slug) : null)
  const inFocus = focusSlug ? isInFocus(focusSlug) : false
  const focusPriority = focusSlug ? getPriority(focusSlug) : null

  const share = () => {
    const site = profile?.websiteUrl ? `\nOfficial site: ${profile.websiteUrl}` : ''
    Share.share({ message: `${school.name}${site}` }).catch(() => { /* dismissed or unsupported */ })
  }

  // ── Panels ──────────────────────────────────────────────────────────────────

  const practiceGroup = examSlug ? (
    <InsetGroup inset={false}>
      <InsetRow
        icon={GraduationCap1Outlined}
        title="View exam and practise"
        onPress={() => router.push(`/listings/${examSlug}`)}
      />
    </InsetGroup>
  ) : generalPractice === 'mock' || generalPractice === 'review' ? (
    <InsetGroup
      inset={false}
      footer="This school's exam isn't modelled on its own yet. General practice covers the core subjects: English, Math, Science and Reading."
    >
      <InsetRow
        icon={GraduationCap1Outlined}
        title={generalPractice === 'mock' ? 'Practise with the general entrance mock' : 'Practise general entrance topics'}
        onPress={() => router.push(`/practice/start/${focusSlug}`)}
      />
    </InsetGroup>
  ) : generalPractice === 'none' ? (
    <Text role="footnote" color={t.textSecondary} style={{ paddingHorizontal: spacing.lg }}>Practice coming soon</Text>
  ) : null

  const links = profile?.websiteUrl || profile?.facebookUrl ? (
    <Block title="Links">
      <View style={{ backgroundColor: t.surface, borderRadius: radius.group, borderCurve: 'continuous', overflow: 'hidden' }}>
        {profile?.websiteUrl ? <LinkRow grouped label="Official website" url={profile.websiteUrl} /> : null}
        {profile?.facebookUrl ? <LinkRow grouped label="Facebook page" url={profile.facebookUrl} /> : null}
      </View>
    </Block>
  ) : null

  const about = [
    profile?.yearEstablished ? { title: 'Established', value: profile.yearEstablished } : null,
    profile?.accreditation ? { title: 'Accreditation', value: profile.accreditation } : null,
    profile?.chedCoeCod ? { title: 'CHED COE/COD', value: profile.chedCoeCod } : null,
    profile?.academicCalendar ? { title: 'Academic calendar', value: profile.academicCalendar } : null,
    profile?.tuitionFeeRange && profile?.freeTuition ? { title: 'Fee range', value: profile.tuitionFeeRange } : null,
  ].filter((r): r is { title: string; value: string } => r !== null)

  const overview = (
    <View style={{ gap: spacing.xl }}>
      {/* Dates and money first: the exam, when to apply, when it is, what it costs. */}
      <View testID="school-key-facts" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <FactTile label="Entrance exam" value={examName || null} />
        <FactTile label="Applications" value={applyWindow || null} />
        <FactTile label="Exam month" value={profile?.examMonth} />
        <FactTile label="Tuition" value={tuition} />
      </View>
      {practiceGroup}
      {about.length > 0 ? (
        <InsetGroup inset={false} header="About">
          {about.map(r => <InsetRow key={r.title} title={r.title} value={r.value} />)}
        </InsetGroup>
      ) : null}
      {knownFor.length > 0 ? (
        <Block title="Known for"><ChipList items={knownFor} /></Block>
      ) : null}
      {profile?.notes ? (
        <Block title="Notes">
          <Text role="body" color={t.textSecondary} style={{ paddingHorizontal: spacing.lg }}>{profile.notes}</Text>
        </Block>
      ) : null}
      {links}
    </View>
  )

  const courseBlocks = [
    { title: `Courses offered (${coursesOffered.length})`, items: coursesOffered },
    { title: 'PRC strong boards', items: prcStrongBoards },
    { title: 'PRC top courses', items: prcTopCourses },
    { title: 'Scholarships offered', items: scholarships },
  ].filter(b => b.items.length > 0)

  const courses = (
    <View style={{ gap: spacing.xl }}>
      {courseBlocks.length > 0 ? courseBlocks.map(b => (
        <Block key={b.title} title={b.title}><ChipList items={b.items} /></Block>
      )) : (
        <Text role="body" color={t.textSecondary} style={{ paddingHorizontal: spacing.lg }}>
          Course details for this school are not yet available.
        </Text>
      )}
    </View>
  )

  const examRows = [
    examName ? { title: 'Exam', value: examName } : null,
    applyWindow ? { title: 'Application window', value: applyWindow } : null,
    profile?.examMonth ? { title: 'Exam month', value: profile.examMonth } : null,
    profile?.testingCenterType ? { title: 'Testing center', value: profile.testingCenterType } : null,
    profile?.estimatedSlots ? { title: 'Estimated slots', value: profile.estimatedSlots } : null,
    profile?.estimatedPassingRate ? { title: 'Estimated pass rate', value: profile.estimatedPassingRate } : null,
  ].filter((r): r is { title: string; value: string } => r !== null)

  const admissions = (
    <View style={{ gap: spacing.xl }}>
      {hasEntranceExam ? (
        <InsetGroup inset={false} header="Entrance exam">
          {examRows.map(r => <InsetRow key={r.title} title={r.title} value={r.value} />)}
          {profile?.examDifficulty != null ? (
            <InsetRow
              title="Difficulty"
              accessibilityLabel={`Difficulty: ${Math.max(0, Math.min(5, Math.round(profile.examDifficulty)))} of 5`}
              trailing={<DifficultyDots count={profile.examDifficulty} />}
            />
          ) : null}
        </InsetGroup>
      ) : (
        <InsetGroup inset={false} header="Entrance exam" footer="Check admissions on the official site.">
          <InsetRow title="No entrance exam on record" />
        </InsetGroup>
      )}
      {requirements.length > 0 ? (
        <Block title="Application requirements" testID="school-requirements">
          <RequirementsChecklist listingSlug={schoolFocusSlug(slug)} requirements={requirements} />
        </Block>
      ) : (
        <InsetGroup inset={false} header="Application requirements">
          <InsetRow title={NOT_YET} />
        </InsetGroup>
      )}
      {qualifications.length > 0 ? (
        <InsetGroup inset={false} header="Who can apply">
          {qualifications.map(q => <InsetRow key={q} title={q} />)}
        </InsetGroup>
      ) : null}
      {profile?.applicationPortalUrl ? (
        <Block title="Apply">
          <View style={{ backgroundColor: t.surface, borderRadius: radius.group, borderCurve: 'continuous', overflow: 'hidden' }}>
            <LinkRow grouped label="Application portal" url={profile.applicationPortalUrl} />
          </View>
        </Block>
      ) : null}
    </View>
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return root(
    <>
      <ScreenScroll tabBarInset={false} padded={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <HeroBand onShare={share} />
        <View style={{ paddingHorizontal: gutter, gap: spacing.lg }}>
          <View style={{ marginTop: -36, gap: spacing.sm }}>
            <LogoTile name={school.name} acronym={school.acronym} size={72} />
            <Text role="title1" accessibilityRole="header" aria-level={1}>{school.name}</Text>
            {school.acronym || place ? (
              <Text role="subheadline" color={t.textSecondary}>{[school.acronym, place].filter(Boolean).join(' · ')}</Text>
            ) : null}
            <View testID="school-fact-chips" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {/* The type text can itself be "SUC"/"LUC" — don't repeat the flag badge. */}
              {school.type && !((school.isSuc && /^suc$/i.test(school.type.trim())) || (school.isLuc && /^luc$/i.test(school.type.trim())))
                ? <Badge label={school.type} tone="neutral" /> : null}
              {school.isSuc ? <Badge label="SUC" tone="accent" /> : null}
              {school.isLuc ? <Badge label="LUC" tone="accent" /> : null}
              {profile?.freeTuition ? <Badge label="Free tuition" tone="success" /> : null}
              <Badge label={conf.label} tone={conf.tone} />
            </View>
          </View>

          <SegmentedControl
            testID="school-segments"
            segments={SEGMENTS}
            value={segment}
            onChange={setSegment}
            accessibilityLabel="School details"
          />

          {segment === 'overview' ? overview : segment === 'courses' ? courses : admissions}

          {lowConfidence ? (
            <View
              style={{
                flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
                padding: spacing.md, borderRadius: radius.field, backgroundColor: t.warningSurface,
              }}
            >
              <View {...decorative} style={{ marginTop: 2 }}>
                <Lineicons icon={Shield2CheckOutlined} size={16} color={t.warningStrong} />
              </View>
              <Text role="footnote" color={t.warningStrong} style={{ flex: 1 }}>
                Some details may be unconfirmed. Check the official site before you decide.
              </Text>
            </View>
          ) : null}
        </View>
      </ScreenScroll>

      {/* The screen's one primary action. */}
      {focusSlug ? (
        <Glass
          variant="header"
          testID="school-bottom-bar"
          style={{
            paddingHorizontal: gutter, paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            borderTopWidth: 1, borderTopColor: t.divider,
          }}
        >
          <Button
            testID="primary-action"
            label={inFocus ? `In my focus #${focusPriority}` : 'Add to my focus'}
            accessibilityLabel={inFocus ? `In my focus #${focusPriority}. Remove from my focus` : 'Add to my focus'}
            accessibilityHint={inFocus ? undefined : 'Pins it to Today with a countdown'}
            shape="pill"
            size="lg"
            fullWidth
            icon={<Lineicons icon={inFocus ? CheckCircle1Outlined : Bookmark1Outlined} size={18} color={t.textInverse} />}
            onPress={() => (inFocus ? removeListing(focusSlug) : addListing(focusSlug))}
          />
        </Glass>
      ) : null}
    </>,
  )
}
