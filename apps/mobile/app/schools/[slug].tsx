import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, Pressable,
  Linking, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { useFocusListings } from '../../hooks/useFocusListings'
import { examAcronymToListingSlug } from '../../utils/targetExams'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { spacing, radius, type Theme } from '../../theme/tokens'

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
  websiteUrl: string | null
  applicationPortalUrl: string | null
  facebookUrl: string | null
  examDifficulty: number | null
  notablePrograms: string
  prcStrongBoards: string
  notes: string | null
  dataConfidence: string | null
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

type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY LOW' | null

// Theme-aware so LOW/VERY LOW/Unverified text stays legible in BOTH themes
// (the old white-on-white neutral was invisible on the light palette).
function confidenceBadgeStyle(level: ConfidenceLevel, t: Theme): { bg: string; border: string; text: string; label: string } {
  switch ((level ?? '').toUpperCase()) {
    case 'HIGH':
      return { bg: t.successSurface, border: t.success, text: t.success, label: 'HIGH confidence' }
    case 'MEDIUM':
      return { bg: t.warningSurface, border: t.warning, text: t.warning, label: 'MEDIUM confidence' }
    case 'LOW':
      return { bg: t.surfaceSubtle, border: t.border, text: t.textTertiary, label: 'LOW confidence' }
    case 'VERY LOW':
      return { bg: t.surfaceSubtle, border: t.border, text: t.textTertiary, label: 'VERY LOW confidence' }
    default:
      return { bg: t.surfaceSubtle, border: t.border, text: t.textTertiary, label: 'Unverified' }
  }
}

function shouldShowDisclaimer(level: ConfidenceLevel): boolean {
  const lvl = (level ?? '').toUpperCase()
  return lvl === 'LOW' || lvl === 'MEDIUM' || lvl === 'VERY LOW'
}

