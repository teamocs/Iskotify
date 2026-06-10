/**
 * CalendarStrip — extracted from app/(tabs)/index.tsx.
 *
 * Self-contained week-strip calendar with prev/next week navigation,
 * dot indicators for practice days, reminders, and important exam dates,
 * and pill shortcuts to jump to today or the nearest upcoming exam.
 *
 * Helpers retained in index.tsx (greeting-side): phHour, timeGreeting.
 * Helpers duplicated/moved here: DAY_LETTERS (standalone constant).
 * index.tsx no longer imports or renders this component.
 */

import { useState, useMemo } from 'react'
import { StyleSheet, View, Text, Pressable } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function CalendarStrip({
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
