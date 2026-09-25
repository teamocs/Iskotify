import { useState, useEffect } from 'react'
import { View, Text, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Bookmark1Outlined, CheckCircle1Outlined, GraduationCap1Outlined, FileQuestionOutlined, Shield2CheckOutlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { useBreakpoint, columnCount } from '../../hooks/useBreakpoint'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { useFocusListings } from '../../hooks/useFocusListings'
import { schoolFocusSlug } from '../../utils/focusSlug'
import { examAcronymToListingSlug, isRealExamAcronym } from '../../utils/targetExams'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { decorative } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { Disclosure } from '../../components/explore/Disclosure'
import { LinkRow } from '../../components/explore/LinkRow'
import type { BadgeSpec } from '../../components/explore/exploreModel'
import { radius, spacing, textStyle } from '../../theme/tokens'

// ---------------------------------------------------------------------------
// Types
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Some source rows (courses_offered AND scholarships_offered) store MANY
    // items as ONE separator-joined string (e.g. ["BS Nursing, BS Biology"]).
    // Split on comma / semicolon / newline / pipe, trim, drop empties and
    // de-dupe (case-insensitive) so every item gets its own chip.
    // '/' is intentionally NOT a separator ("UniFAST / RA 10931" is one name).
    const seen = new Set<string>()
    const out: string[] = []
    for (const entry of parsed.map(String)) {
      for (const part of entry.split(/[,;\n|]+/)) {
        const item = part.trim()
        if (!item) continue
        const key = item.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(item)
      }
    }
    return out
  } catch {
    return []
  }
}

function confidenceBadge(level: string | null): BadgeSpec {
  switch ((level ?? '').toUpperCase()) {
    case 'HIGH': return { label: 'High confidence', tone: 'success' }
    case 'MEDIUM': return { label: 'Medium confidence', tone: 'warning' }
    case 'LOW':
    case 'VERY LOW': return { label: 'Low confidence', tone: 'neutral' }
    default: return { label: 'Unverified', tone: 'neutral' }
  }
}

function FactRow({ label, value }: { label: string; value: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.xs }}>
      <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>{label}</Text>
      <Text style={[textStyle('label', t.textPrimary), { textAlign: 'right', flexShrink: 1 }]} maxFontSizeMultiplier={1.6}>{value}</Text>
    </View>
  )
}

/** Exam difficulty as five dots, spoken as words. */
function Difficulty({ count }: { count: number }) {
  const { theme: t } = useTheme()
  const n = Math.max(0, Math.min(5, Math.round(count)))
  return (
    <View
      accessible
      accessibilityLabel={`Difficulty: ${n} of 5`}
      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs }}
    >
      <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>Difficulty</Text>
      <View {...decorative} style={{ flexDirection: 'row', gap: spacing.xs }}>
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i < n ? t.accent : t.divider }} />
        ))}
      </View>
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

