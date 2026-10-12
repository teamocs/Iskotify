import { useCallback, type ReactElement } from 'react'
import { StyleSheet, View, type ListRenderItemInfo, type StyleProp, type ViewStyle, type FlatListProps } from 'react-native'
import Animated, { useAnimatedRef } from 'react-native-reanimated'
import { useScrollToTopOnReselect, useTabBarScrollHandler } from '../navigation/TabBarScrollContext'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, type Theme } from '../../theme/tokens'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Skeleton } from '../ui/Skeleton'
import { decorative } from '../ui/a11y'
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
 * The cell around one row. One column (phones): the rows sit on one inset
 * grouped panel — the first rounds the top corners, the last the bottom, a
 * hairline (inset to the text) between them — the iOS grouped list, built
 * per cell so the list can stay virtualised. Several columns (tablet,
 * desktop): each row is its own rounded tile.
 */
function cellStyle(t: Theme, cols: number, index: number, count: number): ViewStyle {
  const panel: ViewStyle = { backgroundColor: t.surface, borderCurve: 'continuous', overflow: 'hidden' }
  if (cols > 1) return { ...panel, flex: 1, borderRadius: radius.group }
  return {
    ...panel,
    borderTopLeftRadius: index === 0 ? radius.group : 0,
    borderTopRightRadius: index === 0 ? radius.group : 0,
    borderBottomLeftRadius: index === count - 1 ? radius.group : 0,
    borderBottomRightRadius: index === count - 1 ? radius.group : 0,
  }
}

function GroupedCell({ cols, index, count, children }: { cols: number; index: number; count: number; children: ReactElement }) {
  const { theme: t } = useTheme()
  const single = cols === 1
  return (
    <View
      style={{
        width: `${100 / cols}%`,
        paddingHorizontal: HALF_GAP,
        paddingBottom: single ? (index === count - 1 ? spacing.sm : 0) : spacing.sm,
      }}
    >
      <View testID="explore-cell" style={cellStyle(t, cols, index, count)}>
        {children}
        {single && index < count - 1 ? (
          <View
            testID="explore-cell-separator"
            {...decorative}
            style={{
              position: 'absolute', bottom: 0, right: 0, left: spacing.lg + 44 + spacing.md,
              height: StyleSheet.hairlineWidth, backgroundColor: t.divider,
            }}
          />
        ) : null}
      </View>
    </View>
  )
}

/**
 * Explore's responsive listing grid: one grouped column on phones, two
 * columns of tiles on tablets, three on desktop (exploreColumns). A
 * virtualised FlatList throughout — the schools directory alone is ~727 rows
 * — with stable keys from the caller. Changing the column count remounts the
 * list (FlatList requires it).
 */
export function ExploreGrid<T>({
  data, keyExtractor, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent,
  refreshControl, contentContainerStyle, testID = 'explore-grid',
}: Props<T>) {
  const cols = exploreColumns(useBreakpoint())
  const onScroll = useTabBarScrollHandler()
  const listRef = useAnimatedRef<Animated.FlatList<T>>()
  useScrollToTopOnReselect(listRef)
  const count = data.length

  const renderCell = useCallback(({ item, index }: ListRenderItemInfo<T>) => (
    <GroupedCell cols={cols} index={index} count={count}>{renderItem(item)}</GroupedCell>
  ), [cols, count, renderItem])

  return (
    <Animated.FlatList
      ref={listRef}
      // Feeds the floating tab bar (minimize on scroll); re-pressing Explore
      // scrolls this list to the top.
      onScroll={onScroll}
      scrollEventThrottle={16}
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
 * The same grouped rhythm for a SHORT pinned group inside a list header (the
 * handful of entrance exams, a student's target courses, search results).
 * Not virtualised: use it only for bounded groups; long lists go through
 * ExploreGrid.
 */
export function StaticGrid<T>({ items, keyExtractor, renderItem, testID }: {
  items: readonly T[]
  keyExtractor: (item: T) => string
  renderItem: (item: T) => ReactElement
  testID?: string
}) {
  const cols = exploreColumns(useBreakpoint())
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -HALF_GAP }}>
      {items.map((item, i) => (
        <GroupedCell key={keyExtractor(item)} cols={cols} index={i} count={items.length}>{renderItem(item)}</GroupedCell>
      ))}
    </View>
  )
}

/**
 * Placeholder rows in the grid's shape while a section loads. Announced once,
 * as busy, with a label naming what is loading; the blocks themselves are silent.
 */
export function GridSkeleton({ label, count = 6, testID = 'explore-skeleton' }: { label: string; count?: number; testID?: string }) {
  const { theme: t } = useTheme()
  const cols = exploreColumns(useBreakpoint())
  const n = Math.max(count, cols)
  const cells = Array.from({ length: n }, (_, i) => i)

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      aria-busy
      style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -HALF_GAP }}
    >
      {cells.map(i => (
        <View key={i} style={{ width: `${100 / cols}%`, paddingHorizontal: HALF_GAP, paddingBottom: cols === 1 ? 0 : spacing.sm }}>
          <View
            style={[
              cellStyle(t, cols, i, n),
              { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 72 },
            ]}
          >
            <Skeleton width={44} height={44} radius={radius.field} />
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
