import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Linking, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { listings as listingsTable, savedListings as savedListingsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { RequirementsChecklist } from '../../components/RequirementsChecklist'

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
  const { isInFocus, getPriority, addListing, removeListing } = useFocusListings()
  const inFocus = isInFocus(slug)
  const focusPriority = getPriority(slug)
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topBarTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    saveBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    saveBtnIcon: { fontSize: 18, opacity: 0.35 },
    saveBtnIconSaved: { opacity: 1 },
    empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60 },
    scroll: { paddingBottom: 24 },
    hero: { marginHorizontal: 14, borderRadius: 22, padding: 16, marginBottom: 10, borderWidth: 1 },
    heroExam: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    heroScholar: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.22)' },
    heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    typeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    examIcon: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)' },
    scholarIcon: { backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
    heroTitle: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', lineHeight: 22, marginBottom: 2 },
    heroProvider: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    typeBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    examBadge: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    scholarBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.22)' },
    typeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    statusBadge: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusTxt: { fontSize: typo.xs, fontWeight: '700', color: '#fbbf24', fontFamily: 'Lexend_600SemiBold', textTransform: 'capitalize' },
    regionBadge: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    regionTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    countdownCard: { marginHorizontal: 14, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, borderWidth: 1 },
    countdownNormal: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.20)' },
    countdownUrgent: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.22)' },
    countdownNum: { fontSize: typo.h1, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -1 },
    countdownLabel: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    section: { marginHorizontal: 14, marginBottom: 14 },
    sectionTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', marginBottom: 10 },
    datesGrid: { gap: 8 },
    dateCard: { backgroundColor: t.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: t.border },
    dateLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    dateVal: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    bodyText: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    grantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.20)', borderRadius: 14, padding: 12 },
    grantLabel: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    grantVal: { fontSize: typo.lg, fontWeight: '700', color: '#4ade80', fontFamily: 'Outfit_700Bold' },
    reqRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    reqBullet: { color: t.textTertiary, fontSize: typo.sm, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    reqText: { flex: 1, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
    practiceBtn: { marginHorizontal: 14, backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
    practiceBtnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    linkBtn: { marginHorizontal: 14, borderWidth: 1, borderColor: t.divider, borderRadius: 18, paddingVertical: 12, alignItems: 'center' },
    linkBtnTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    focusRemoveBtn: { backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 2, borderColor: '#831626', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
    focusRemoveTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: '#fca5a5' },
    focusAddBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
    focusAddTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: '#fff' },
  }), [t, typo])

  useEffect(() => {
    async function load() {
      const [listingRows, savedRows] = await Promise.all([
        db.select().from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        db.select({ id: savedListingsTable.id }).from(savedListingsTable),
      ])
      const l = listingRows[0] ?? null
      setListing(l)
      if (l) setSaved(savedRows.some(s => s.id === l.id))
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

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
        </View>
        <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  if (!listing) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.empty}>Listing not found.</Text>
      </SafeAreaView>
    )
  }

  const isExam = listing.type === 'exam'
  const keyDate = listing.examDate ?? listing.deadline
  const daysLeft = daysUntil(keyDate)
  let requirements: string[] = []
  try { requirements = JSON.parse(listing.requirements) } catch {}

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topBarTitle} numberOfLines={1}>{listing.title}</Text>
        <TouchableOpacity onPress={toggleSave} style={s.saveBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[s.saveBtnIcon, saved && s.saveBtnIconSaved]}>🔖</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero card */}
        <View style={[s.hero, isExam ? s.heroExam : s.heroScholar]}>
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
              <Text style={[s.typeTxt, { color: isExam ? '#fca5a5' : '#4ade80' }]}>
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
        </View>

        {/* Days countdown */}
        {daysLeft !== null && daysLeft > 0 ? (
          <View style={[s.countdownCard, daysLeft < 30 ? s.countdownUrgent : s.countdownNormal]}>
            <Text style={[s.countdownNum, { color: daysLeft < 30 ? '#fca5a5' : '#4ade80' }]}>{daysLeft}</Text>
            <Text style={s.countdownLabel}>days until {isExam ? 'exam' : 'deadline'}</Text>
          </View>
        ) : null}

        {/* Key dates */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Key Dates</Text>
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
        </View>

        {/* About */}
        {listing.description ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>About</Text>
            <Text style={s.bodyText}>{listing.description}</Text>
          </View>
        ) : null}

        {/* Benefits / Coverage */}
        {(listing.coverage || listing.grantAmount) ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{isExam ? 'Coverage' : 'Benefits'}</Text>
            {listing.grantAmount ? (
              <View style={s.grantRow}>
                <Text style={s.grantLabel}>Grant Amount</Text>
                <Text style={s.grantVal}>₱{listing.grantAmount}</Text>
              </View>
            ) : null}
            {listing.coverage ? <Text style={[s.bodyText, { marginTop: 6 }]}>{listing.coverage}</Text> : null}
          </View>
        ) : null}

        {/* Requirements */}
        {requirements.length > 0 ? (
          <View style={s.section}>
            <RequirementsChecklist
              listingSlug={slug}
              requirements={requirements}
            />
          </View>
        ) : null}

        {/* Focus CTA */}
        {inFocus ? (
          <TouchableOpacity
            style={s.focusRemoveBtn}
            onPress={() => removeListing(slug)}
            activeOpacity={0.8}
          >
            <Text style={s.focusRemoveTxt}>
              ✓ In Focus #{focusPriority} — Tap to Remove
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.focusAddBtn}
            onPress={() => addListing(slug)}
            activeOpacity={0.8}
          >
            <Text style={s.focusAddTxt}>
              + Add to Focus
            </Text>
          </TouchableOpacity>
        )}

        {/* Start practice CTA */}
        <TouchableOpacity
          style={s.practiceBtn}
          onPress={() => router.push('/(tabs)/practice')}
        >
          <Text style={s.practiceBtnTxt}>⚡ Start Practicing for this Exam</Text>
        </TouchableOpacity>

        {/* Official website */}
        {listing.externalUrl ? (
          <TouchableOpacity
            style={s.linkBtn}
            onPress={() => listing.externalUrl && Linking.openURL(listing.externalUrl)}
          >
            <Text style={s.linkBtnTxt}>Official Website ↗</Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

