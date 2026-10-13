import { useState, useMemo } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { radius, spacing } from '../../theme/tokens'
import { localDayIndexOfDate } from '../../utils/localDay'
import { Sheet } from '../ui/Sheet'
import { Text } from '../ui/Text'
import { decorative } from '../ui/a11y'

const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MAX_BACK_MONTHS = 24
const MAX_FORWARD_MONTHS = 24

export interface MonthCell {
  date: Date         // local-time midnight of the cell
  inMonth: boolean   // true if this cell belongs to the displayed month
  dayIndex: number   // LOCAL calendar-day index (matches the practice-day buckets)
}

/**
 * Build a 6×7 = 42-cell grid for the given (year, monthZeroIndexed).
 * Leading/trailing cells from neighbour months fill the rectangle.
 */
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const firstOfMonth = new Date(year, month, 1)
  const firstWeekday = firstOfMonth.getDay() // 0 = Sunday
  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - firstWeekday
    const date = new Date(year, month, 1 + dayOffset)
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      dayIndex: localDayIndexOfDate(date),
    })
  }
  return cells
}

interface Props {
  visible: boolean
  onClose: () => void
  onDayPress: (dayStartMs: number) => void
  importantDays: Set<number>      // exams + deadlines (day indices)
  reminderDays: Set<number>       // note reminders (day indices)
  practiceDays: Set<number>       // user practice activity (day indices)
}

export function MonthSheet({ visible, onClose, onDayPress, importantDays, reminderDays, practiceDays }: Props) {
  const { theme: t } = useTheme()
  const today = useMemo(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth(), dayIndex: localDayIndexOfDate(d) }
  }, [])
  const [year, setYear] = useState(today.y)
  const [month, setMonth] = useState(today.m)

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])
  const monthLabel = useMemo(() =>
    new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [year, month]
  )

  function jumpMonths(delta: number) {
    const target = new Date(year, month + delta, 1)
    const monthsFromToday = (target.getFullYear() - today.y) * 12 + (target.getMonth() - today.m)
    if (monthsFromToday < -MAX_BACK_MONTHS || monthsFromToday > MAX_FORWARD_MONTHS) return
    setYear(target.getFullYear())
    setMonth(target.getMonth())
  }

  function jumpToToday() {
    setYear(today.y)
    setMonth(today.m)
  }

  const styles = useMemo(() => StyleSheet.create({
    nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
    arrowBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    todayPill: {
      marginLeft: 'auto', minHeight: 32, justifyContent: 'center',
      backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: radius.capsule, paddingHorizontal: spacing.md,
    },
    weekdayRow: { flexDirection: 'row', marginBottom: spacing.xs },
    weekdayCell: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
    gridRow: { flexDirection: 'row' },
    cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    todayCircle: { backgroundColor: t.textPrimary, minWidth: 28, minHeight: 28, borderRadius: radius.capsule, alignItems: 'center', justifyContent: 'center' },
    dotsRow: { flexDirection: 'row', gap: 2, position: 'absolute', bottom: 4 },
    dot: { width: 4, aspectRatio: 1, borderRadius: 2 },
    dotExam: { backgroundColor: t.accentText },
    dotReminder: { backgroundColor: t.warning },
    dotPractice: { backgroundColor: '#60a5fa' },
  }), [t])

  const rows: MonthCell[][] = []
  for (let r = 0; r < 6; r++) rows.push(grid.slice(r * 7, r * 7 + 7))

  return (
    <Sheet visible={visible} title={monthLabel} onClose={onClose} closeLabel="Close month sheet">
      <View style={styles.nav}>
        <Pressable style={styles.arrowBtn} onPress={() => jumpMonths(-1)} accessibilityRole="button" accessibilityLabel="Previous month">
          <View {...decorative}>
            <Lineicons icon={ChevronLeftOutlined} size={20} color={t.textSecondary} />
          </View>
        </Pressable>
        <Pressable style={styles.arrowBtn} onPress={() => jumpMonths(1)} accessibilityRole="button" accessibilityLabel="Next month">
          <View {...decorative} style={{ transform: [{ scaleX: -1 }] }}>
            <Lineicons icon={ChevronLeftOutlined} size={20} color={t.textSecondary} />
          </View>
        </Pressable>
        <Pressable style={styles.todayPill} onPress={jumpToToday} accessibilityRole="button">
          <Text role="footnote" color={t.textSecondary} style={{ fontWeight: '600' }}>Today</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {DAY_LETTERS.map(l => (
          <View key={l} style={styles.weekdayCell}>
            <Text role="caption" color={t.textTertiary} style={{ fontWeight: '600' }}>{l}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map(cell => {
            const isToday = cell.dayIndex === today.dayIndex
            const hasExam = importantDays.has(cell.dayIndex)
            const hasReminder = reminderDays.has(cell.dayIndex)
            const hasPractice = practiceDays.has(cell.dayIndex)
            const num = String(cell.date.getDate())
            return (
              <Pressable
                key={cell.date.getTime()}
                style={styles.cell}
                onPress={() => onDayPress(cell.date.getTime())}
                accessibilityLabel={`Day ${cell.date.getDate()}`}
                accessibilityRole="button"
              >
                {isToday ? (
                  <View style={styles.todayCircle}>
                    <Text role="subheadline" color={t.bg} maxFontSizeMultiplier={1.4} style={{ fontWeight: '600' }}>{num}</Text>
                  </View>
                ) : (
                  <Text role="subheadline" color={cell.inMonth ? t.textPrimary : t.textTertiary} maxFontSizeMultiplier={1.4} style={{ fontWeight: '600' }}>
                    {num}
                  </Text>
                )}
                <View style={styles.dotsRow} {...decorative}>
                  {hasExam && <View style={[styles.dot, styles.dotExam]} />}
                  {hasReminder && <View style={[styles.dot, styles.dotReminder]} />}
                  {hasPractice && <View style={[styles.dot, styles.dotPractice]} />}
                </View>
              </Pressable>
            )
          })}
        </View>
      ))}
    </Sheet>
  )
}
