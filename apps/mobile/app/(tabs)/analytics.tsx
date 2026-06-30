import { SafeAreaView } from 'react-native-safe-area-context'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { spacing } from '../../theme/tokens'

/**
 * Analytics tab screen — hidden from the tab bar (href:null in _layout.tsx).
 * Content has been moved into the Profile screen via <AnalyticsDashboard />.
 * This thin wrapper keeps the route alive for any direct navigations.
 */
export default function AnalyticsScreen() {
  const { theme: t, typo } = useTheme()
  const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
    title: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.5, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.sm, color: t.textTertiary, marginTop: spacing.xs, fontFamily: 'Lexend_400Regular' },
    dashWrap: { flex: 1, paddingHorizontal: spacing.lg },
  })
  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.header}>
        <Text style={s.title}>Analytics</Text>
        <Text style={s.subtitle}>Your practice progress</Text>
      </View>
      <View style={s.dashWrap}>
        <AnalyticsDashboard />
      </View>
    </SafeAreaView>
  )
}
