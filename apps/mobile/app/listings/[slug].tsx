import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, Pressable,
  Linking, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { listings as listingsTable, savedListings as savedListingsTable, resultWatches } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { RequirementsChecklist } from '../../components/RequirementsChecklist'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { AppButton } from '../../components/ui/AppButton'
import { spacing, radius } from '../../theme/tokens'
import { getSettings } from '../../services/settings'
import { matchScholarship } from '../../utils/scholarshipMatch'
import type { MatchResult, StudentProfile } from '../../utils/scholarshipMatch'

interface FullListing {
  id: string
  slug: string
  title: string
  type: string
  status: string
  examDate: number | null
  deadline: number | null
  region: string
  description: string
  requirements: string
  coverage: string
  provider: string
  externalUrl: string
  grantAmount: string
  resultsDate: number | null
  // scholarship-specific
  province: string | null
  city: string | null
  scope: string
  isVerified: boolean
  incomeCeiling: number | null
  gwaRequirement: number | null
  monthlyStipend: number | null
  serviceObligationYears: number | null
  hasEntranceExam: boolean
  applicationWindow: string | null
  scholarshipMeta: string
}

function fmtDate(ts: number | null | undefined): string {
  if (!ts) return 'TBA'
  return new Date(ts).toLocaleDateString('en-PH', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function daysUntil(ts: number | null | undefined): number | null {
  if (!ts) return null
  return Math.ceil((ts - Date.now()) / 86_400_000)
}

export default function ListingDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const [listing, setListing] = useState<FullListing | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acquiredCount, setAcquiredCount] = useState(0)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [watchingResults, setWatchingResults] = useState(false)
  const { isInFocus, getPriority, addListing, removeListing } = useFocusListings()
  const inFocus = isInFocus(slug)
  const focusPriority = getPriority(slug)
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topBarTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    saveBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    saveBtnIcon: { fontSize: 18, opacity: 0.35 },
    saveBtnIconSaved: { opacity: 1 },
    empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60 },
    hero: { marginTop: spacing.md, borderWidth: 1 },
    heroExam: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    heroScholar: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.22)' },
    heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
    typeIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    examIcon: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)' },
    scholarIcon: { backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
    heroTitle: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', lineHeight: 22, marginBottom: 2 },
    heroProvider: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    typeBadge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    examBadge: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    scholarBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.22)' },
    typeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    statusBadge: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    statusTxt: { fontSize: typo.xs, fontWeight: '700', color: '#fbbf24', fontFamily: 'Lexend_600SemiBold', textTransform: 'capitalize' },
    regionBadge: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    regionTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    countdownCard: { marginTop: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1 },
    countdownNormal: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.20)' },
    countdownUrgent: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.22)' },
    countdownNum: { fontSize: typo.h1, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -1 },
    countdownLabel: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    section: { marginTop: spacing.lg },
    datesGrid: { gap: spacing.sm },
    dateCard: { backgroundColor: t.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: t.border },
    dateLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    dateVal: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    bodyText: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    grantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.20)', borderRadius: radius.md, padding: spacing.md },
    grantLabel: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    grantVal: { fontSize: typo.lg, fontWeight: '700', color: '#4ade80', fontFamily: 'Outfit_700Bold' },
    linkBtn: { marginTop: spacing.md, borderWidth: 1, borderColor: t.divider, borderRadius: radius.lg, borderCurve: 'continuous', paddingVertical: spacing.md, alignItems: 'center' },
    linkBtnTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    focusRemoveBtn: {
      marginTop: spacing.md,
      backgroundColor: 'rgba(128,0,0,0.12)',
      borderWidth: 2,
      borderColor: '#831626',
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    focusRemoveTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: t.accentText },
    focusAddBtn: {
      marginTop: spacing.md,
      backgroundColor: 'rgba(128,0,0,0.82)',
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    focusAddTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: '#fff' },
    watchBtn: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: t.divider,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    watchBtnActive: {
      borderColor: 'rgba(34,197,94,0.35)',
      backgroundColor: 'rgba(34,197,94,0.08)',
    },
    watchBtnTxt: {
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_400Regular',
    },
    watchBtnTxtActive: {
      color: '#4ade80',
      fontFamily: 'Lexend_600SemiBold',
    },
    // --- scholarship enrichment styles ---
    matchBlock: { marginTop: spacing.md, borderWidth: 1 },
    matchEligible: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
    matchMaybe: { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' },
    matchIneligible: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.22)' },
    matchPillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
    matchPill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    matchPillEligible: { backgroundColor: 'rgba(34,197,94,0.18)' },
    matchPillMaybe: { backgroundColor: 'rgba(245,158,11,0.18)' },
    matchPillIneligible: { backgroundColor: 'rgba(239,68,68,0.18)' },
    matchPillTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    matchPillTxtEligible: { color: '#4ade80' },
    matchPillTxtMaybe: { color: '#fbbf24' },
    matchPillTxtIneligible: { color: '#f87171' },
    matchReason: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 17, marginTop: 2 },
    detailGrid: { gap: spacing.sm },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: t.surface, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: t.border },
    detailRowLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flex: 1 },
    detailRowVal: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', textAlign: 'right' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: spacing.xs },
    chipTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    serviceWarning: { marginTop: spacing.md, backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)', borderRadius: radius.md, padding: spacing.md },
    serviceWarningTxt: { fontSize: typo.sm, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 18 },
    cautionLine: { fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 17, marginTop: 3 },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    verifiedBadgePill: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, borderWidth: 1 },
    verifiedPillOn: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.25)' },
    verifiedPillOff: { backgroundColor: t.surface, borderColor: t.border },
    verifiedPillTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    verifiedNote: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flex: 1, lineHeight: 15 },
    otherBenefitLine: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19, marginTop: 2 },
  }), [t, typo])

  useEffect(() => {
    async function load() {
      const [listingRows, savedRows, watchRows, settings] = await Promise.all([
        db.select().from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        db.select({ id: savedListingsTable.id }).from(savedListingsTable),
        db.select({ slug: resultWatches.slug }).from(resultWatches).where(eq(resultWatches.slug, slug)).limit(1),
        getSettings(db),
      ])
      const l = listingRows[0] ?? null
      setListing(l as FullListing | null)
      if (l) setSaved(savedRows.some(s => s.id === l.id))
      setWatchingResults(watchRows.length > 0)

      if (l && l.type === 'scholarship') {
        let meta: Record<string, unknown> = {}
        try { meta = JSON.parse((l as FullListing).scholarshipMeta) } catch {}
        const hucExcluded = !!meta.huc_excluded
        const targetYearLevels: string[] = Array.isArray(meta.target_year_levels)
          ? (meta.target_year_levels as unknown[]).map(String)
          : []
        const matchInput = {
          scope: ((l as FullListing).scope ?? 'national') as 'national' | 'regional' | 'provincial' | 'city' | 'school',
          isVerified: (l as FullListing).isVerified ?? false,
          incomeCeiling: (l as FullListing).incomeCeiling ?? null,
          gwaRequirement: (l as FullListing).gwaRequirement ?? null,
          serviceObligationYears: (l as FullListing).serviceObligationYears ?? null,
          province: (l as FullListing).province ?? null,
          city: (l as FullListing).city ?? null,
          targetYearLevels,
          hucExcluded,
        }
        const studentProfile: StudentProfile = {
          gradeLevel: settings.gradeLevel ?? undefined,
          incomeBracket: settings.incomeBracket ?? undefined,
          gwa: settings.gwa ?? undefined,
          province: settings.province ?? null,
          city: settings.city ?? null,
        }
        setMatchResult(matchScholarship(matchInput, studentProfile))
      }

      setLoading(false)
    }
    void load()
  }, [db, slug])

  async function toggleSave() {
    if (!listing) return
    if (saved) {
      await db.delete(savedListingsTable).where(eq(savedListingsTable.id, listing.id))
      setSaved(false)
    } else {
      await db.insert(savedListingsTable).values({ id: listing.id, savedAt: Date.now() }).onConflictDoNothing()
      setSaved(true)
    }
  }

  async function toggleResultWatch() {
    if (!listing) return
    if (watchingResults) {
      await db.delete(resultWatches).where(eq(resultWatches.slug, listing.slug))
      setWatchingResults(false)
    } else {
      await db.insert(resultWatches).values({ slug: listing.slug, addedAt: Date.now() }).onConflictDoNothing()
      setWatchingResults(true)
    }
  }

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
        <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  if (!listing) {
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
        <Text style={s.empty}>Listing not found.</Text>
      </SafeAreaView>
    )
  }

  const isExam = listing.type === 'exam'
  const isScholarship = listing.type === 'scholarship'
  const keyDate = listing.examDate ?? listing.deadline
  const daysLeft = daysUntil(keyDate)
  let requirements: string[] = []
  try { requirements = JSON.parse(listing.requirements) } catch {}

  // Parse scholarshipMeta once for render
  let scholarshipMeta: Record<string, unknown> = {}
  if (isScholarship) {
    try { scholarshipMeta = JSON.parse(listing.scholarshipMeta) } catch {}
  }
  const otherBenefits: string[] = isScholarship && Array.isArray(scholarshipMeta.other_benefits)
    ? (scholarshipMeta.other_benefits as unknown[]).map(String)
    : []

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
        <Text style={s.topBarTitle} numberOfLines={1}>{listing.title}</Text>
        <Pressable
          onPress={toggleSave}
          style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.7 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
        >
          <Text style={[s.saveBtnIcon, saved && s.saveBtnIconSaved]}>🔖</Text>
        </Pressable>
      </View>

      <ScreenScroll tabBarInset={false}>

        {/* Hero card */}
        <Card elevated style={[s.hero, isExam ? s.heroExam : s.heroScholar]}>
          <View style={s.heroTop}>
            <View style={[s.typeIcon, isExam ? s.examIcon : s.scholarIcon]}>
              <Text style={{ fontSize: 22 }}>{isExam ? '📋' : '🎓'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>{listing.title}</Text>
              {listing.provider ? <Text style={s.heroProvider}>{listing.provider}</Text> : null}
            </View>
          </View>
          <View style={s.badgeRow}>
            <View style={[s.typeBadge, isExam ? s.examBadge : s.scholarBadge]}>
              <Text style={[s.typeTxt, { color: isExam ? t.accentText : '#4ade80' }]}>
                {isExam ? 'Exam' : 'Scholarship'}
              </Text>
            </View>
            {listing.status !== 'active' ? (
              <View style={s.statusBadge}>
                <Text style={s.statusTxt}>{listing.status}</Text>
              </View>
            ) : null}
            {listing.region ? (
              <View style={s.regionBadge}>
                <Text style={s.regionTxt}>📍 {listing.region}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/* Match status block — scholarships only, not 'unknown' */}
        {isScholarship && matchResult && matchResult.status !== 'unknown' ? (
          <Card
            elevated
            style={[
              s.matchBlock,
              matchResult.status === 'eligible' ? s.matchEligible
                : matchResult.status === 'maybe' ? s.matchMaybe
                : s.matchIneligible,
            ]}
          >
            <View style={s.matchPillRow}>
              <View style={[
                s.matchPill,
                matchResult.status === 'eligible' ? s.matchPillEligible
                  : matchResult.status === 'maybe' ? s.matchPillMaybe
                  : s.matchPillIneligible,
              ]}>
                <Text style={[
                  s.matchPillTxt,
                  matchResult.status === 'eligible' ? s.matchPillTxtEligible
                    : matchResult.status === 'maybe' ? s.matchPillTxtMaybe
                    : s.matchPillTxtIneligible,
                ]}>
                  {matchResult.status === 'eligible' ? '✓ Eligible'
                    : matchResult.status === 'maybe' ? 'Maybe'
                    : 'Not Eligible'}
                </Text>
              </View>
            </View>
            {matchResult.reasons.map((r, i) => (
              <Text key={i} style={s.matchReason}>• {r}</Text>
            ))}
            {matchResult.warnings.map((w, i) => (
              <Text key={`w${i}`} style={s.cautionLine}>⚠ {w}</Text>
            ))}
          </Card>
        ) : null}

        {/* Service obligation warning banner */}
        {isScholarship && (listing.serviceObligationYears ?? 0) > 0 ? (
          <View style={s.serviceWarning}>
            <Text style={s.serviceWarningTxt}>
              ⚠️ Requires {listing.serviceObligationYears} year{listing.serviceObligationYears === 1 ? '' : 's'} of service after graduation.
            </Text>
          </View>
        ) : null}

        {/* Days countdown */}
        {daysLeft !== null && daysLeft > 0 ? (
          <Card
            elevated
            style={[s.countdownCard, daysLeft < 30 ? s.countdownUrgent : s.countdownNormal]}
          >
            <Text style={[s.countdownNum, { color: daysLeft < 30 ? t.accentText : '#4ade80' }]}>{daysLeft}</Text>
            <Text style={s.countdownLabel}>days until {isExam ? 'exam' : 'deadline'}</Text>
          </Card>
        ) : null}

        {/* Key dates */}
        <View style={s.section}>
          <SectionHeader title="Key Dates" />
          <Card elevated>
            <View style={s.datesGrid}>
              {listing.examDate ? (
                <View style={s.dateCard}>
                  <Text style={s.dateLabel}>Exam Date</Text>
                  <Text style={s.dateVal}>{fmtDate(listing.examDate)}</Text>
                </View>
              ) : null}
              {listing.deadline ? (
                <View style={s.dateCard}>
                  <Text style={s.dateLabel}>Application Deadline</Text>
                  <Text style={s.dateVal}>{fmtDate(listing.deadline)}</Text>
                </View>
              ) : null}
              {!listing.examDate && !listing.deadline ? (
                <Text style={s.bodyText}>Dates to be announced.</Text>
              ) : null}
            </View>
          </Card>
        </View>

        {/* About */}
        {listing.description ? (
          <View style={s.section}>
            <SectionHeader title="About" />
            <Card elevated>
              <Text style={s.bodyText}>{listing.description}</Text>
            </Card>
          </View>
        ) : null}

        {/* Scholarship detail rows */}
        {isScholarship ? (
          <View style={s.section}>
            <SectionHeader title="Scholarship Details" />
            <Card elevated>
              <View style={s.detailGrid}>
                {listing.incomeCeiling != null ? (
                  <View style={s.detailRow}>
                    <Text style={s.detailRowLabel}>Income Ceiling</Text>
                    <Text style={s.detailRowVal}>₱{listing.incomeCeiling.toLocaleString()}/yr</Text>
                  </View>
                ) : null}
                {listing.gwaRequirement != null ? (
                  <View style={s.detailRow}>
                    <Text style={s.detailRowLabel}>Minimum GWA</Text>
                    <Text style={s.detailRowVal}>{listing.gwaRequirement}%</Text>
                  </View>
                ) : null}
                {listing.monthlyStipend != null ? (
                  <View style={s.detailRow}>
                    <Text style={s.detailRowLabel}>Monthly Stipend</Text>
                    <Text style={[s.detailRowVal, { color: '#4ade80' }]}>₱{listing.monthlyStipend.toLocaleString()}/mo</Text>
                  </View>
                ) : null}
                {listing.applicationWindow ? (
                  <View style={s.detailRow}>
                    <Text style={s.detailRowLabel}>Application Window</Text>
                    <Text style={s.detailRowVal}>{listing.applicationWindow}</Text>
                  </View>
                ) : null}
              </View>
              {/* Scope / region / province chips */}
              {(listing.scope || listing.province || listing.city) ? (
                <View style={[s.chipRow, { marginTop: spacing.sm }]}>
                  {listing.scope ? (
                    <View style={s.chip}>
                      <Text style={s.chipTxt}>{listing.scope.charAt(0).toUpperCase() + listing.scope.slice(1)}</Text>
                    </View>
                  ) : null}
                  {listing.province ? (
                    <View style={s.chip}>
                      <Text style={s.chipTxt}>📍 {listing.province}</Text>
                    </View>
                  ) : null}
                  {listing.city ? (
                    <View style={s.chip}>
                      <Text style={s.chipTxt}>🏙 {listing.city}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* Benefits / Coverage */}
        {(listing.coverage || listing.grantAmount || otherBenefits.length > 0) ? (
          <View style={s.section}>
            <SectionHeader title={isExam ? 'Coverage' : 'Benefits'} />
            <Card elevated>
              {listing.grantAmount ? (
                <View style={s.grantRow}>
                  <Text style={s.grantLabel}>Grant Amount</Text>
                  <Text style={s.grantVal}>₱{listing.grantAmount}</Text>
                </View>
              ) : null}
              {listing.coverage ? <Text style={[s.bodyText, { marginTop: spacing.xs }]}>{listing.coverage}</Text> : null}
              {otherBenefits.map((b, i) => (
                <Text key={b} style={[s.otherBenefitLine, { marginTop: i === 0 ? spacing.xs : 2 }]}>• {b}</Text>
              ))}
            </Card>
          </View>
        ) : null}

        {/* Requirements */}
        {requirements.length > 0 ? (
          <View style={s.section}>
            <SectionHeader title={`Requirements (${acquiredCount}/${requirements.length})`} />
            <RequirementsChecklist
              listingSlug={slug}
              requirements={requirements}
              onAcquiredCountChange={(a) => setAcquiredCount(a)}
            />
          </View>
        ) : null}

        {/* Focus CTA */}
        {inFocus ? (
          <Pressable
            style={({ pressed }) => [s.focusRemoveBtn, pressed && { opacity: 0.8 }]}
            onPress={() => removeListing(slug)}
            accessibilityRole="button"
          >
            <Text style={s.focusRemoveTxt}>
              ✓ In Focus #{focusPriority} — Tap to Remove
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [s.focusAddBtn, pressed && { opacity: 0.8 }]}
            onPress={() => addListing(slug)}
            accessibilityRole="button"
          >
            <Text style={s.focusAddTxt}>
              + Add to Focus
            </Text>
          </Pressable>
        )}

        {/* Watch results toggle — exams only */}
        {isExam ? (
          <Pressable
            style={({ pressed }) => [s.watchBtn, watchingResults && s.watchBtnActive, pressed && { opacity: 0.8 }]}
            onPress={toggleResultWatch}
            accessibilityRole="button"
            accessibilityLabel={watchingResults ? 'Stop watching results' : 'Watch results'}
          >
            <Text style={[s.watchBtnTxt, watchingResults && s.watchBtnTxtActive]}>
              {watchingResults ? '✓ Watching results' : '🔔 Watch results'}
            </Text>
          </Pressable>
        ) : null}

        {/* Start practice CTA — exams only */}
        {!isScholarship ? (
          <View style={{ marginTop: spacing.md }}>
            <AppButton
              label="⚡ Start Practicing for this Exam"
              onPress={() => router.push('/(tabs)/practice')}
            />
          </View>
        ) : null}

        {/* Official website (scholarships always show if present; exams too) */}
        {isScholarship ? (
          <View style={{ marginTop: spacing.md }}>
            {/* Verified badge + note */}
            <View style={s.verifiedBadge}>
              <View style={[s.verifiedBadgePill, listing.isVerified ? s.verifiedPillOn : s.verifiedPillOff]}>
                <Text style={[s.verifiedPillTxt, { color: listing.isVerified ? '#4ade80' : t.textTertiary }]}>
                  {listing.isVerified ? '✓ Verified' : 'Unverified'}
                </Text>
              </View>
              <Text style={s.verifiedNote}>Details change yearly — verify on the official site.</Text>
            </View>
            {listing.externalUrl ? (
              <Pressable
                style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.8 }]}
                onPress={() => listing.externalUrl && Linking.openURL(listing.externalUrl)}
                accessibilityRole="button"
              >
                <Text style={s.linkBtnTxt}>Official Website ↗</Text>
              </Pressable>
            ) : null}
          </View>
        ) : listing.externalUrl ? (
          <Pressable
            style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.8 }]}
            onPress={() => listing.externalUrl && Linking.openURL(listing.externalUrl)}
            accessibilityRole="button"
          >
            <Text style={s.linkBtnTxt}>Official Website ↗</Text>
          </Pressable>
        ) : null}

      </ScreenScroll>
    </SafeAreaView>
  )
}
