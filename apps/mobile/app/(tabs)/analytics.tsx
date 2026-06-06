import { SafeAreaView } from 'react-native-safe-area-context'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard'

/**
 * Analytics tab screen — hidden from the tab bar (href:null in _layout.tsx).
 * Content has been moved into the Profile screen via <AnalyticsDashboard />.
 * This thin wrapper keeps the route alive for any direct navigations.
 */
export default function AnalyticsScreen() {
  const { theme: t, typo } = useTheme()
  const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    dashWrap: { flex: 1, paddingHorizontal: 16 },
  })
  return (
    <SafeAreaView style={s.root}>
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
