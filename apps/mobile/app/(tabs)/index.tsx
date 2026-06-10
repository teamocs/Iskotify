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
import { SplitStatCard } from '../../components/ui/SplitStatCard'
import { ListCard } from '../../components/ui/ListCard'
import { spacing, radius } from '../../theme/tokens'
import { useHomeStats, type FocusedListing, type NoteReminder } from '../../hooks/useHomeStats'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useNotifications } from '../../hooks/useNotifications'
import { useAiCoach } from '../../hooks/useAiCoach'
import { useModelDownload } from '../../hooks/useModelDownload'
import { useTheme } from '../../theme/ThemeContext'
import { AskKuyaModal } from '../../components/AskKuyaModal'
import { eq, asc } from 'drizzle-orm'
import { DateActionSheet } from '../../components/calendar/DateActionSheet'
import { MonthSheet } from '../../components/calendar/MonthSheet'
import { useDb } from '../../hooks/useDb'
import { notes as notesTable, listings as listingsTable, focusListings, admissionsUpdates as admissionsUpdatesTable } from '../../db/schema'
import { upcomingEvents } from '../../utils/admissionsFeed'
import type { FeedItem } from '../../utils/admissionsFeed'
import { getAcquiredRequirementIndices } from '../../services/coachQueue'
import { scheduleNoteReminder, cancelNoteReminder } from '../../services/notifications'
import type { QuickReminderPayload } from '../../components/calendar/QuickReminderForm'

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function CalendarStrip({
  importantDays,
  practiceDays,
  reminderDays,
  onDayPress,
  onHeaderPress,
}: {
  importantDays: Set<number>
  practiceDays: Set<number>
  reminderDays: Set<number>
  onDayPress: (dayStartMs: number) => void
  onHeaderPress: () => void
}) {
  const { theme: t, typo } = useTheme()
  const cs = useMemo(() => StyleSheet.create({
    container: { paddingVertical: 6 },
    navRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
    navLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    arrowTxt: { fontSize: typo.xl, color: t.textSecondary, fontFamily: 'Outfit_700Bold', lineHeight: 26 },
    monthLbl: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_700Bold', minWidth: 90, textAlign: 'center' },
    pill: { marginLeft: 'auto', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 980, paddingHorizontal: 10, paddingVertical: 3 },
    pillTxt: { fontSize: typo.xs, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    pillExam: { backgroundColor: 'rgba(252,165,165,0.12)', borderColor: 'rgba(252,165,165,0.30)' },
    pillExamTxt: { color: t.accentText },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    dayCol: { alignItems: 'center', gap: 3, flex: 1 },
    letter: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    letterToday: { color: t.accentText },
    circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    circleToday: { backgroundColor: t.textPrimary },
    circleExam: { borderWidth: 1.5, borderColor: t.accentText },
    num: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    numToday: { color: t.bg },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
    dotActive: { backgroundColor: '#60a5fa' },
    dotReminder: { backgroundColor: '#fbbf24' },
    dotExam: { backgroundColor: t.accentText },
  }), [t, typo])

  const [weekOffset, setWeekOffset] = useState(0)

  const todayDay = Math.floor(Date.now() / 86_400_000)
  const centerDay = todayDay + weekOffset * 7

  const days: Array<{
    dayIndex: number
    dayLetter: string
    dayNum: number
    isToday: boolean
    hasExam: boolean
    hasPractice: boolean
    hasReminder: boolean
  }> = []
  for (let offset = -3; offset <= 3; offset++) {
    const dayIndex = centerDay + offset
    const date = new Date(dayIndex * 86_400_000)
    days.push({
      dayIndex,
      dayLetter: DAY_LETTERS[date.getUTCDay()] ?? 'S',
      dayNum: date.getUTCDate(),
      isToday: dayIndex === todayDay,
      hasExam: importantDays.has(dayIndex),
      hasPractice: practiceDays.has(dayIndex),
      hasReminder: reminderDays.has(dayIndex),
    })
  }

  // Month label — "May 2026" or "May – Jun 2026" when window spans two months
  const firstDate = new Date((centerDay - 3) * 86_400_000)
  const lastDate  = new Date((centerDay + 3) * 86_400_000)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const monthLabel =
    fmt(firstDate) === fmt(lastDate)
      ? `${fmt(firstDate)} ${lastDate.getUTCFullYear()}`
      : `${fmt(firstDate)} – ${fmt(lastDate)} ${lastDate.getUTCFullYear()}`

  // Nearest future exam/deadline
  const futureDays = [...importantDays].filter(d => d > todayDay).sort((a, b) => a - b)
  const nearestExamDay = futureDays[0] ?? null
  const examWeekOffset =
    nearestExamDay != null ? Math.round((nearestExamDay - todayDay) / 7) : null

  const showToday    = weekOffset !== 0
  const showNextExam = weekOffset === 0 && nearestExamDay != null

  return (
    <View style={cs.container}>
      {/* Navigation row */}
      <View style={cs.navRow}>
        <View style={cs.navLeft}>
          <Pressable
            onPress={() => setWeekOffset(w => w - 1)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Text style={cs.arrowTxt}>‹</Text>
          </Pressable>
          <Pressable onPress={onHeaderPress} accessibilityRole="button" accessibilityLabel="Open full month calendar">
            <Text style={cs.monthLbl}>{monthLabel}</Text>
          </Pressable>
          <Pressable
            onPress={() => setWeekOffset(w => w + 1)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Text style={cs.arrowTxt}>›</Text>
          </Pressable>
        </View>

        {showToday ? (
          <Pressable
            onPress={() => setWeekOffset(0)}
            style={({ pressed }) => [cs.pill, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={cs.pillTxt}>Today</Text>
          </Pressable>
        ) : null}
        {showNextExam && examWeekOffset != null ? (
          <Pressable
            onPress={() => setWeekOffset(examWeekOffset)}
            style={({ pressed }) => [cs.pill, cs.pillExam, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={[cs.pillTxt, cs.pillExamTxt]}>📌 Exam</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Days row */}
      <View style={cs.row}>
        {days.map((d, i) => (
          <Pressable
            key={i}
            style={cs.dayCol}
            onPress={() => {
              // Day index is UTC-based. Build local midnight from the UTC date components
              // so DateActionSheet shows the same day the user tapped.
              const utcD = new Date(d.dayIndex * 86_400_000)
              const localMidnight = new Date(utcD.getUTCFullYear(), utcD.getUTCMonth(), utcD.getUTCDate()).getTime()
              onDayPress(localMidnight)
            }}
            accessibilityRole="button"
            accessibilityLabel={`Day ${d.dayNum}`}
          >
            <Text style={[cs.letter, d.isToday && cs.letterToday]}>
              {d.dayLetter}
            </Text>
            <View style={[
              cs.circle,
              d.isToday && cs.circleToday,
              d.hasExam && !d.isToday && cs.circleExam,
            ]}>
              <Text style={[cs.num, d.isToday && cs.numToday]}>
                {d.dayNum}
              </Text>
            </View>
            <View style={[
              cs.dot,
              d.hasPractice && cs.dotActive,
              d.hasReminder && cs.dotReminder,
              d.hasExam && cs.dotExam,
            ]} />
          </Pressable>
        ))}
      </View>
    </View>
  )
}

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

function weakTopicColor(accuracy: number): string {
  if (accuracy <= 30) return '#ef4444'
  if (accuracy <= 50) return '#f97316'
  return '#eab308'
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
        {NOTIF_TYPES.map((n, i) => (
          <View
            key={i}
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
  const { daysLeft, todayAccuracy, streakDays, weakTopics, firstTopicId, fullName, importantDayIndices, practiceDayIndices, focusedListings, noteReminders, refresh } = useHomeStats()
  const db = useDb()
  const [activeDayMs, setActiveDayMs] = useState<number | null>(null)
  const [showMonth, setShowMonth] = useState(false)

  // Progressive-disclosure state
  const [coachExpanded, setCoachExpanded] = useState(false)
  const [weakAreasExpanded, setWeakAreasExpanded] = useState(false)
  const [upcomingExpanded, setUpcomingExpanded] = useState(false)

  // Derive day indices for amber reminder dots (matches dayIndex math used by CalendarStrip)
  const reminderDays = useMemo(
    () => new Set(noteReminders.map(r => Math.floor(r.reminderAt / 86_400_000))),
    [noteReminders]
  )

  async function handleSaveReminder(payload: QuickReminderPayload) {
    const id = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    await db.insert(notesTable).values({
      id,
      title: payload.title,
      content: payload.content,
      type: payload.type,
      isPinned: false,
      isArchived: false,
      isTrashed: false,
      reminderAt: payload.reminderAt,
      createdAt: now,
      updatedAt: now,
    })
    try {
      await scheduleNoteReminder(id, payload.title, new Date(payload.reminderAt))
    } catch (err) {
      console.warn('[home/reminder] schedule failed:', err)
    }
    setActiveDayMs(null)
    void refresh()
  }

  async function handleSaveAndOpenEditor(payload: QuickReminderPayload) {
    const id = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    await db.insert(notesTable).values({
      id,
      title: payload.title,
      content: payload.content,
      type: payload.type,
      isPinned: false,
      isArchived: false,
      isTrashed: false,
      reminderAt: payload.reminderAt,
      createdAt: now,
      updatedAt: now,
    })
    try {
      await scheduleNoteReminder(id, payload.title, new Date(payload.reminderAt))
    } catch (err) {
      console.warn('[home/reminder] schedule failed:', err)
    }
    setActiveDayMs(null)
    void refresh()
    router.push(`/notes/${id}`)
  }

  async function handleDeleteReminder(noteId: string) {
    await db.update(notesTable)
      .set({ reminderAt: null, updatedAt: Date.now() })
      .where(eq(notesTable.id, noteId))
    try { await cancelNoteReminder(noteId) } catch {}
    void refresh()
  }

  function handleOpenNoteEditor(noteId: string) {
    setActiveDayMs(null)
    router.push(`/notes/${noteId}`)
  }

  function handleOpenListing(slug: string) {
    setActiveDayMs(null)
    router.push(`/listings/${slug}`)
  }

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

  const { sessionCount, streak } = useAnalytics('overall')

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }, [refresh])

  // Merge admissions eventDates into importantDays for CalendarStrip markers
  const importantDays = useMemo(() => {
    const s = new Set(importantDayIndices)
    for (const item of futureAdmissionEvents) {
      if (item.eventDate) {
        const ms = new Date(item.eventDate + 'T00:00:00Z').getTime()
        if (ms > 0) s.add(Math.floor(ms / 86_400_000))
      }
    }
    return s
  }, [importantDayIndices, futureAdmissionEvents])

  const practiceDays  = new Set(practiceDayIndices)

  const { enabled: notifEnabled, schedule: scheduleNotifs, toggle: toggleNotifs } = useNotifications()
  const [showNotifModal, setShowNotifModal] = useState(false)
  const { phrase: kuyaMsg, onTap: onKuyaTap } = useAiCoach()
  const { modelStatus } = useModelDownload(() => {})
  const [chatVisible, setChatVisible] = useState(false)

  // Missing-requirements count across all focused listings
  const [missingReqCount, setMissingReqCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await db
          .select({
            slug: focusListings.listingSlug,
            requirements: listingsTable.requirements,
          })
          .from(focusListings)
          .leftJoin(listingsTable, eq(listingsTable.slug, focusListings.listingSlug))
          .orderBy(asc(focusListings.priority))

        const rowsWithReqs = rows.filter(row => {
          try { return (JSON.parse(row.requirements ?? '[]') as string[]).length > 0 } catch { return false }
        })
        const acquiredLists = await Promise.all(rowsWithReqs.map(r => getAcquiredRequirementIndices(db, r.slug)))
        let total = 0
        rowsWithReqs.forEach((row, i) => {
          let reqs: string[] = []
          try { reqs = JSON.parse(row.requirements ?? '[]') } catch { reqs = [] }
          total += reqs.length - (acquiredLists[i]?.length ?? 0)
        })
        if (!cancelled) setMissingReqCount(total)
      } catch (e) {
        console.warn('[home/requirements] count failed:', e)
      }
    })()
    return () => { cancelled = true }
  // Re-run whenever focusedListings changes (after refresh)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, focusedListings])

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
    calendarWrap: { paddingVertical: spacing.sm },
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
    // Collapsed coach row
    kuyaCollapsedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: 'rgba(128,0,0,0.25)',
      borderRadius: radius.xl,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },
    kuyaMiniAvatar: { width: 32, height: 32, borderRadius: radius.sm, borderCurve: 'continuous', overflow: 'hidden', flexShrink: 0 },
    kuyaCollapsedName: { fontSize: typo.sm, fontWeight: '700', color: t.accentText, fontFamily: 'Outfit_700Bold', marginRight: spacing.xs },
    kuyaCollapsedTip: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', flex: 1 },
    kuyaChevron: { fontSize: 18, color: t.textTertiary, marginLeft: spacing.xs },
    quickBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
    quickIcon: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
    quickTitle: { fontSize: typo.sm, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    quickSub: { fontSize: typo.xs, color: 'rgba(255,255,255,0.78)', marginTop: spacing.xs / 4, fontFamily: 'Lexend_400Regular' },
    chevron: { color: t.textTertiary, fontSize: 22 },
    section: { marginTop: spacing.xl },
    empty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    // Merged 2-column row for Missing Requirements + My Progress
    twoColRow: { flexDirection: 'row', gap: spacing.sm },
    twoColHalf: {
      flex: 1,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.xl,
      borderCurve: 'continuous',
      boxShadow: t.shadowSm,
      padding: spacing.md,
      alignItems: 'flex-start',
      gap: spacing.xs,
    },
    twoColIcon: { fontSize: 18 },
    twoColTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', lineHeight: 17 },
    twoColSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 15 },
  }), [t, typo])

  useEffect(() => {
    if (focusedListings.length > 0) {
      void scheduleNotifs(focusedListings)
    }
  }, [focusedListings, scheduleNotifs])

  const quickTopicId = weakTopics[0]?.topicId ?? firstTopicId

  const now = Date.now()

  // Build a de-dupe set: focused listing slugs that already have a date entry
  const focusedListingDateEntries = focusedListings
    .map(l => {
      const keyDate = l.type === 'exam'
        ? (l.examDate ?? l.deadline)
        : (l.deadline ?? l.examDate)
      const label = l.type === 'exam' ? 'Exam' : 'Deadline'
      return { ...l, keyDate, label, entryType: 'listing' as const }
    })
    .filter(l => l.keyDate != null && l.keyDate >= now)

  // Convert admissions events with a future eventDate into widget items.
  // Only include if the event title isn't already covered by a focused listing slug.
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
    // Skip items whose eventDate is the same ms as an already-focused listing date
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

  // Top-3 + See all slicing
  const TOP_N = 3
  const visibleWeakTopics = weakAreasExpanded ? weakTopics : weakTopics.slice(0, TOP_N)
  const visibleUpcomingDates = upcomingExpanded ? upcomingDates : upcomingDates.slice(0, TOP_N)

  const showMissingReq = missingReqCount > 0 && focusedListings.length > 0
  const showProgress = sessionCount > 0

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

          {/* (2) Quick Practice CTA — PRIMARY, promoted directly under greeting */}
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

          {/* (3) Stats card */}
          <View style={{ marginBottom: spacing.xl }}>
            <SplitStatCard
              columns={[
                { value: daysLeft != null ? String(daysLeft) : '—', label: 'DAYS LEFT', valueColor: t.accentText },
                { value: todayAccuracy !== null ? `${todayAccuracy}%` : '—', label: 'ACCURACY' },
                { value: streakDays > 0 ? `${streakDays}🔥` : '—', label: 'STREAK', valueColor: streakDays > 0 ? '#fbbf24' : undefined },
              ]}
            />
          </View>

          {/* (4) Kuya Baw AI Coach — COLLAPSED one-liner, expands inline */}
          {coachExpanded ? (
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
                  <Pressable
                    onPress={() => setCoachExpanded(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Collapse coach card"
                    style={{ marginTop: spacing.sm, alignSelf: 'flex-end' }}
                  >
                    <Text style={{ fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' }}>Show less ‹</Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          ) : (
            <Pressable
              style={({ pressed }) => [s.kuyaCollapsedRow, pressed && { opacity: 0.8 }]}
              onPress={() => setCoachExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Expand Kuya Baw coach card"
              accessibilityState={{ expanded: false }}
              testID="kuya-coach-collapsed"
            >
              <View style={s.kuyaMiniAvatar}>
                <Image
                  source={require('../../assets/images/kuya-baw-mascot.png')}
                  style={{ width: 32, height: 32 }}
                  resizeMode="contain"
                />
              </View>
              <Text style={s.kuyaCollapsedName}>Kuya Baw</Text>
              <Text style={s.kuyaCollapsedTip} numberOfLines={1}>"{kuyaMsg}"</Text>
              <Text style={s.kuyaChevron}>›</Text>
            </Pressable>
          )}

          {/* (5) Calendar strip */}
          <View style={s.calendarWrap}>
            <CalendarStrip
              importantDays={importantDays}
              practiceDays={practiceDays}
              reminderDays={reminderDays}
              onDayPress={setActiveDayMs}
              onHeaderPress={() => setShowMonth(true)}
            />
          </View>

          {/* (6) Weak Areas — top 3 + See all */}
          <View style={s.section}>
            <SectionHeader
              title="Weak Areas"
              actionLabel={
                weakTopics.length > TOP_N
                  ? (weakAreasExpanded ? 'Show less' : `See all (${weakTopics.length})`)
                  : undefined
              }
              onAction={weakTopics.length > TOP_N ? () => setWeakAreasExpanded(v => !v) : undefined}
            />
          </View>
          {weakTopics.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {visibleWeakTopics.map(topic => {
                const color = weakTopicColor(topic.accuracy)
                return (
                  <ListCard
                    key={topic.topicId}
                    icon={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />}
                    iconBg={`${color}1f`}
                    title={topic.topicName}
                    subtitle="Tap to practice"
                    trailing={<Text style={{ fontSize: typo.sm, fontWeight: '700', color, fontFamily: 'Outfit_700Bold' }}>{topic.accuracy}%</Text>}
                    progress={topic.accuracy / 100}
                    progressColor={color}
                    onPress={() => router.push(`/practice/${topic.topicId}`)}
                  />
                )
              })}
            </View>
          ) : (
            <Text style={s.empty}>Start practicing to see weak areas</Text>
          )}

          {/* (7) Upcoming Dates — top 3 + See all */}
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

          {/* (8) Missing Requirements + My Progress — merged compact 2-column row */}
          {(showMissingReq || showProgress) ? (
            <View style={[s.section, { marginBottom: spacing.md }]}>
              <View style={s.twoColRow}>
                {showMissingReq ? (
                  <Pressable
                    style={({ pressed }) => [s.twoColHalf, pressed && { opacity: 0.75 }]}
                    onPress={() => router.push('/requirements')}
                    accessibilityRole="button"
                    accessibilityLabel={`Missing requirements: ${missingReqCount}`}
                  >
                    <Text style={s.twoColIcon}>📋</Text>
                    <Text style={s.twoColTitle} numberOfLines={1}>Requirements</Text>
                    <Text style={s.twoColSub} numberOfLines={1}>{missingReqCount} missing</Text>
                  </Pressable>
                ) : null}
                {showProgress ? (
                  <Pressable
                    style={({ pressed }) => [s.twoColHalf, pressed && { opacity: 0.75 }]}
                    onPress={() => router.push('/(tabs)/analytics')}
                    accessibilityRole="button"
                    accessibilityLabel="My Progress"
                  >
                    <Text style={s.twoColIcon}>📈</Text>
                    <Text style={s.twoColTitle} numberOfLines={1}>My Progress</Text>
                    <Text style={s.twoColSub} numberOfLines={2}>{sessionCount} session{sessionCount !== 1 ? 's' : ''}{streak > 0 ? ` · ${streak}🔥` : ''}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

        </View>
      </ScreenScroll>

      <DateActionSheet
        visible={activeDayMs != null}
        dayStartMs={activeDayMs ?? 0}
        onClose={() => setActiveDayMs(null)}
        onSaveReminder={handleSaveReminder}
        onSaveAndOpenEditor={handleSaveAndOpenEditor}
        onOpenNoteEditor={handleOpenNoteEditor}
        onOpenListing={handleOpenListing}
        onDeleteReminder={handleDeleteReminder}
      />
      <MonthSheet
        visible={showMonth}
        onClose={() => setShowMonth(false)}
        onDayPress={(ms) => {
          setShowMonth(false)
          setActiveDayMs(ms)
        }}
        importantDays={importantDays}
        reminderDays={reminderDays}
        practiceDays={practiceDays}
      />
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