function SchoolSkeleton() {
  return (
    <View testID="school-skeleton" accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={{ gap: spacing.lg, paddingTop: spacing.md }}>
      <Skeleton width="85%" height={28} />
      <Skeleton width="45%" height={14} />
      <Skeleton height={200} radius={radius.xl} />
      <Skeleton height={48} radius={radius.lg} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const FALLBACK = '/explore?section=universities'

export default function SchoolProfileScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t } = useTheme()
  const twoUp = columnCount(useBreakpoint()) === 2
  const { isInFocus, getPriority, addListing, removeListing } = useFocusListings()

  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [profile, setProfile] = useState<ProfileDetail | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)

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

  if (status !== 'ready' || !school) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <DetailTopBar fallbackHref={FALLBACK} />
        <ScreenScroll tabBarInset={false}>
          {status === 'loading' ? <SchoolSkeleton /> : status === 'error' ? (
            <ErrorState title="Couldn't load this school" onRetry={() => setAttempt(a => a + 1)} />
          ) : (
            <EmptyState
              icon={<Lineicons icon={FileQuestionOutlined} size={26} color={t.textSecondary} />}
              title="We couldn't find this school"
              body="It may have been merged or renamed since your last sync."
              actionLabel="Back to Explore"
              onAction={() => router.replace('/explore')}
            />
          )}
        </ScreenScroll>
      </SafeAreaView>
    )
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const conf = confidenceBadge(profile?.dataConfidence ?? null)
  const lowConfidence = conf.label !== 'High confidence'
  const place = [school.city, school.province, school.region].filter(Boolean).join(', ')

  const knownFor = [...safeParseArray(profile?.knownForCourses ?? '[]'), ...safeParseArray(profile?.notablePrograms ?? '[]')]
  const prcTopCourses = safeParseArray(profile?.prcTopCourses ?? '[]')
  const coursesOffered = safeParseArray(profile?.coursesOffered ?? '[]')
  const scholarships = safeParseArray(profile?.scholarshipsOffered ?? '[]')
  const prcStrongBoards = safeParseArray(profile?.prcStrongBoards ?? '[]')
  const requirements = safeParseArray(profile?.requirements ?? '[]')
  const qualifications = safeParseArray(profile?.qualifications ?? '[]')

  const examName = [profile?.entranceExamName, profile?.entranceExamAcronym ? `(${profile.entranceExamAcronym})` : null]
    .filter(Boolean).join(' ')
  const applyWindow = [profile?.applicationOpen, profile?.applicationClose].filter(Boolean).join(' – ')
  const hasEntranceExam = !!(examName || profile?.examMonth || profile?.examDifficulty)

  // Focusable when the exam maps to a content-backed listing (UPCAT, ACET, …);
  // otherwise schools with a real exam get general entrance practice and the
  // school itself is what goes into Focus.
  const examSlug = examAcronymToListingSlug(profile?.entranceExamAcronym)
  const showGenericPractice = !examSlug && isRealExamAcronym(profile?.entranceExamAcronym)
  const focusSlug = examSlug ?? (showGenericPractice ? schoolFocusSlug(slug) : null)
  const inFocus = focusSlug ? isInFocus(focusSlug) : false
  const focusPriority = focusSlug ? getPriority(focusSlug) : null

  const hasLinks = !!(profile?.websiteUrl || profile?.applicationPortalUrl || profile?.facebookUrl)

  // ── Blocks ──────────────────────────────────────────────────────────────────

  const hero = (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {school.type ? <Badge label={school.type} tone="neutral" /> : null}
        {school.isSuc ? <Badge label="SUC" tone="accent" /> : null}
        {school.isLuc ? <Badge label="LUC" tone="accent" /> : null}
        {profile?.freeTuition ? <Badge label="Free tuition" tone="success" /> : null}
        <Badge label={conf.label} tone={conf.tone} />
      </View>
      <Text accessibilityRole="header" style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.4}>{school.name}</Text>
      {school.acronym || place ? (
        <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>
          {[school.acronym, place].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {profile?.yearEstablished ? (
        <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>Established {profile.yearEstablished}</Text>
      ) : null}
    </View>
  )

  // Dates and money first: when to apply, what the exam is, what it costs.
  const keyFacts = (
    <Card testID="school-key-facts" style={{ gap: spacing.md }}>
      <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.6}>Entrance exam</Text>
      {hasEntranceExam ? (
        <View>
          {examName ? <FactRow label="Exam" value={examName} /> : null}
          {applyWindow ? <FactRow label="Application window" value={applyWindow} /> : null}
          {profile?.examMonth ? <FactRow label="Exam month" value={profile.examMonth} /> : null}
          {profile?.testingCenterType ? <FactRow label="Testing center" value={profile.testingCenterType} /> : null}
          {profile?.estimatedSlots ? <FactRow label="Estimated slots" value={profile.estimatedSlots} /> : null}
          {profile?.estimatedPassingRate ? <FactRow label="Estimated pass rate" value={profile.estimatedPassingRate} /> : null}
          {profile?.examDifficulty != null ? <Difficulty count={profile.examDifficulty} /> : null}
        </View>
      ) : (
        <Text style={textStyle('bodySm', t.textPrimary)} maxFontSizeMultiplier={1.6}>
          No entrance exam on record. Check admissions on the official site.
        </Text>
      )}

      {profile?.tuitionFeeRange || profile?.freeTuition || profile?.academicCalendar ? (
        <>
          <View style={{ height: 1, backgroundColor: t.divider }} />
          <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.6}>Tuition</Text>
          <View>
            {profile?.freeTuition ? <FactRow label="Free tuition" value="Yes (RA 10931)" /> : null}
            {profile?.tuitionFeeRange ? <FactRow label="Fee range" value={profile.tuitionFeeRange} /> : null}
            {profile?.academicCalendar ? <FactRow label="Academic calendar" value={profile.academicCalendar} /> : null}
          </View>
        </>
      ) : null}
    </Card>
  )

  const actions = focusSlug ? (
    <View style={{ gap: spacing.sm }}>
      {examSlug ? (
        <Button
          label="View exam and practise"
          size="lg"
          fullWidth={!twoUp}
          icon={<Lineicons icon={GraduationCap1Outlined} size={18} color={t.textInverse} />}
          onPress={() => router.push(`/listings/${examSlug}`)}
        />
      ) : (
        <Button
          label="Practise with the general entrance mock"
          size="lg"
          fullWidth={!twoUp}
          onPress={() => router.push(`/practice/start/${focusSlug}`)}
        />
      )}
      <Button
        label={inFocus ? `In Focus #${focusPriority}` : 'Add to Focus'}
        accessibilityLabel={inFocus ? `In Focus #${focusPriority}. Remove from Focus` : 'Add to Focus'}
        variant="secondary"
        icon={<Lineicons icon={inFocus ? CheckCircle1Outlined : Bookmark1Outlined} size={16} color={t.accentText} />}
        onPress={() => (inFocus ? removeListing(focusSlug) : addListing(focusSlug))}
      />
      {showGenericPractice ? (
        <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>
          This school&apos;s exam isn&apos;t modelled on its own yet. General practice covers the core subjects: English, Math, Science and Reading.
        </Text>
      ) : null}
    </View>
  ) : null

  const paperwork = (requirements.length > 0 || qualifications.length > 0) ? (
    <View style={{ gap: spacing.lg }}>
      {requirements.length > 0 ? (
        <View>
          <SectionHeader title="Application requirements" subtitle="Documents to prepare" />
          <ChipList items={requirements} />
        </View>
      ) : null}
      {qualifications.length > 0 ? (
        <View>
          <SectionHeader title="Qualifications" subtitle="Who can apply" />
          <ChipList items={qualifications} />
        </View>
      ) : null}
    </View>
  ) : null

  const secondary = (
    <View>
      {(profile?.accreditation || profile?.chedCoeCod) ? (
        <View style={{ paddingBottom: spacing.md }}>
          <SectionHeader title="Accreditation" />
          {profile?.accreditation ? <FactRow label="Accreditation" value={profile.accreditation} /> : null}
          {profile?.chedCoeCod ? <FactRow label="CHED COE/COD" value={profile.chedCoeCod} /> : null}
        </View>
      ) : null}
      {knownFor.length > 0 ? (
        <Disclosure title="Known for" preview={knownFor.slice(0, 3).join(', ')} defaultExpanded>
          <ChipList items={knownFor} />
        </Disclosure>
      ) : null}
      {coursesOffered.length > 0 ? (
        <Disclosure title="Courses offered" preview={`${coursesOffered.length} programmes`}>
          <ChipList items={coursesOffered} />
        </Disclosure>
      ) : null}
      {scholarships.length > 0 ? (
        <Disclosure title="Scholarships offered" preview={scholarships.slice(0, 2).join(', ')}>
          <ChipList items={scholarships} />
        </Disclosure>
      ) : null}
      {prcStrongBoards.length > 0 ? (
        <Disclosure title="PRC strong boards" preview={prcStrongBoards.slice(0, 3).join(', ')}>
          <ChipList items={prcStrongBoards} />
        </Disclosure>
      ) : null}
      {prcTopCourses.length > 0 ? (
        <Disclosure title="PRC top courses" preview={prcTopCourses.slice(0, 3).join(', ')}>
          <ChipList items={prcTopCourses} />
        </Disclosure>
      ) : null}
      {profile?.notes ? (
        <Disclosure title="Notes" preview={profile.notes.slice(0, 60)}>
          <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>{profile.notes}</Text>
        </Disclosure>
      ) : null}
      {hasLinks ? (
        <View style={{ borderTopWidth: 1, borderTopColor: t.divider, paddingTop: spacing.md }}>
          <SectionHeader title="Links" />
          {profile?.websiteUrl ? <LinkRow label="Official website" onPress={() => { void Linking.openURL(profile.websiteUrl!) }} /> : null}
          {profile?.applicationPortalUrl ? <LinkRow label="Application portal" onPress={() => { void Linking.openURL(profile.applicationPortalUrl!) }} /> : null}
          {profile?.facebookUrl ? <LinkRow label="Facebook page" onPress={() => { void Linking.openURL(profile.facebookUrl!) }} /> : null}
        </View>
      ) : null}
      {lowConfidence ? (
        <View
          style={{
            flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.lg,
            padding: spacing.md, borderRadius: radius.sm, backgroundColor: t.warningSurface,
          }}
        >
          <View {...decorative} style={{ marginTop: 2 }}>
            <Lineicons icon={Shield2CheckOutlined} size={16} color={t.warningStrong} />
          </View>
          <Text style={[textStyle('bodySm', t.warningStrong), { flex: 1 }]} maxFontSizeMultiplier={1.6}>
            Some details may be unconfirmed. Check the official site before you decide.
          </Text>
        </View>
      ) : null}
    </View>
  )

  const main = (
    <View style={{ gap: spacing.xl }}>
      {hero}
      {keyFacts}
      {actions}
      {paperwork}
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <DetailTopBar fallbackHref={FALLBACK} />
      <ScreenScroll tabBarInset={false} contentContainerStyle={{ paddingTop: spacing.sm }}>
        {twoUp ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxl }}>
            <View style={{ flex: 3, minWidth: 0 }}>{main}</View>
            <View style={{ flex: 2, minWidth: 0 }}>{secondary}</View>
          </View>
        ) : (
          <View style={{ gap: spacing.xl }}>
            {main}
            {secondary}
          </View>
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
