import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Modal, Switch, Platform, Image, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Gear1Outlined, Bolt2Outlined, Bell1Outlined, Bell1Solid } from '@lineiconshq/free-icons'
import { useHomeStats, type FocusedListing } from '../../hooks/useHomeStats'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useNotifications } from '../../hooks/useNotifications'
import { useAiCoach } from '../../hooks/useAiCoach'
import { useTheme } from '../../theme/ThemeContext'

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function CalendarStrip({
  importantDays,
  practiceDays,
}: {
  importantDays: Set<number>
  practiceDays: Set<number>
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
    pillExamTxt: { color: '#fca5a5' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    dayCol: { alignItems: 'center', gap: 3, flex: 1 },
    letter: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    letterToday: { color: '#fca5a5' },
    circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    circleToday: { backgroundColor: t.textPrimary },
    circleExam: { borderWidth: 1.5, borderColor: '#fca5a5' },
    num: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    numToday: { color: t.bg },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
    dotActive: { backgroundColor: '#60a5fa' },
    dotExam: { backgroundColor: '#fca5a5' },
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
          <TouchableOpacity
            onPress={() => setWeekOffset(w => w - 1)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <Text style={cs.arrowTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={cs.monthLbl}>{monthLabel}</Text>
          <TouchableOpacity
            onPress={() => setWeekOffset(w => w + 1)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <Text style={cs.arrowTxt}>›</Text>
          </TouchableOpacity>
        </View>

        {showToday && (
          <TouchableOpacity onPress={() => setWeekOffset(0)} style={cs.pill}>
            <Text style={cs.pillTxt}>Today</Text>
          </TouchableOpacity>
        )}
        {showNextExam && examWeekOffset != null && (
          <TouchableOpacity
            onPress={() => setWeekOffset(examWeekOffset)}
            style={[cs.pill, cs.pillExam]}
          >
            <Text style={[cs.pillTxt, cs.pillExamTxt]}>📌 Exam</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Days row */}
      <View style={cs.row}>
        {days.map((d, i) => (
          <View key={i} style={cs.dayCol}>
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
              d.hasExam && cs.dotExam,
            ]} />
          </View>
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

function daysUntil(ms: number): number {
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
  const nm = useMemo(() => StyleSheet.create({
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
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
  }), [t, typo])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={nm.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={nm.sheet}>
        {/* Handle */}
        <View style={nm.handle} />

        {/* Header */}
        <View style={nm.header}>
          <Text style={nm.title}>Notifications</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={nm.closeX}>✕</Text>
          </TouchableOpacity>
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
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(252,165,165,0.60)' }}
            thumbColor={enabled ? '#fca5a5' : 'rgba(255,255,255,0.55)'}
            ios_backgroundColor="rgba(255,255,255,0.15)"
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
  const { daysLeft, todayAccuracy, streakDays, weakTopics, firstTopicId, fullName, importantDayIndices, practiceDayIndices, focusedListings } = useHomeStats()
  const { sessionCount, streak } = useAnalytics('overall')
  const importantDays = new Set(importantDayIndices)
  const practiceDays  = new Set(practiceDayIndices)

  const { enabled: notifEnabled, schedule: scheduleNotifs, toggle: toggleNotifs } = useNotifications()
  const [showNotifModal, setShowNotifModal] = useState(false)
  const { phrase: kuyaMsg, onTap: onKuyaTap } = useAiCoach()

  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    root:  { flex: 1, backgroundColor: t.bg },
    scroll: { paddingBottom: 100 },
    inner: { paddingHorizontal: 16 },
    greetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 },
    greetTime: { fontSize: typo.sm, color: t.textTertiary, marginBottom: 2, fontFamily: 'Lexend_400Regular' },
    greetName: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.5, fontFamily: 'Outfit_700Bold' },
    iconBtn: { width: 40, height: 40, backgroundColor: t.surface2, borderRadius: 14, borderWidth: 1, borderColor: t.divider, alignItems: 'center', justifyContent: 'center' },
    headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    calendarWrap: { paddingVertical: 10 },
    kuyaCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: 22, padding: 14, marginBottom: 10 },
    kuyaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    kuyaAvatarLg: { width: 80, height: 80, borderRadius: 16, overflow: 'hidden', flexShrink: 0 },
    kuyaNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
    kuyaName: { fontSize: typo.md, fontWeight: '700', color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
    kuyaBadge: { marginLeft: 'auto', backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    kuyaBadgeText: { fontSize: typo.xs, fontWeight: '600', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
    kuyaText: { fontSize: typo.sm, color: t.textPrimary, lineHeight: 18, fontFamily: 'Lexend_400Regular' },
    statsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
    statCard: { flex: 1, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 10, alignItems: 'center' },
    statVal: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
    statLbl: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: 'Lexend_600SemiBold' },
    quickBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    quickIcon: { width: 32, height: 32, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    quickTitle: { fontSize: typo.sm, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    quickSub: { fontSize: typo.xs, color: 'rgba(255,255,255,0.65)', marginTop: 1, fontFamily: 'Lexend_400Regular' },
    chevron: { color: t.textTertiary, fontSize: 22 },
    secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, marginTop: 8 },
    secTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    weakCard:   { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    weakDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 1 },
    weakTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    weakName:   { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', flex: 1 },
    weakPct:    { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', flexShrink: 0, marginLeft: 8 },
    weakTrack:  { height: 3, backgroundColor: t.surface, borderRadius: 99, overflow: 'hidden' },
    weakBar:    { height: 3, borderRadius: 99 },
    empty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 8 },
    progressCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    progressTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    progressSub: { fontSize: typo.xs, color: t.textSecondary, marginTop: 1, fontFamily: 'Lexend_400Regular' },
    progressChevron: { color: t.textTertiary, fontSize: 20 },
    upcomingCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    upcomingIcon: { width: 36, height: 36, backgroundColor: t.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    upcomingTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    upcomingMeta: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    upcomingBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
    upcomingDays: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  }), [t, typo])

  useEffect(() => {
    if (focusedListings.length > 0) {
      void scheduleNotifs(focusedListings)
    }
  }, [focusedListings, scheduleNotifs])

  const quickTopicId = weakTopics[0]?.topicId ?? firstTopicId

  const now = Date.now()
  const upcomingDates = focusedListings
    .map(l => {
      const keyDate = l.type === 'exam'
        ? (l.examDate ?? l.deadline)
        : (l.deadline ?? l.examDate)
      const label = l.type === 'exam' ? 'Exam' : 'Deadline'
      return { ...l, keyDate, label }
    })
    .filter(l => l.keyDate != null && l.keyDate >= now)
    .sort((a, b) => (a.keyDate ?? 0) - (b.keyDate ?? 0))
    .slice(0, 4)

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Greeting row — ENLARGED */}
        <View style={s.greetRow}>
          <View>
            <Text style={s.greetTime}>{timeGreeting()}</Text>
            <Text style={s.greetName}>{fullName.split(' ')[0] || 'Student'}</Text>
          </View>
          <View style={s.headerBtns}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => setShowNotifModal(true)}
            >
              <Lineicons
                icon={notifEnabled ? Bell1Solid : Bell1Outlined}
                size={20}
                color={notifEnabled ? '#fca5a5' : t.textTertiary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings')}>
              <Lineicons icon={Gear1Outlined} size={20} color={t.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.inner}>

          {/* Kuya Baw AI Coach card — LARGER MASCOT */}
          <View style={s.kuyaCard}>
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
                </View>
                <Text style={s.kuyaText}>"{kuyaMsg}"</Text>
              </View>
            </View>
          </View>

          {/* 7-day calendar strip — MOVED BELOW AI COACH */}
          <View style={s.calendarWrap}>
            <CalendarStrip importantDays={importantDays} practiceDays={practiceDays} />
          </View>

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: '#fca5a5' }]}>{daysLeft ?? '—'}</Text>
              <Text style={s.statLbl}>DAYS LEFT</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{todayAccuracy !== null ? `${todayAccuracy}%` : '—'}</Text>
              <Text style={s.statLbl}>ACCURACY</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: '#fbbf24' }]}>{streakDays > 0 ? `${streakDays}🔥` : '—'}</Text>
              <Text style={s.statLbl}>STREAK</Text>
            </View>
          </View>

          {/* Mini progress card */}
          {sessionCount > 0 && (
            <TouchableOpacity
              style={s.progressCard}
              onPress={() => router.push('/(tabs)/analytics')}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.progressTitle}>My Progress</Text>
                <Text style={s.progressSub}>
                  {sessionCount} session{sessionCount !== 1 ? 's' : ''}{streak > 0 ? ` · ${streak}🔥 streak` : ''}
                </Text>
              </View>
              <Text style={s.progressChevron}>›</Text>
            </TouchableOpacity>
          )}

          {/* Quick Practice CTA */}
          {quickTopicId ? (
            <TouchableOpacity style={s.quickBtn} onPress={() => router.push(`/practice/${quickTopicId}`)}>
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
            </TouchableOpacity>
          ) : null}

          {/* Weak Areas */}
          <View style={s.secRow}>
            <Text style={s.secTitle}>Weak Areas</Text>
          </View>
          {weakTopics.length > 0 ? (
            <View style={{ gap: 6, marginBottom: 4 }}>
              {weakTopics.map(topic => {
                const color = weakTopicColor(topic.accuracy)
                return (
                  <TouchableOpacity
                    key={topic.topicId}
                    style={s.weakCard}
                    onPress={() => router.push(`/practice/${topic.topicId}`)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.weakDot, { backgroundColor: color }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.weakTopRow}>
                        <Text style={s.weakName} numberOfLines={1}>{topic.topicName}</Text>
                        <Text style={[s.weakPct, { color }]}>{topic.accuracy}%</Text>
                      </View>
                      <View style={s.weakTrack}>
                        <View style={[s.weakBar, { width: `${topic.accuracy}%` as any, backgroundColor: color }]} />
                      </View>
                    </View>
                    <Text style={s.chevron}>›</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : (
            <Text style={s.empty}>Start practicing to see weak areas</Text>
          )}

          {/* Upcoming Important Dates */}
          <View style={[s.secRow, { marginTop: 16 }]}>
            <Text style={s.secTitle}>Upcoming Dates</Text>
          </View>
          {upcomingDates.length > 0 ? (
            <View style={{ gap: 8, marginBottom: 4 }}>
              {upcomingDates.map(item => {
                const d = daysUntil(item.keyDate!)
                const dayColor = d < 14 ? '#f87171' : d < 30 ? '#fbbf24' : '#4ade80'
                return (
                  <View key={item.slug} style={s.upcomingCard}>
                    <View style={s.upcomingIcon}>
                      <Text style={{ fontSize: 16 }}>{item.type === 'exam' ? '📝' : '🎓'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.upcomingTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={s.upcomingMeta}>{item.label} · {formatShortDate(item.keyDate!)}</Text>
                    </View>
                    <View style={[s.upcomingBadge, { backgroundColor: `${dayColor}18`, borderColor: `${dayColor}40` }]}>
                      <Text style={[s.upcomingDays, { color: dayColor }]}>{d}d</Text>
                    </View>
                  </View>
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
      </ScrollView>

      <NotificationModal
        visible={showNotifModal}
        enabled={notifEnabled}
        onToggle={() => void toggleNotifs(focusedListings)}
        onClose={() => setShowNotifModal(false)}
      />
    </SafeAreaView>
  )
}



