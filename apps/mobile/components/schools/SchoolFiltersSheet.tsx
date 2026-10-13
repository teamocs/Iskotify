import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { FilterChip } from '../ui/Chip'
import { InsetGroup, InsetRow } from '../ui/InsetGroup'
import { Text } from '../ui/Text'
import { heading } from '../ui/a11y'
import { activeFilterCount, type SchoolFilters } from './schoolModel'

interface Props {
  visible: boolean
  onClose: () => void
  filters: SchoolFilters
  onChange: (next: SchoolFilters) => void
  /** Type buckets present in the data, in display order. */
  types: readonly string[]
  /** Regions present in the data, sorted. */
  regions: readonly string[]
  /** Schools that match the current filters (and search), for the Done label. */
  resultCount: number
}

function GroupHeading({ children }: { children: string }) {
  const { theme: t } = useTheme()
  return (
    <Text role="footnote" color={t.textSecondary} {...heading(3)} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
      {children}
    </Text>
  )
}

/**
 * The schools directory's filters on the P3 in-place Sheet (opened from the
 * Filters button in Explore's header and the directory screen's top bar):
 * a Free tuition switch row, then the school type and the region, each one of
 * a group (radio chips; "All …" is the way back). Every change applies at
 * once; Done closes and says how many schools now show.
 */
export function SchoolFiltersSheet({ visible, onClose, filters, onChange, types, regions, resultCount }: Props) {
  const set = (patch: Partial<SchoolFilters>) => onChange({ ...filters, ...patch })
  const on = activeFilterCount(filters)

  return (
    <Sheet
      visible={visible}
      title="Filter schools"
      onClose={onClose}
      footer={(
        <View style={{ gap: spacing.xs }}>
          <Button
            label={`Show ${resultCount} school${resultCount === 1 ? '' : 's'}`}
            fullWidth
            onPress={onClose}
          />
          {on > 0 ? (
            <Button
              label="Clear filters"
              variant="ghost"
              fullWidth
              onPress={() => onChange({ freeTuitionOnly: false, type: null, region: null })}
            />
          ) : null}
        </View>
      )}
    >
      <InsetGroup inset={false}>
        <InsetRow
          title="Free tuition"
          subtitle="SUCs, LUCs and schools with free tuition on record (RA 10931)"
          switchValue={filters.freeTuitionOnly}
          onSwitchChange={v => set({ freeTuitionOnly: v })}
        />
      </InsetGroup>

      <GroupHeading>School type</GroupHeading>
      <View accessibilityRole="radiogroup" accessibilityLabel="School type" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <FilterChip label="All types" selected={filters.type === null} onPress={() => set({ type: null })} />
        {types.map(tp => (
          <FilterChip key={tp} label={tp} selected={filters.type === tp} onPress={() => set({ type: tp })} />
        ))}
      </View>

      <GroupHeading>Region</GroupHeading>
      {/* bounded: ~17 PH regions */}
      <View accessibilityRole="radiogroup" accessibilityLabel="Region" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <FilterChip label="All regions" selected={filters.region === null} onPress={() => set({ region: null })} />
        {regions.map(r => (
          <FilterChip key={r} label={r} selected={filters.region === r} onPress={() => set({ region: r })} />
        ))}
      </View>
    </Sheet>
  )
}
