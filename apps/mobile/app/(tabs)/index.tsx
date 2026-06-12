import { useState, useEffect, useMemo, useCallback } from 'react'
import { StyleSheet, View, Text, Modal, Switch, Platform, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Gear1Outlined, Bolt2Outlined, Bell1Outlined, Bell1Solid, User4Outlined } from '@lineiconshq/free-icons'
// logo.svg has no viewBox attribute (2048×2048 canvas) — pass viewBox explicitly at the call site so it scales.
import Logo from '../../assets/images/logo.svg'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { KuyaHeroAnimation } from '../../components/KuyaHeroAnimation'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { ListCard } from '../../components/ui/ListCard'
import { InfoBanner } from '../../components/ui/InfoBanner'
import { spacing, radius } from '../../theme/tokens'
import { useHomeStats } from '../../hooks/useHomeStats'
import { useNotifications } from '../../hooks/useNotifications'
import { useAiCoach } from '../../hooks/useAiCoach'
import { useTheme } from '../../theme/ThemeContext'
import { useKuyaChatModal } from '../../providers/KuyaChatProvider'
import { useDb } from '../../hooks/useDb'
import { admissionsUpdates as admissionsUpdatesTable } from '../../db/schema'
import { upcomingEvents } from '../../utils/admissionsFeed'
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

// Hero mascot display size (kuya-baw-hero.json is 320×272; 149 ≈ 175 × 272/320).
// The speech bubble's left offset derives from MASCOT_W — keep them in sync.
const MASCOT_W = 175
const MASCOT_H = 149