function StarDots({ count, max = 5, filledColor, emptyColor }: {
  count: number; max?: number; filledColor: string; emptyColor: string
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: max }, (_, i) => (
        <View
          key={i}
          style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: i < count ? filledColor : emptyColor,
          }}
        />
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SchoolProfileScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const { isInFocus, getPriority, addListing, removeListing } = useFocusListings()

  const [school, setSchool]   = useState<SchoolDetail | null>(null)
  const [profile, setProfile] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [schoolRows, profileRows] = await Promise.all([
        db.select().from(schoolsTable).where(eq(schoolsTable.id, slug)).limit(1),
        db.select().from(profilesTable).where(eq(profilesTable.schoolId, slug)).limit(1),
      ])
      setSchool((schoolRows[0] ?? null) as SchoolDetail | null)
      setProfile((profileRows[0] ?? null) as ProfileDetail | null)
      setLoading(false)
    }
    void load()
  }, [db, slug])

  const s = useMemo(() => StyleSheet.create({
    root:          { flex: 1, backgroundColor: t.bg },
    topBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:       { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    backArrow:     { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:      { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    // Hero
    heroName:      { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs },
    heroAcronym:   { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.sm },
    heroLocation:  { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 19, marginBottom: spacing.sm },
    badgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
    badge:         { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, borderWidth: 1 },
    badgeTxt:      { fontSize: typo.xs, fontFamily: 'Lexend_400Regular' },
    // Section
    section:       { marginTop: spacing.lg },
    row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
    rowLabel:      { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flex: 1 },
    rowValue:      { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', flex: 2, textAlign: 'right' },
    // Chips / pills
    pillWrap:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    pill:          { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider },
    pillTxt:       { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    // Link buttons
    linkBtn:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: t.surface, borderRadius: radius.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border, marginBottom: spacing.sm },
    linkTxt:       { flex: 1, fontSize: typo.sm, color: t.accent, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
    linkArrow:     { fontSize: typo.sm, color: t.textTertiary },
    // Focus button (entrance-exam section)
    focusBtn:      { marginTop: spacing.md, minHeight: 48, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    focusAdd:      { backgroundColor: t.accentStrong },
    focusAddTxt:   { fontSize: typo.sm, color: t.textInverse, fontFamily: 'Lexend_600SemiBold' },
    focusOn:       { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: t.accent },
    focusOnTxt:    { fontSize: typo.sm, color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    examLinkBtn:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: t.surface2, borderRadius: radius.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: t.divider },
    examLinkTxt:   { flex: 1, fontSize: typo.sm, color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    // Disclaimer
    disclaimer:    { marginTop: spacing.lg, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md },
    disclaimerTxt: { fontSize: typo.sm, color: t.warning, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    // Empty/error
    empty:         { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60, fontSize: typo.sm },
  }), [t, typo])

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (!school) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
        </View>
        <Text style={s.empty}>School not found.</Text>
      </SafeAreaView>
    )
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const confidence = (profile?.dataConfidence?.toUpperCase() ?? null) as ConfidenceLevel
  const confBadge  = confidenceBadgeStyle(confidence, t)
  const showDisclaimer = shouldShowDisclaimer(confidence)

  const locationParts = [school.city, school.province, school.region].filter(Boolean)

  // Parse JSON arrays safely
  const knownForCourses   = safeParseArray(profile?.knownForCourses    ?? '[]')
  const prcTopCourses     = safeParseArray(profile?.prcTopCourses       ?? '[]')
  const coursesOffered    = safeParseArray(profile?.coursesOffered      ?? '[]')
  const scholarships      = safeParseArray(profile?.scholarshipsOffered ?? '[]')
  const notablePrograms   = safeParseArray(profile?.notablePrograms     ?? '[]')
  const prcStrongBoards   = safeParseArray(profile?.prcStrongBoards     ?? '[]')

  const hasEntranceExam = !!(
    profile?.entranceExamName ||
    profile?.entranceExamAcronym ||
    profile?.examMonth ||
    profile?.examDifficulty
  )

  const hasLinks = !!(profile?.websiteUrl || profile?.applicationPortalUrl || profile?.facebookUrl)

  // This school's entrance exam is focusable iff its acronym maps to one of the
  // slug-backed exam listings (UPCAT, ACET, …). Most regional exams have no
  // listing/practice content, so no focus button is shown for them.
  const examSlug = examAcronymToListingSlug(profile?.entranceExamAcronym)
  const examInFocus = examSlug ? isInFocus(examSlug) : false
  const examFocusPriority = examSlug ? getPriority(examSlug) : null

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>{school.acronym ?? school.name}</Text>
      </View>

      <ScreenScroll tabBarInset={false}>

        {/* ── Hero ── */}
        <Card elevated style={{ marginTop: spacing.md }}>
          <Text style={s.heroName}>{school.name}</Text>
          {school.acronym ? (
            <Text style={s.heroAcronym}>{school.acronym}</Text>
          ) : null}
          {locationParts.length > 0 ? (
            <Text style={s.heroLocation}>{locationParts.join(' · ')}</Text>
          ) : null}

          <View style={s.badgeRow}>
            {/* School type */}
            {school.type ? (
              <View style={[s.badge, { backgroundColor: t.surface2, borderColor: t.border }]}>
                <Text style={[s.badgeTxt, { color: t.textSecondary }]}>{school.type}</Text>
              </View>
            ) : null}
            {/* SUC / LUC */}
            {school.isSuc ? (
              <View style={[s.badge, { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.25)' }]}>
                <Text style={[s.badgeTxt, { color: t.accentText }]}>SUC</Text>
              </View>
            ) : null}
            {school.isLuc ? (
              <View style={[s.badge, { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.25)' }]}>
                <Text style={[s.badgeTxt, { color: t.accentText }]}>LUC</Text>
              </View>
            ) : null}
            {/* Data confidence */}
            <View style={[s.badge, { backgroundColor: confBadge.bg, borderColor: confBadge.border }]}>
              <Text style={[s.badgeTxt, { color: confBadge.text }]}>{confBadge.label}</Text>
            </View>
            {/* Free tuition */}
            {profile?.freeTuition ? (
              <View style={[s.badge, { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.25)' }]}>
                <Text style={[s.badgeTxt, { color: '#4ade80' }]}>Free Tuition</Text>
              </View>
            ) : null}
          </View>

          {/* Year established */}
          {profile?.yearEstablished ? (
            <Text style={{ fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: spacing.sm }}>
              Est. {profile.yearEstablished}
            </Text>
          ) : null}
        </Card>

        {/* ── Accreditation + CHED COE/COD ── */}
        {(profile?.accreditation || profile?.chedCoeCod) ? (
          <View style={s.section}>
            <SectionHeader title="Accreditation" />
            <Card elevated>
              {profile?.accreditation ? (
                <View style={s.row}>
                  <Text style={s.rowLabel}>Accreditation</Text>
                  <Text style={s.rowValue}>{profile.accreditation}</Text>
                </View>
              ) : null}
              {profile?.chedCoeCod ? (
                <View style={[s.row, { marginBottom: 0 }]}>
                  <Text style={s.rowLabel}>CHED COE/COD</Text>
                  <Text style={s.rowValue}>{profile.chedCoeCod}</Text>
                </View>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* ── Tuition ── */}
        {(profile?.tuitionFeeRange || profile?.freeTuition) ? (
          <View style={s.section}>
            <SectionHeader title="Tuition" />
            <Card elevated>
              {profile?.tuitionFeeRange ? (
                <View style={s.row}>
                  <Text style={s.rowLabel}>Fee Range</Text>
                  <Text style={s.rowValue}>{profile.tuitionFeeRange}</Text>
                </View>
              ) : null}
              {profile?.freeTuition ? (
                <View style={[s.row, { marginBottom: 0 }]}>
                  <Text style={s.rowLabel}>Free Tuition</Text>
                  <Text style={[s.rowValue, { color: '#4ade80' }]}>Yes</Text>
                </View>
              ) : null}
              {profile?.academicCalendar ? (
                <View style={[s.row, { marginBottom: 0 }]}>
                  <Text style={s.rowLabel}>Academic Calendar</Text>
                  <Text style={s.rowValue}>{profile.academicCalendar}</Text>
                </View>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* ── Entrance Exam ── */}
        {hasEntranceExam ? (
          <View style={s.section}>
            <SectionHeader title="Entrance Exam" />
            <Card elevated>
              {(profile?.entranceExamName || profile?.entranceExamAcronym) ? (
                <View style={s.row}>
                  <Text style={s.rowLabel}>Exam</Text>
                  <Text style={s.rowValue}>
                    {[profile?.entranceExamName, profile?.entranceExamAcronym ? `(${profile.entranceExamAcronym})` : null]
                      .filter(Boolean).join(' ')}
                  </Text>
                </View>
              ) : null}
              {profile?.examMonth ? (
                <View style={s.row}>
                  <Text style={s.rowLabel}>Exam Month</Text>
                  <Text style={s.rowValue}>{profile.examMonth}</Text>
                </View>
              ) : null}
              {profile?.examDifficulty != null ? (
                <View style={s.row}>
                  <Text style={s.rowLabel}>Difficulty</Text>
                  <View style={{ flex: 2, alignItems: 'flex-end' }}>
                    <StarDots
                      count={profile.examDifficulty}
                      max={5}
                      filledColor={t.accent}
                      emptyColor={t.divider}
                    />
                  </View>
                </View>
              ) : null}
              {profile?.testingCenterType ? (
                <View style={s.row}>
                  <Text style={s.rowLabel}>Testing Center</Text>
                  <Text style={s.rowValue}>{profile.testingCenterType}</Text>
                </View>
              ) : null}
              {(profile?.applicationOpen || profile?.applicationClose) ? (
                <View style={s.row}>
                  <Text style={s.rowLabel}>Application Window</Text>
                  <Text style={s.rowValue}>
                    {[profile?.applicationOpen, profile?.applicationClose].filter(Boolean).join(' – ')}
                  </Text>
                </View>
              ) : null}
              {profile?.estimatedSlots ? (
                <View style={s.row}>
                  <Text style={s.rowLabel}>Est. Slots</Text>
                  <Text style={s.rowValue}>{profile.estimatedSlots}</Text>
                </View>
              ) : null}
              {profile?.estimatedPassingRate ? (
                <View style={[s.row, { marginBottom: 0 }]}>
                  <Text style={s.rowLabel}>Est. Pass Rate</Text>
                  <Text style={s.rowValue}>{profile.estimatedPassingRate}</Text>
                </View>
              ) : null}

              {/* Focusable when the exam maps to a slug-backed listing (UPCAT, ACET, …) */}
              {examSlug ? (
                <>
                  <Pressable
                    style={({ pressed }) => [s.focusBtn, examInFocus ? s.focusOn : s.focusAdd, pressed && { opacity: 0.85 }]}
                    onPress={() => (examInFocus ? removeListing(examSlug) : addListing(examSlug))}
                    accessibilityRole="button"
                  >
                    <Text style={examInFocus ? s.focusOnTxt : s.focusAddTxt} maxFontSizeMultiplier={1.4}>
                      {examInFocus ? `✓ In Focus #${examFocusPriority} — Tap to remove` : '+ Add this exam to Focus'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.examLinkBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => router.push(`/listings/${examSlug}`)}
                    accessibilityRole="button"
                  >
                    <Text style={s.examLinkTxt} numberOfLines={1} maxFontSizeMultiplier={1.4}>View exam details & mock practice</Text>
                    <Text style={s.linkArrow}>›</Text>
                  </Pressable>
                </>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* ── Known For / Notable Programs ── */}
        {(knownForCourses.length > 0 || notablePrograms.length > 0) ? (
          <View style={s.section}>
            <SectionHeader title="Known For" />
            <View style={s.pillWrap}>
              {[...knownForCourses, ...notablePrograms].map((item, i) => (
                <View key={`known-${i}`} style={s.pill}>
                  <Text style={s.pillTxt}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Courses Offered ── */}
        {coursesOffered.length > 0 ? (
          <View style={s.section}>
            <SectionHeader title="Courses Offered" />
            <View style={s.pillWrap}>
              {coursesOffered.map((c, i) => (
                <View key={`course-${i}`} style={s.pill}>
                  <Text style={s.pillTxt}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Scholarships Offered ── */}
        {scholarships.length > 0 ? (
          <View style={s.section}>
            <SectionHeader title="Scholarships Offered" />
            <View style={s.pillWrap}>
              {scholarships.map((sch, i) => (
                <View key={`sch-${i}`} style={[s.pill, { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.20)' }]}>
                  <Text style={[s.pillTxt, { color: t.accentText }]}>{sch}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── PRC Strong Boards ── */}
        {prcStrongBoards.length > 0 ? (
          <View style={s.section}>
            <SectionHeader title="PRC Strong Boards" />
            <View style={s.pillWrap}>
              {prcStrongBoards.map((b, i) => (
                <View key={`prc-${i}`} style={s.pill}>
                  <Text style={s.pillTxt}>{b}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── PRC Top Courses ── */}
        {prcTopCourses.length > 0 ? (
          <View style={s.section}>
            <SectionHeader title="PRC Top Courses" />
            <View style={s.pillWrap}>
              {prcTopCourses.map((c, i) => (
                <View key={`prctop-${i}`} style={s.pill}>
                  <Text style={s.pillTxt}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── External Links ── */}
        {hasLinks ? (
          <View style={s.section}>
            <SectionHeader title="Links" />
            {profile?.websiteUrl ? (
              <Pressable
                style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.8 }]}
                onPress={() => profile.websiteUrl && Linking.openURL(profile.websiteUrl)}
                accessibilityRole="link"
              >
                <Text style={s.linkTxt} numberOfLines={1}>Official Website</Text>
                <Text style={s.linkArrow}>↗</Text>
              </Pressable>
            ) : null}
            {profile?.applicationPortalUrl ? (
              <Pressable
                style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.8 }]}
                onPress={() => profile.applicationPortalUrl && Linking.openURL(profile.applicationPortalUrl)}
                accessibilityRole="link"
              >
                <Text style={s.linkTxt} numberOfLines={1}>Application Portal</Text>
                <Text style={s.linkArrow}>↗</Text>
              </Pressable>
            ) : null}
            {profile?.facebookUrl ? (
              <Pressable
                style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.8 }]}
                onPress={() => profile.facebookUrl && Linking.openURL(profile.facebookUrl)}
                accessibilityRole="link"
              >
                <Text style={s.linkTxt} numberOfLines={1}>Facebook Page</Text>
                <Text style={s.linkArrow}>↗</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Notes ── */}
        {profile?.notes ? (
          <View style={s.section}>
            <SectionHeader title="Notes" />
            <Card elevated>
              <Text style={{ fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 }}>
                {profile.notes}
              </Text>
            </Card>
          </View>
        ) : null}

        {/* ── Disclaimer (LOW / VERY LOW / MEDIUM / null confidence) ── */}
        {showDisclaimer ? (
          <View style={s.disclaimer}>
            <Text style={s.disclaimerTxt}>
              Some details may be unconfirmed — verify on the official site before making decisions.
            </Text>
          </View>
        ) : null}
      </ScreenScroll>
    </SafeAreaView>
  )
}
