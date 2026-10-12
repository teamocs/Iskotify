import { useState } from 'react'
import { View } from 'react-native'
import { Funnel1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { Screen } from '../../components/ui/Screen'
import { Text } from '../../components/ui/Text'
import { GlassIconButton } from '../../components/navigation/GlassIconButton'
import { SchoolsDirectory } from '../../components/schools/SchoolsDirectory'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { SearchField } from '../../components/explore/SearchField'

// ---------------------------------------------------------------------------
// Schools directory screen — a thin host for the shared SchoolsDirectory
// (also embedded in Explore → Schools & exams). This screen owns the top bar,
// its Filters button and the search field; the component owns the filter
// sheet, the list and its states.
// ---------------------------------------------------------------------------

export default function SchoolsDirectoryScreen() {
  const { theme: t } = useTheme()
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterCount, setFilterCount] = useState(0)

  return (
    <Screen
      scroll={false}
      width="wide"
      header={(
        <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          <DetailTopBar
            bare
            title="Schools directory"
            fallbackHref="/explore?section=universities"
            actions={(
              <GlassIconButton
                testID="schools-filters"
                icon={Funnel1Outlined}
                accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} on` : 'Filters'}
                accessibilityHint="Filter schools by type, region and free tuition"
                onPress={() => setFiltersOpen(true)}
              />
            )}
          />
          <Text role="footnote" color={t.textSecondary}>
            Tertiary schools across the Philippines
          </Text>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or acronym"
            accessibilityLabel="Search schools"
          />
        </View>
      )}
    >
      <SchoolsDirectory
        query={query}
        onClearQuery={() => setQuery('')}
        filtersOpen={filtersOpen}
        onCloseFilters={() => setFiltersOpen(false)}
        onFilterCountChange={setFilterCount}
      />
    </Screen>
  )
}