function headerDate(): string {
  return HEADER_DATE_FORMAT.format(new Date()).toUpperCase()
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function msToDays(ms: number): number {
  return Math.ceil((ms - Date.now()) / 86_400_000)
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
  const { streakDays, weakTopics, firstTopicId, fullName, focusedListings, noteReminders, listingAccuracy, refresh } = useHomeStats()
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

  // Admissions events folded into Upcoming Dates (urgent/important/info with future eventDate)
  const futureAdmissionEvents = useMemo(() => {
    return upcomingEvents(admissionItems).filter(
      item => item.severity === 'urgent' || item.severity === 'important' || item.severity === 'info'
    )
  }, [admissionItems])

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }, [refresh])

  const { enabled: notifEnabled, schedule: scheduleNotifs, toggle: toggleNotifs } = useNotifications()
  const [showNotifModal, setShowNotifModal] = useState(false)
  const { phrase: kuyaMsg, onTap: onKuyaTap } = useAiCoach()
  const { open: openKuya } = useKuyaChatModal()

  const [upcomingExpanded, setUpcomingExpanded] = useState(false)

  useEffect(() => {
    if (focusedListings.length > 0) {
      void scheduleNotifs(focusedListings)
    }
  }, [focusedListings, scheduleNotifs])

  const quickTopicId = weakTopics[0]?.topicId ?? firstTopicId

  const now = Date.now()

  // Build upcoming dates list (focused listings + note reminders + admissions events)
  const focusedListingDateEntries = focusedListings
    .map(l => {
      const keyDate = l.type === 'exam'
        ? (l.examDate ?? l.deadline)
        : (l.deadline ?? l.examDate)
      const label = l.type === 'exam' ? 'Exam' : 'Deadline'
      return { ...l, keyDate, label, entryType: 'listing' as const }
    })
    .filter(l => l.keyDate != null && l.keyDate >= now)

  const focusedSlugs = new Set(focusedListings.map(l => l.slug))
  const admissionsDateEntries = futureAdmissionEvents
    .filter(item => item.eventDate != null)
    .map(item => {
      const ms = new Date(item.eventDate! + 'T00:00:00Z').getTime()
      return {
        slug: `admission-${item.id}`,
        priority: 0,
        title: item.title,
        type: item.eventType === 'exam' ? 'exam' : 'event',
        examDate: null as number | null,
        deadline: null as number | null,
        keyDate: ms,
        label: item.eventType === 'exam' ? 'Exam' : item.eventType === 'deadline' ? 'Deadline' : 'Event',
        entryType: 'admission' as const,
        schoolSlug: item.schoolSlug ?? null,
      }
    })
    .filter(a => !focusedListingDateEntries.some(l => l.keyDate === a.keyDate))

  const upcomingDates = [
    ...focusedListingDateEntries,
    ...noteReminders.map(r => ({
      slug: r.noteId,
      priority: 0,
      title: r.noteTitle || 'Untitled note',
      type: 'reminder',
      examDate: null as number | null,
      deadline: null as number | null,
      keyDate: r.reminderAt,
      label: 'Reminder',
      entryType: 'reminder' as const,
    })),
    ...admissionsDateEntries,
  ]
    .filter(l => l.keyDate != null && l.keyDate >= now)
    .sort((a, b) => (a.keyDate ?? 0) - (b.keyDate ?? 0))
    .slice(0, 7)

  const TOP_N = 3
  const visibleUpcomingDates = upcomingExpanded ? upcomingDates : upcomingDates.slice(0, TOP_N)


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
    // Hero band: full-bleed maroon stripe (absolute bottom layer) with the
    // mascot overhanging its top edge and the speech bubble layered on top.
    // Fixed wrapper height = no layout shift as kuyaMsg rotates.
    heroWrap: { height: 150, marginTop: spacing.lg, marginBottom: spacing.md, marginHorizontal: -spacing.lg },
    heroBand: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, backgroundColor: 'rgba(128,0,0,0.92)' },
    heroMascot: { position: 'absolute', left: spacing.md, bottom: 0, width: MASCOT_W, height: MASCOT_H },
    heroBubble: {
      position: 'absolute',
      left: MASCOT_W + spacing.md,
      right: spacing.lg,
      top: spacing.xs,
      bottom: spacing.sm,
      // t.bg (opaque) — a translucent surface over the maroon band turns
      // muddy red in dark mode; an opaque card matches the reference look.
      backgroundColor: t.bg,
      borderRadius: radius.xl,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: t.border,
      boxShadow: t.shadowSm,
      padding: spacing.md,
    },
    kuyaNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
    kuyaName: { fontSize: typo.md, fontWeight: '700', color: t.accentText, fontFamily: 'Outfit_700Bold' },
    kuyaBadge: { marginLeft: 'auto', backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)', borderRadius: radius.sm, borderCurve: 'continuous', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 },
    kuyaBadgeText: { fontSize: typo.xs, fontWeight: '600', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    kuyaText: { fontSize: typo.sm, color: t.textPrimary, lineHeight: 19, fontFamily: 'Lexend_400Regular' },
    askHint: { marginTop: 'auto', alignSelf: 'flex-end', fontSize: typo.xs, color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    quickBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
    quickIcon: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    quickTitle: { fontSize: typo.sm, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    quickSub: { fontSize: typo.xs, color: 'rgba(255,255,255,0.78)', marginTop: spacing.xs / 4, fontFamily: 'Lexend_400Regular' },
    chevron: { color: t.textTertiary, fontSize: 22 },
    section: { marginTop: spacing.xl },
    empty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    // Focus card styles
    focusCard: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.xl,
      borderCurve: 'continuous',
      boxShadow: t.shadowSm,
      padding: spacing.md,
    },
    focusCardPressed: { opacity: 0.75 },
    focusRow1: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs / 2 },
    focusTitle: { flex: 1, fontSize: typo.base, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    focusBadge: {
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.sm,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    focusBadgeText: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    focusDaysLeft: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.xs / 2 },
    focusMiniStats: { flexDirection: 'row', gap: spacing.md },
    focusMiniStat: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
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

          {/* (2) Hero band — full-bleed maroon stripe, animated Kuya Baw overhanging it */}
          <View style={s.heroWrap}>
            <View style={s.heroBand} />
            <Pressable
              style={s.heroMascot}
              onPress={onKuyaTap}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Tap Kuya Baw for a new tip"
            >
              <KuyaHeroAnimation width={MASCOT_W} height={MASCOT_H} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.heroBubble, pressed && { opacity: 0.85 }]}
              onPress={() => { void openKuya() }}
              accessibilityRole="button"
              accessibilityLabel="Ask Kuya Baw"
            >
              <View style={s.kuyaNameRow}>
                <Text style={s.kuyaName} maxFontSizeMultiplier={1.4}>Kuya Baw</Text>
                <View style={s.kuyaBadge}><Text style={s.kuyaBadgeText} maxFontSizeMultiplier={1.4}>AI Coach</Text></View>
              </View>
              <Text style={s.kuyaText} numberOfLines={3} maxFontSizeMultiplier={1.4}>{kuyaMsg}</Text>
              <Text style={s.askHint} maxFontSizeMultiplier={1.4}>Ask Kuya Baw ›</Text>
            </Pressable>
          </View>

          {/* (3) Quick Practice CTA */}
          {quickTopicId ? (
            <Pressable
              style={({ pressed }) => [s.quickBtn, pressed && { opacity: 0.85 }]}
              onPress={() => router.push(`/practice/${quickTopicId}`)}
              accessibilityRole="button"
            >
              <View style={s.quickIcon}>
                <Lineicons icon={Bolt2Outlined} size={15} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.quickTitle}>Quick Practice</Text>
                <Text style={s.quickSub}>
                  {weakTopics[0]?.topicName ?? 'Start a topic'} · recommended
                </Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          ) : null}

          {/* (4) My Focus — one card per focusedListings entry */}
          <View style={s.section}>
            <SectionHeader title="My Focus" subtitle="Readiness and streaks for your target exams" />
          </View>
          {focusedListings.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {focusedListings.map(listing => {
                const keyDate = listing.type === 'exam'
                  ? (listing.examDate ?? listing.deadline)
                  : (listing.deadline ?? listing.examDate)
                const daysLeft = keyDate != null ? msToDays(keyDate) : null
                const daysLeftLabel = daysLeft != null
                  ? (daysLeft < 1 ? 'Today' : `${daysLeft} days left`)
                  : 'Date TBA'
                const accuracy = listingAccuracy[listing.slug]
                const readinessLabel = accuracy != null ? `🎯 Readiness ${accuracy}%` : '🎯 Readiness —%'
                const streakLabel = streakDays > 0 ? `🔥 ${streakDays}-day streak` : '🔥 No streak yet'
                const badgeLabel = `#${listing.priority} · ${listing.type}`

                return (
                  <Pressable
                    key={listing.slug}
                    style={({ pressed }) => [s.focusCard, pressed && s.focusCardPressed]}
                    onPress={() => router.push(`/listings/${listing.slug}`)}
                    accessibilityRole="button"
                    accessibilityLabel={listing.title}
                  >
                    <View style={s.focusRow1}>
                      <Text style={s.focusTitle} numberOfLines={1}>{listing.title}</Text>
                      <View style={s.focusBadge}>
                        <Text style={s.focusBadgeText}>{badgeLabel}</Text>
                      </View>
                    </View>
                    <Text style={s.focusDaysLeft}>{daysLeftLabel}</Text>
                    <View style={s.focusMiniStats}>
                      <Text style={s.focusMiniStat} maxFontSizeMultiplier={1.4}>{readinessLabel}</Text>
                      <Text style={s.focusMiniStat} maxFontSizeMultiplier={1.4}>{streakLabel}</Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ) : (
            <InfoBanner
              icon={<Text style={{ fontSize: 16 }}>🎯</Text>}
              message="Add an exam or scholarship to your focus from the Lists tab"
              actionLabel="Lists"
              onAction={() => router.push('/(tabs)/listings')}
              tone="neutral"
            />
          )}

          {/* (5) Explore — discovery quick-links into the Lists screen's tabs */}
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

          {/* (6) Upcoming Dates — top 3 + See all — LAST section */}
          <View style={s.section}>
            <SectionHeader
              title="Upcoming Dates"
              subtitle="Deadlines and exam dates on your radar"
              actionLabel={
                upcomingDates.length > TOP_N
                  ? (upcomingExpanded ? 'Show less' : `See all (${upcomingDates.length})`)
                  : undefined
              }
              onAction={upcomingDates.length > TOP_N ? () => setUpcomingExpanded(v => !v) : undefined}
            />
          </View>
          {upcomingDates.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {visibleUpcomingDates.map(item => {
                const d = msToDays(item.keyDate!)
                const dayColor = d < 14 ? '#f87171' : d < 30 ? '#fbbf24' : '#4ade80'
                const isReminder = item.entryType === 'reminder'
                return (
                  <ListCard
                    key={item.slug}
                    iconBg={t.surface2}
                    icon={
                      isReminder
                        ? <Lineicons icon={Bell1Outlined} size={18} color={t.accentText} />
                        : item.entryType === 'admission'
                          ? <Text style={{ fontSize: 16 }}>📌</Text>
                          : <Text style={{ fontSize: 16 }}>{item.type === 'exam' ? '📝' : '🎓'}</Text>
                    }
                    title={item.title}
                    subtitle={`${item.label} · ${formatShortDate(item.keyDate!)}`}
                    trailing={
                      <View style={{ backgroundColor: `${dayColor}18`, borderColor: `${dayColor}40`, borderWidth: 1, borderRadius: radius.sm, borderCurve: 'continuous', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
                        <Text style={{ fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', color: dayColor }}>{d < 1 ? 'Today' : `${d}d`}</Text>
                      </View>
                    }
                    onPress={() => {
                      if (item.entryType === 'reminder') {
                        router.push(`/notes/${item.slug}`)
                      } else if (item.entryType === 'admission') {
                        const slug = (item as any).schoolSlug
                        if (slug === 'upcat' || item.title.toUpperCase().includes('UPCAT')) {
                          router.push('/practice/exam/upcat')
                        } else {
                          router.push('/(tabs)/updates')
                        }
                      } else {
                        router.push(`/listings/${item.slug}`)
                      }
                    }}
                  />
                )
              })}
            </View>
          ) : (
            <Text style={s.empty}>
              {focusedListings.length === 0
                ? 'Add scholarships and exams to your focus list to track upcoming dates'
                : 'No upcoming dates — all dates may have passed'}
            </Text>
          )}

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
