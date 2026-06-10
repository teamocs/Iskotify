import { useState, useEffect, useMemo, useCallback } from 'react'
// RN Image is fine for tiny bundled assets; adding expo-image is a native module that would break OTA delivery.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { Alert, StyleSheet, View, Text, Modal, Switch, Platform, Image, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Gear1Outlined, Bolt2Outlined, Bell1Outlined, Bell1Solid, User4Outlined } from '@lineiconshq/free-icons'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { ListCard } from '../../components/ui/ListCard'
import { InfoBanner } from '../../components/ui/InfoBanner'
import { spacing, radius } from '../../theme/tokens'
import { useHomeStats } from '../../hooks/useHomeStats'
import { useNotifications } from '../../hooks/useNotifications'
import { useAiCoach } from '../../hooks/useAiCoach'
import { useModelDownload } from '../../hooks/useModelDownload'
import { useTheme } from '../../theme/ThemeContext'
import { AskKuyaModal } from '../../components/AskKuyaModal'
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
  if (h < 12) return 'Good morning ☀️'
  if (h < 18) return 'Good afternoon 🌤'
  return 'Good evening 🌙'
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function msToDays(ms: number): number {
  return Math.ceil((ms - Date.now()) / 86_400_000)
}

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
  const { modelStatus } = useModelDownload(() => {})
  const [chatVisible, setChatVisible] = useState(false)

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

  const onAskPress = () => {
    if (modelStatus === 'ready') {
      setChatVisible(true)
    } else {
      Alert.alert(
        'Install AI Reviewer first',
        'Tap "Get it" to download the AI Reviewer engine.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Get it', onPress: () => router.push('/(tabs)/practice') },
        ],
      )
    }
  }

  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    root:  { flex: 1, backgroundColor: t.bg },
    greetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: spacing.lg, paddingBottom: spacing.lg },
    greetTime: { fontSize: typo.sm, color: t.textTertiary, marginBottom: spacing.xs / 2, fontFamily: 'Lexend_400Regular' },
    greetName: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.5, fontFamily: 'Outfit_700Bold' },
    iconBtn: { width: 44, height: 44, backgroundColor: t.surface2, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: t.divider, alignItems: 'center', justifyContent: 'center' },
    headerBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    kuyaCard: { borderColor: 'rgba(128,0,0,0.35)', marginBottom: spacing.md },
    kuyaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    kuyaAvatarLg: { width: 80, height: 80, borderRadius: radius.md, borderCurve: 'continuous', overflow: 'hidden', flexShrink: 0 },
    kuyaNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    kuyaName: { fontSize: typo.md, fontWeight: '700', color: t.accentText, fontFamily: 'Outfit_700Bold' },
    kuyaBadge: { marginLeft: 'auto', backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)', borderRadius: radius.sm, borderCurve: 'continuous', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 },
    kuyaBadgeText: { fontSize: typo.xs, fontWeight: '600', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    askPill: {
      marginLeft: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.border,
    },
    askPillDisabled: { opacity: 0.5 },
    askPillText: {
      fontFamily: 'Lexend_500Medium',
      fontSize: typo.xs,
      color: t.textSecondary,
    },
    kuyaText: { fontSize: typo.sm, color: t.textPrimary, lineHeight: 19, fontFamily: 'Lexend_400Regular' },
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

        {/* (1) Greeting row */}
        <View style={s.greetRow}>
          <View>
            <Text style={s.greetTime}>{timeGreeting()}</Text>
            <Text style={s.greetName}>{fullName.split(' ')[0] || 'Student'}</Text>
          </View>
          <View style={s.headerBtns}>
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setShowNotifModal(true)}
              accessibilityRole="button"
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
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Lineicons icon={Gear1Outlined} size={20} color={t.textSecondary} />
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
          </View>
        </View>

        <View>

          {/* (2) Kuya Baw FULL card — always expanded */}
          <Card elevated style={s.kuyaCard}>
            <View style={s.kuyaRow}>
              <Pressable
                style={s.kuyaAvatarLg}
                onPress={onKuyaTap}
                hitSlop={12}
                android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 50 }}
                accessibilityRole="button"
                accessibilityLabel="Tap Kuya Baw for a new tip"
              >
                <Image
                  source={require('../../assets/images/kuya-baw-mascot.png')}
                  style={{ width: 80, height: 80 }}
                  resizeMode="contain"
                />
              </Pressable>
              <View style={{ flex: 1 }}>
                <View style={s.kuyaNameRow}>
                  <Text style={s.kuyaName}>Kuya Baw</Text>
                  <View style={s.kuyaBadge}><Text style={s.kuyaBadgeText}>AI Coach</Text></View>
                  <Pressable
                    style={[s.askPill, modelStatus !== 'ready' && s.askPillDisabled]}
                    onPress={onAskPress}
                    accessibilityRole="button"
                    accessibilityLabel={modelStatus === 'ready' ? 'Ask Kuya Baw' : 'Ask Kuya Baw — download AI first'}
                  >
                    <Text style={s.askPillText}>💬 Ask</Text>
                  </Pressable>
                </View>
                <Text style={s.kuyaText}>"{kuyaMsg}"</Text>
              </View>
            </View>
          </Card>

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
            <SectionHeader title="My Focus" />
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
              message="Add an exam or scholarship to your focus from the Exams tab"
              actionLabel="Exams"
              onAction={() => router.push('/(tabs)/listings')}
              tone="neutral"
            />
          )}

          {/* (5) Upcoming Dates — top 3 + See all — LAST section */}
          <View style={s.section}>
            <SectionHeader
              title="Upcoming Dates"
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

      <AskKuyaModal visible={chatVisible} onClose={() => setChatVisible(false)} />
    </SafeAreaView>
  )
}
