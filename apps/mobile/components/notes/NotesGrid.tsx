import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, type Breakpoint } from '../../hooks/useBreakpoint'
import { Skeleton } from '../ui/Skeleton'
import { heading } from '../ui/a11y'

/** Note columns per size class: 1 on phones, 2 on tablets, 3 on desktop. */
export function noteColumns(bp: Breakpoint): 1 | 2 | 3 {
  if (bp === 'expanded') return 3
  if (bp === 'medium') return 2
  return 1
}

interface Props<T> {
  items: T[]
  keyOf: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  /** Force a column count (defaults to noteColumns(bp)). */
  columns?: number
}

/**
 * Masonry-ish grid: items are dealt left-to-right into N independent columns,
 * so cards of different heights pack without row gaps (1 column on phones).
 */
export function NotesGrid<T>({ items, keyOf, renderItem, columns }: Props<T>) {
  const bp = useBreakpoint()
  const n = columns ?? noteColumns(bp)
  const cols: T[][] = Array.from({ length: Math.min(n, Math.max(items.length, 1)) }, () => [])
  items.forEach((item, i) => cols[i % cols.length]!.push(item))

  return (
    <View testID="notes-grid" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      {cols.map((col, ci) => (
        <View key={ci} testID="notes-column" style={{ flex: 1, minWidth: 0, gap: spacing.md }}>
          {col.map(item => <View key={keyOf(item)}>{renderItem(item)}</View>)}
        </View>
      ))}
      {/* Keep column widths stable when there are fewer items than columns. */}
      {Array.from({ length: n - cols.length }, (_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
    </View>
  )
}

/** A level-2 section heading inside a notes page. */
export function NotesSectionHeading({ title }: { title: string }) {
  const { theme: t } = useTheme()
  return (
    <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { marginBottom: spacing.sm }]} maxFontSizeMultiplier={2}>
      {title}
    </Text>
  )
}

/** Loading placeholder for a notes page: one announced busy group. */
export function NotesSkeleton() {
  const bp = useBreakpoint()
  const n = noteColumns(bp)
  return (
    <View accessible accessibilityLabel="Loading notes" aria-busy style={{ flexDirection: 'row', gap: spacing.md }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ flex: 1, gap: spacing.md }}>
          <Skeleton height={i % 2 ? 96 : 140} radius={radius.lg} />
          <Skeleton height={i % 2 ? 140 : 96} radius={radius.lg} />
        </View>
      ))}
    </View>
  )
}
