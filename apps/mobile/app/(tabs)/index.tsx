import { useState, useEffect, useMemo, useCallback } from 'react'
import { StyleSheet, View, Text, Modal, Switch, Platform, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Gear1Outlined, Bell1Outlined, Bell1Solid, User4Outlined } from '@lineiconshq/free-icons'
// logo.svg has no viewBox attribute (2048×2048 canvas) — pass viewBox explicitly at the call site so it scales.
import Logo from '../../assets/images/logo.svg'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { WebRefreshButton } from '../../components/ui/WebRefreshButton'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { FocusExamsFold } from '../../components/home/FocusExamsFold'
import { SubjectPreparednessGrid } from '../../components/home/SubjectPreparednessGrid'
import { RecommendedScholarships } from '../../components/home/RecommendedScholarships'
import { NewsAndDates } from '../../components/home/NewsAndDates'
import { spacing, radius } from '../../theme/tokens'
import { useHomeStats } from '../../hooks/useHomeStats'
import { usePracticeData } from '../../hooks/usePracticeData'
import { useFocusListings } from '../../hooks/useFocusListings'
import { useHomeCatalog } from '../../hooks/useHomeCatalog'
import { useNotifications } from '../../hooks/useNotifications'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { useSyncStatus } from '../../hooks/useSyncStatus'
import { cachedQuery, invalidate } from '../../services/queryCache'
import { syncOnLaunch } from '../../services/sync'
import { getTopicBestSessionPercentages, getSubjectSessionPercentages } from '../../services/homeAggregates'
import { admissionsUpdates as admissionsUpdatesTable } from '../../db/schema'
import type { FeedItem } from '../../utils/admissionsFeed'

function phHour(): number {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + 8 * 3_600_000).getHours()
}

