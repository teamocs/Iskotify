import { useState } from 'react'
import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { Screen } from '../../components/ui/Screen'
import { SchoolsDirectory } from '../../components/schools/SchoolsDirectory'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { SearchField } from '../../components/explore/SearchField'

// ---------------------------------------------------------------------------
// Schools directory screen — a thin host for the shared SchoolsDirectory
// (also embedded in Explore → Schools & exams). This screen owns the top bar
// and the search field; the component owns filters, grid and states.
// ---------------------------------------------------------------------------

export default function SchoolsDirectoryScreen() {
  const { theme: t } = useTheme()
  const [query, setQuery] = useState('')

  return (
    <Screen
      scroll={false}
      width="wide"
      header={(
        <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
          <DetailTopBar bare title="Schools directory" fallbackHref="/explore?section=universities" />
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>
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
      <SchoolsDirectory query={query} onClearQuery={() => setQuery('')} />
    </Screen>
  )
}
