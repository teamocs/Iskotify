import { useCallback, type ReactElement } from 'react'
import { FlatList, View, type ListRenderItemInfo, type StyleProp, type ViewStyle, type FlatListProps } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Skeleton } from '../ui/Skeleton'
import { exploreColumns } from './exploreModel'

// Half the gutter sits on each side of a cell; the list pulls back by the
// same amount, so the outer edges stay flush with the page column.
const HALF_GAP = spacing.sm / 2

interface Props<T> {
  data: readonly T[]
  keyExtractor: (item: T) => string
  /** Render one cell. Keep it memoised: the grid virtualises long lists. */
  renderItem: (item: T) => ReactElement
  ListHeaderComponent?: ReactElement | null
  ListEmptyComponent?: ReactElement | null
  ListFooterComponent?: ReactElement | null
  refreshControl?: FlatListProps<T>['refreshControl']
  contentContainerStyle?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * Explore's responsive listing grid: one column on phones, two on tablets,
 * three on desktop (exploreColumns). A virtualised FlatList throughout — the
 * schools directory alone is ~727 rows — with stable keys from the caller.
 * Changing the column count remounts the list (FlatList requires it).
 */
export function ExploreGrid<T>({
  data, keyExtractor, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent,
  refreshControl, contentContainerStyle, testID = 'explore-grid',
}: Props<T>) {
  const cols = exploreColumns(useBreakpoint())

  const renderCell = useCallback(({ item }: ListRenderItemInfo<T>) => (
    <View style={{ width: `${100 / cols}%`, paddingHorizontal: HALF_GAP, paddingBottom: spacing.sm }}>
      {renderItem(item)}
    </View>
  ), [cols, renderItem])

  return (
    <FlatList
      key={`cols-${cols}`}
      testID={testID}
      data={data as T[]}
      numColumns={cols}
      keyExtractor={keyExtractor}
      renderItem={renderCell}
      ListHeaderComponent={ListHeaderComponent}
      ListHeaderComponentStyle={{ paddingHorizontal: HALF_GAP }}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      ListFooterComponentStyle={{ paddingHorizontal: HALF_GAP }}
      refreshControl={refreshControl}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={9}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={[{ marginHorizontal: -HALF_GAP }, contentContainerStyle]}
    />
  )
}

/**
 * The same column rhythm for a SHORT pinned group inside a list header (the
 * handful of entrance exams, a student's target courses). Not virtualised:
 * use it only for bounded groups; long lists go through ExploreGrid.
 */
export function StaticGrid<T>({ items, keyExtractor, renderItem }: {
  items: readonly T[]
  keyExtractor: (item: T) => string
  renderItem: (item: T) => ReactElement
}) {
  const cols = exploreColumns(useBreakpoint())
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -HALF_GAP }}>
      {items.map(item => (
        <View key={keyExtractor(item)} style={{ width: `${100 / cols}%`, paddingHorizontal: HALF_GAP, paddingBottom: spacing.sm }}>
          {renderItem(item)}
        </View>
      ))}
    </View>
  )
}

/**
 * Placeholder cards in the grid's shape while a section loads. Announced once,
 * as busy, with a label naming what is loading; the blocks themselves are silent.
 */
export function GridSkeleton({ label, count = 6, testID = 'explore-skeleton' }: { label: string; count?: number; testID?: string }) {
  const { theme: t } = useTheme()
  const cols = exploreColumns(useBreakpoint())
  const cells = Array.from({ length: Math.max(count, cols) }, (_, i) => i)

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      aria-busy
      style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -HALF_GAP }}
    >
      {cells.map(i => (
        <View key={i} style={{ width: `${100 / cols}%`, paddingHorizontal: HALF_GAP, paddingBottom: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row', gap: spacing.md, padding: spacing.lg, minHeight: 88,
              borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border,
              backgroundColor: t.surface,
            }}
          >
            <Skeleton width={40} height={40} radius={radius.sm} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Skeleton width="80%" height={16} />
              <Skeleton width="55%" height={12} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}