function timeGreeting(): string {
  const h = phHour()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Hoisted: building an Intl formatter is slow — do it once per JS load.
const HEADER_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

function headerDate(): string {
  return HEADER_DATE_FORMAT.format(new Date()).toUpperCase()
}

// Explore quick-links — each deep-links into one of the Lists screen's 4 tabs.
const EXPLORE_LINKS = [
  { emoji: '🎓', label: 'Universities', tab: 'universities' },
  { emoji: '🏅', label: 'Scholarships', tab: 'scholarships' },
  { emoji: '📈', label: 'Courses', tab: 'courses' },
  { emoji: '🌏', label: 'Destinations', tab: 'destinations' },
] as const

const NOTIF_TYPES = [
  { icon: '📚', title: 'Daily Practice Reminder', sub: 'Every day at 9:00 AM' },
  { icon: '🎯', title: 'Weekly Weak Areas Nudge', sub: 'Every Sunday at 10:00 AM' },
  { icon: '📌', title: 'Exam Countdown Alerts', sub: '7 days, 3 days, and 1 day before' },
]

function NotificationModal({
  visible,
  enabled,
  onToggle,
  onClose,
}: {
  visible: boolean
  enabled: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const { theme: t, typo } = useTheme()
  const insets = useSafeAreaInsets()
  const nm = useMemo(() => StyleSheet.create({
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: Math.max(32, insets.bottom + 16), paddingTop: 12 },
    handle: { width: 36, height: 4, backgroundColor: t.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    title: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    closeX: { fontSize: typo.md, color: t.textTertiary, padding: 4 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14, marginBottom: 20, gap: 12 },
    toggleLabel: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    toggleSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    sectionLabel: { fontSize: typo.sm, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
    typeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle },
    typeRowDisabled: { opacity: 0.38 },
    typeIcon: { fontSize: 20, width: 28, textAlign: 'center' },
    typeTitle: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', marginBottom: 2 },
    typeSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    hint: { marginTop: 16, fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 16 },
  }), [t, typo, insets])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={nm.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={nm.sheet}>
        {/* Handle */}
        <View style={nm.handle} />

        {/* Header */}
        <View style={nm.header}>
          <Text style={nm.title}>Notifications</Text>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Text style={nm.closeX}>✕</Text>
          </Pressable>
        </View>

        {/* Main toggle row */}
        <View style={nm.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={nm.toggleLabel}>Push Notifications</Text>
            <Text style={nm.toggleSub}>
              {enabled ? 'Notifications are on' : 'Notifications are off'}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={onToggle}
            trackColor={{ false: t.border, true: 'rgba(252,165,165,0.55)' }}
            thumbColor={enabled ? t.accentText : t.textTertiary}
            ios_backgroundColor={t.border}
          />
        </View>

        {/* Notification types */}
        <Text style={nm.sectionLabel}>What you'll receive</Text>
        {NOTIF_TYPES.map((n) => (
          <View
            key={n.title}
            style={[nm.typeRow, !enabled && nm.typeRowDisabled]}
          >
            <Text style={nm.typeIcon}>{n.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={nm.typeTitle}>{n.title}</Text>
              <Text style={nm.typeSub}>{n.sub}</Text>
            </View>
          </View>
        ))}

        {Platform.OS === 'android' && (
          <Text style={nm.hint}>
            Notifications require a development build to work on Android.
          </Text>
        )}
      </View>
    </Modal>
  )
}

export default function HomeScreen() {
  const { fullName, focusedListings, noteReminders, listingAccuracy, refresh } = useHomeStats()
  const { subjects, topicRows } = usePracticeData()
  const { addListing } = useFocusListings()
  const catalog = useHomeCatalog()
  const db = useDb()

  // ── Admissions feed ─────────────────────────────────────────────────────────
  const [admissionItems, setAdmissionItems] = useState<FeedItem[]>([])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await db.select().from(admissionsUpdatesTable)
        if (!cancelled) {
          setAdmissionItems(rows.map(r => ({
            id: r.id,
            reportDate: r.reportDate ?? '',
            severity: r.severity,
            title: r.title,
            body: r.body,
            eventDate: r.eventDate ?? null,
            eventType: r.eventType ?? null,
            schoolSlug: r.schoolSlug ?? null,
            schoolName: r.schoolName ?? null,
            actionRequired: r.actionRequired ?? null,
            sources: r.sources,
          })))
        }
      } catch (e) {
        console.warn('[home/admissions] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [db])

  // ── Session readiness maps (SESSION-based subject preparedness %) ────────────
  // Per-topic review bests + subject-level mock bests (subtest == subject name).
  // Cached so re-rendering the Home screen is cheap; refreshed alongside refresh().
  const [sessionReadiness, setSessionReadiness] = useState<{
    perTopicBest: Map<string, number>
    subjectBest: Map<string, number>
  }>(() => ({ perTopicBest: new Map(), subjectBest: new Map() }))
  // Bumped by onRefresh (after invalidating the cache) to force a fresh re-fetch.
  const [sessionReloadKey, setSessionReloadKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await cachedQuery('home:sessionReadiness', 30_000, async () => {
          const [topicBest, subjectBest] = await Promise.all([
            getTopicBestSessionPercentages(db),
            getSubjectSessionPercentages(db),
          ])
          return { topicBest, subjectBest }
        })
        if (!cancelled) {
          setSessionReadiness({
            perTopicBest: new Map(data.topicBest.map(r => [r.topicId, r.bestPct])),
            subjectBest: new Map(data.subjectBest.map(r => [r.subject, r.bestPct])),
          })
        }
      } catch (e) {
        console.warn('[home/sessionReadiness] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [db, sessionReloadKey])

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    // Drop the cached session-readiness + catalog and re-trigger a fresh fetch.
    invalidate('home:sessionReadiness')
    invalidate('home:catalog')
    setSessionReloadKey(k => k + 1)
    try { await Promise.all([refresh(), catalog.refresh()]) } finally { setRefreshing(false) }
  }, [refresh, catalog.refresh])

  // Web-only refresh: full sync then invalidate + re-load, separate from the
  // native pull-to-refresh onRefresh which does NOT call syncOnLaunch.
  // (Mirrors the Exams tab's webRefresh — RefreshControl is dead on web.)
  const sync = useSyncStatus()
  const webRefresh = useCallback(async () => {
    if (refreshing || sync.isSyncing) return
    setRefreshing(true)
    try {
      await syncOnLaunch(db)
      invalidate('home:sessionReadiness')
      invalidate('home:catalog')
      setSessionReloadKey(k => k + 1)
      await Promise.all([refresh(), catalog.refresh()])
    } catch (e) {
      console.warn('[home] webRefresh error:', e)
    } finally {
      setRefreshing(false)
    }
  }, [db, refresh, refreshing, sync.isSyncing, catalog.refresh])

  const { enabled: notifEnabled, schedule: scheduleNotifs, toggle: toggleNotifs } = useNotifications()
  const [showNotifModal, setShowNotifModal] = useState(false)

  useEffect(() => {
    if (focusedListings.length > 0) {
      void scheduleNotifs(focusedListings)
    }
  }, [focusedListings, scheduleNotifs])

  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    root:  { flex: 1, backgroundColor: t.bg },
    // Header row: logo tile (left) + action tiles (right), all the same treatment
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.lg },
    iconBtn: { width: 46, height: 46, backgroundColor: t.surface2, borderRadius: radius.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    headerBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    logoClip: { width: 28, height: 28, borderRadius: 8, borderCurve: 'continuous', overflow: 'hidden' },
    // Date + greeting block
    dateLine: { fontSize: typo.xs, letterSpacing: 1.2, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold', marginBottom: spacing.xs },
    greeting: { fontSize: 28, color: t.textPrimary, fontFamily: 'Outfit_400Regular', letterSpacing: -0.3 },
    greetingName: { fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    section: { marginTop: spacing.xl },
    // Explore quick-links grid (2×2)
    exploreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    exploreCard: {
      flexBasis: '48%',
      flexGrow: 1,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
    },
    exploreEmoji: { fontSize: 16 },
    exploreLabel: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <ScreenScroll
        tabBarInset
        padded
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.accent}
            colors={[t.accent]}
            progressBackgroundColor={t.surface}
          />
        }
      >

        {/* (1) Header row: logo tile + action tiles */}
        <View style={s.headerRow}>
          <View style={s.iconBtn}>
            <View style={s.logoClip}>
              <Logo width={28} height={28} viewBox="0 0 2048 2048" />
            </View>
          </View>
          <View style={s.headerBtns}>
            <WebRefreshButton onRefresh={webRefresh} refreshing={refreshing} />
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setShowNotifModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Lineicons
                icon={notifEnabled ? Bell1Solid : Bell1Outlined}
                size={20}
                color={notifEnabled ? t.accentText : t.textTertiary}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/(tabs)/profile')}
              accessibilityRole="button"
              accessibilityLabel="Profile"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Lineicons icon={User4Outlined} size={20} color={t.textSecondary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Lineicons icon={Gear1Outlined} size={20} color={t.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* (1b) Date + greeting */}
        <Text style={s.dateLine} maxFontSizeMultiplier={1.4}>{headerDate()}</Text>
        <Text style={s.greeting} maxFontSizeMultiplier={1.2}>
          {timeGreeting()}, <Text style={s.greetingName}>{fullName.split(' ')[0] || 'Student'}</Text>!
        </Text>

        <View>

          {/* (2) My Entrance Exams — top fold */}
          <FocusExamsFold
            focusedListings={focusedListings}
            examListings={catalog.examListings}
            blueprintSlugs={catalog.blueprintSlugs}
            blueprintInfo={catalog.blueprintInfo}
            listingMockBest={catalog.listingMockBest}
            listingAccuracy={listingAccuracy}
            onAddListing={addListing}
          />

          {/* (3) Subject preparedness — 2×3 grid */}
          <SubjectPreparednessGrid
            subjects={subjects}
            topicRows={topicRows}
            perTopicBestById={sessionReadiness.perTopicBest}
            subjectBestByName={sessionReadiness.subjectBest}
          />

          {/* (4) Explore — discovery quick-links into the Lists screen's tabs */}
          <View style={s.section}>
            <SectionHeader
              title="Explore"
              subtitle="Search or browse university exams, scholarships & in-demand courses"
            />
          </View>
          <View style={s.exploreGrid}>
            {EXPLORE_LINKS.map(({ emoji, label, tab }) => (
              <Pressable
                key={tab}
                style={({ pressed }) => [s.exploreCard, pressed && { opacity: 0.75 }]}
                onPress={() => router.push(`/(tabs)/listings?tab=${tab}`)}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                <Text style={s.exploreEmoji} maxFontSizeMultiplier={1.4}>{emoji}</Text>
                <Text style={s.exploreLabel} maxFontSizeMultiplier={1.4}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {/* (5) Recommended Scholarships — ranked + eligibility */}
          <RecommendedScholarships
            scholarships={catalog.scholarshipListings}
            profile={catalog.profile}
            clusters={catalog.clusters}
            region={catalog.region}
            focusedListings={focusedListings}
          />

          {/* (6) News & Dates — merged feed (dates lead, news fills remaining slots) */}
          <NewsAndDates
            focusedListings={focusedListings}
            noteReminders={noteReminders}
            admissionItems={admissionItems}
            hasAnyFocus={focusedListings.length > 0}
          />

        </View>
      </ScreenScroll>

      <NotificationModal
        visible={showNotifModal}
        enabled={notifEnabled}
        onToggle={() => void toggleNotifs(focusedListings)}
        onClose={() => setShowNotifModal(false)}
      />

    </SafeAreaView>
  )
}
