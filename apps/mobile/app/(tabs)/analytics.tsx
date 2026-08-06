import { SafeAreaView } from 'react-native-safe-area-context'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { spacing } from '../../theme/tokens'

/**
 * Progress tab screen (Task G) — the "Progress" entry in the tab bar / desktop
 * sidebar. Same <AnalyticsDashboard /> also embedded read-only in Profile;
 * this is now its full-screen, directly-navigable home.
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
        <Text style={s.title}>Progress</Text>
        <Text style={s.subtitle}>Your practice performance, over time</Text>
      </View>
      <View style={s.dashWrap}>
        <AnalyticsDashboard />
      </View>
    </SafeAreaView>
  )
}
