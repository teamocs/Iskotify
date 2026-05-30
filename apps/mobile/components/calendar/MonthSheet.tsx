import { useState, useMemo } from 'react'
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined, XmarkOutlined } from '@lineiconshq/free-icons'

const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MAX_BACK_MONTHS = 24
const MAX_FORWARD_MONTHS = 24

export interface MonthCell {
  date: Date         // local-time midnight of the cell
  inMonth: boolean   // true if this cell belongs to the displayed month
  dayIndex: number   // floor(timestamp / 86_400_000)
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
      dayIndex: Math.floor(date.getTime() / 86_400_000),
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
  const { theme: t, typo } = useTheme()
  const today = useMemo(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth(), dayIndex: Math.floor(d.getTime() / 86_400_000) }
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
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%' },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginVertical: 8 },
    header: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: t.textPrimary, fontSize: typo.lg, fontWeight: '700' },
    arrowBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    todayPill: { backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
    todayTxt: { color: t.textSecondary, fontSize: typo.xs, fontWeight: '600' },
    weekdayRow: { flexDirection: 'row', paddingHorizontal: 8, marginBottom: 4 },
    weekdayCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
    weekdayTxt: { color: t.textTertiary, fontSize: typo.xs, fontWeight: '600' },
    gridRow: { flexDirection: 'row', paddingHorizontal: 8 },
    cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    cellNum: { color: t.textPrimary, fontSize: typo.sm, fontWeight: '600' },
    cellNumMuted: { color: t.textTertiary },
    todayCircle: { backgroundColor: t.textPrimary, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    todayNum: { color: t.bg },
    dotsRow: { flexDirection: 'row', gap: 2, position: 'absolute', bottom: 4 },
    dot: { width: 4, height: 4, borderRadius: 2 },
    dotExam: { backgroundColor: t.accentText },
    dotReminder: { backgroundColor: '#fbbf24' },
    dotPractice: { backgroundColor: '#60a5fa' },
    closeBtn: { padding: 6 },
  }), [t, typo])

  const rows: MonthCell[][] = []
  for (let r = 0; r < 6; r++) rows.push(grid.slice(r * 7, r * 7 + 7))

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable style={styles.arrowBtn} onPress={() => jumpMonths(-1)} accessibilityLabel="Previous month">
                <Lineicons icon={ChevronLeftOutlined} size={20} color={t.textSecondary} />
              </Pressable>
              <Text style={styles.headerTitle}>{monthLabel}</Text>
              <Pressable style={styles.arrowBtn} onPress={() => jumpMonths(1)} accessibilityLabel="Next month">
                <View style={{ transform: [{ scaleX: -1 }] }}>
                  <Lineicons icon={ChevronLeftOutlined} size={20} color={t.textSecondary} />
                </View>
              </Pressable>
              <Pressable style={styles.todayPill} onPress={jumpToToday}>
                <Text style={styles.todayTxt}>Today</Text>
              </Pressable>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close month sheet">
              <Lineicons icon={XmarkOutlined} size={18} color={t.textTertiary} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {DAY_LETTERS.map(l => (
              <View key={l} style={styles.weekdayCell}>
                <Text style={styles.weekdayTxt}>{l}</Text>
              </View>
            ))}
          </View>

          <ScrollView>
            {rows.map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map(cell => {
                  const isToday = cell.dayIndex === today.dayIndex
                  const hasExam = importantDays.has(cell.dayIndex)
                  const hasReminder = reminderDays.has(cell.dayIndex)
                  const hasPractice = practiceDays.has(cell.dayIndex)
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
                          <Text style={[styles.cellNum, styles.todayNum]}>{cell.date.getDate()}</Text>
                        </View>
                      ) : (
                        <Text style={[styles.cellNum, !cell.inMonth && styles.cellNumMuted]}>
                          {cell.date.getDate()}
                        </Text>
                      )}
                      <View style={styles.dotsRow}>
                        {hasExam && <View style={[styles.dot, styles.dotExam]} />}
                        {hasReminder && <View style={[styles.dot, styles.dotReminder]} />}
                        {hasPractice && <View style={[styles.dot, styles.dotPractice]} />}
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
