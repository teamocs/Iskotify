import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { useAdmissionEstimate } from '../../hooks/useAdmissionEstimate'
import { estimateSummaryLabel } from '../../utils/estimateSummary'

/**
 * Compact Estimated Admission Score entry point for the Home screen. Reads
 * the same on-device hook the full results screen uses (hooks/useAdmissionEstimate)
 * so this never duplicates the settings/attempts/cutoffs pipeline — computing
 * from data the app already loaded locally, no network involved.
 */
export function AdmissionEstimateCard() {
  const { theme: t, typo } = useTheme()
  const { status, readiness, result } = useAdmissionEstimate()

  const label = estimateSummaryLabel({ status, readiness, result })

  return (
    <Pressable
      onPress={() => router.push('/estimator')}
      accessibilityRole="button"
      accessibilityLabel="Estimated Admission Score"
      style={({ pressed }) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        boxShadow: t.shadowSm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        minHeight: 44,
      }, pressed && { opacity: 0.8 }]}
    >
      <View style={{
        width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous',
        backgroundColor: t.accentSurface, alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 18 }} maxFontSizeMultiplier={1.4}>🎯</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textPrimary }}
          maxFontSizeMultiplier={1.4}
        >
          Estimated Admission Score
        </Text>
        <Text
          style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginTop: 1 }}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 20, color: t.textTertiary }} maxFontSizeMultiplier={1.4}>›</Text>
    </Pressable>
  )
}
