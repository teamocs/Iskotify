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
import { StyleSheet, View, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined, Flag1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { localDayIndex } from '../../utils/localDay'
import { Text } from '../ui/Text'
import { decorative } from '../ui/a11y'

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
  const { theme: t } = useTheme()
  const cs = useMemo(() => StyleSheet.create({
    container: { paddingVertical: 6 },
    navRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
    navLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 980, paddingHorizontal: 10, paddingVertical: 3 },
    pillExam: { backgroundColor: 'rgba(252,165,165,0.12)', borderColor: 'rgba(252,165,165,0.30)' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    dayCol: { alignItems: 'center', gap: 3, flex: 1 },
    circle: { width: 28, minHeight: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    circleToday: { backgroundColor: t.textPrimary },
    circleExam: { borderWidth: 1.5, borderColor: t.accentText },
    dot: { width: 4, aspectRatio: 1, borderRadius: 2, backgroundColor: 'transparent' },
    dotActive: { backgroundColor: '#60a5fa' },
    dotReminder: { backgroundColor: t.warning },
    dotExam: { backgroundColor: t.accentText },
  }), [t])

  const [weekOffset, setWeekOffset] = useState(0)

  // Local calendar day (not the UTC day): matches the practice-day buckets.
  const todayDay = localDayIndex(Date.now())
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
            <View {...decorative}>
              <Lineicons icon={ChevronLeftOutlined} size={18} color={t.textSecondary} />
            </View>
          </Pressable>
          <Pressable onPress={onHeaderPress} accessibilityRole="button" accessibilityLabel="Open full month calendar">
            <Text role="subheadline" maxFontSizeMultiplier={1.4} style={{ fontWeight: '700', minWidth: 90, textAlign: 'center' }}>{monthLabel}</Text>
          </Pressable>
          <Pressable
            onPress={() => setWeekOffset(w => w + 1)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <View {...decorative} style={{ transform: [{ scaleX: -1 }] }}>
              <Lineicons icon={ChevronLeftOutlined} size={18} color={t.textSecondary} />
            </View>
          </Pressable>
        </View>

        {showToday ? (
          <Pressable
            onPress={() => setWeekOffset(0)}
            style={({ pressed }) => [cs.pill, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text role="caption" color={t.textSecondary} style={{ fontWeight: '600' }}>Today</Text>
          </Pressable>
        ) : null}
        {showNextExam && examWeekOffset != null ? (
          <Pressable
            onPress={() => setWeekOffset(examWeekOffset)}
            style={({ pressed }) => [cs.pill, cs.pillExam, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <View {...decorative}>
              <Lineicons icon={Flag1Outlined} size={12} color={t.accentText} />
            </View>
            <Text role="caption" color={t.accentText} style={{ fontWeight: '600' }}>Exam</Text>
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
            <Text role="caption" color={d.isToday ? t.accentText : t.textTertiary} maxFontSizeMultiplier={1.4} style={{ fontWeight: '600' }}>
              {d.dayLetter}
            </Text>
            <View style={[
              cs.circle,
              d.isToday && cs.circleToday,
              d.hasExam && !d.isToday && cs.circleExam,
            ]}>
              <Text role="caption" color={d.isToday ? t.bg : t.textSecondary} maxFontSizeMultiplier={1.4} style={{ fontWeight: '700' }}>
                {String(d.dayNum)}
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
