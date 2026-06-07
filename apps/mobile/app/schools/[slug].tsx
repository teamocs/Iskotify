import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Linking, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { tertiarySchools as schoolsTable, universityProfiles as profilesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'

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

function confidenceBadgeStyle(level: ConfidenceLevel): { bg: string; border: string; text: string; label: string } {
  switch ((level ?? '').toUpperCase()) {
    case 'HIGH':
      return { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.30)', text: '#4ade80', label: 'HIGH confidence' }
    case 'MEDIUM':
      return { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.30)', text: '#fbbf24', label: 'MEDIUM confidence' }
    case 'LOW':
      return { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.38)', label: 'LOW confidence' }
    case 'VERY LOW':
      return { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.38)', label: 'VERY LOW confidence' }
    default:
      return { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', text: 'rgba(255,255,255,0.30)', label: 'Unverified' }
  }
}

function shouldShowDisclaimer(level: ConfidenceLevel): boolean {
  const lvl = (level ?? '').toUpperCase()
  return lvl !== 'HIGH'
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
    topBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
    backBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    backArrow:     { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:      { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    scroll:        { paddingBottom: 40 },
    // Hero
    hero:          { marginHorizontal: 14, borderRadius: 18, padding: 16, marginBottom: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
    heroName:      { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    heroAcronym:   { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: 6 },
    heroLocation:  { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 17, marginBottom: 8 },
    badgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    badge:         { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
    badgeTxt:      { fontSize: typo.xs, fontFamily: 'Lexend_400Regular' },
    // Section
    section:       { marginHorizontal: 14, marginBottom: 16 },
    sectionTitle:  { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.9, fontFamily: 'Lexend_600SemiBold', marginBottom: 10 },
    infoCard:      { backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, padding: 14 },
    row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    rowLabel:      { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flex: 1 },
    rowValue:      { fontSize: typo.xs, color: t.textPrimary, fontFamily: 'Lexend_400Regular', flex: 2, textAlign: 'right' },
    // Chips / pills
    pillWrap:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    pill:          { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider },
    pillTxt:       { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    // Link buttons
    linkBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, marginBottom: 8 },
    linkTxt:       { flex: 1, fontSize: typo.sm, color: t.accent, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
    linkArrow:     { fontSize: typo.sm, color: t.textTertiary },
    // Disclaimer
    disclaimer:    { marginHorizontal: 14, marginBottom: 16, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: 12, padding: 12 },
    disclaimerTxt: { fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 17 },
    // Empty/error
    empty:         { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60, fontSize: typo.sm },
  }), [t, typo])

  // ── Loading ──────────────────────────────────────────────────────────────────

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

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (!school) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.empty}>School not found.</Text>
      </SafeAreaView>
    )
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const confidence = (profile?.dataConfidence?.toUpperCase() ?? null) as ConfidenceLevel
  const confBadge  = confidenceBadgeStyle(confidence)
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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>{school.acronym ?? school.name}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={s.hero}>
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
            <Text style={{ fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 8 }}>
              Est. {profile.yearEstablished}
            </Text>
          ) : null}
        </View>

        {/* ── Accreditation + CHED COE/COD ── */}
        {(profile?.accreditation || profile?.chedCoeCod) ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Accreditation</Text>
            <View style={s.infoCard}>
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
            </View>
          </View>
        ) : null}

        {/* ── Tuition ── */}
        {(profile?.tuitionFeeRange || profile?.freeTuition) ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Tuition</Text>
            <View style={s.infoCard}>
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
            </View>
          </View>
        ) : null}

        {/* ── Entrance Exam ── */}
        {hasEntranceExam ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Entrance Exam</Text>
            <View style={s.infoCard}>
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
            </View>
          </View>
        ) : null}

        {/* ── Known For / Notable Programs ── */}
        {(knownForCourses.length > 0 || notablePrograms.length > 0) ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Known For</Text>
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
            <Text style={s.sectionTitle}>Courses Offered</Text>
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
            <Text style={s.sectionTitle}>Scholarships Offered</Text>
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
            <Text style={s.sectionTitle}>PRC Strong Boards</Text>
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
            <Text style={s.sectionTitle}>PRC Top Courses</Text>
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
            <Text style={s.sectionTitle}>Links</Text>
            {profile?.websiteUrl ? (
              <TouchableOpacity
                style={s.linkBtn}
                onPress={() => profile.websiteUrl && Linking.openURL(profile.websiteUrl)}
                activeOpacity={0.8}
              >
                <Text style={s.linkTxt} numberOfLines={1}>Official Website</Text>
                <Text style={s.linkArrow}>↗</Text>
              </TouchableOpacity>
            ) : null}
            {profile?.applicationPortalUrl ? (
              <TouchableOpacity
                style={s.linkBtn}
                onPress={() => profile.applicationPortalUrl && Linking.openURL(profile.applicationPortalUrl)}
                activeOpacity={0.8}
              >
                <Text style={s.linkTxt} numberOfLines={1}>Application Portal</Text>
                <Text style={s.linkArrow}>↗</Text>
              </TouchableOpacity>
            ) : null}
            {profile?.facebookUrl ? (
              <TouchableOpacity
                style={s.linkBtn}
                onPress={() => profile.facebookUrl && Linking.openURL(profile.facebookUrl)}
                activeOpacity={0.8}
              >
                <Text style={s.linkTxt} numberOfLines={1}>Facebook Page</Text>
                <Text style={s.linkArrow}>↗</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ── Notes ── */}
        {profile?.notes ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Notes</Text>
            <View style={s.infoCard}>
              <Text style={{ fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 17 }}>
                {profile.notes}
              </Text>
            </View>
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

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
