import { useState, useMemo } from 'react'
import { StyleSheet, View, Text, Pressable, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { SchoolsDirectory } from '../../components/schools/SchoolsDirectory'

// ---------------------------------------------------------------------------
// Schools Directory screen — a thin wrapper around the shared SchoolsDirectory
// component (also embedded in the Lists → Universities tab). This screen owns
// the back bar + search input; the component owns the filters + card list.
// ---------------------------------------------------------------------------

export default function SchoolsDirectoryScreen() {
  const { theme: t, typo } = useTheme()
  const [query, setQuery] = useState('')

  const s = useMemo(() => StyleSheet.create({
    root:        { flex: 1, backgroundColor: t.bg },
    topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.md },
    backArrow:   { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    topTitle:    { flex: 1, fontSize: typo.h2, color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    subtitle:    { paddingHorizontal: spacing.lg, marginTop: -spacing.xs, marginBottom: spacing.sm, fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    searchWrap:  { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    searchInput: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: typo.base, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle}>Schools Directory</Text>
      </View>
      <Text style={s.subtitle}>Browse tertiary schools across the Philippines</Text>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or acronym..."
          placeholderTextColor={t.textTertiary}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <SchoolsDirectory query={query} />
    </SafeAreaView>
  )
}
