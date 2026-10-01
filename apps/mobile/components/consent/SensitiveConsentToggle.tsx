import { View, Text, Switch } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { Card } from '../ui/Card'

export const SENSITIVE_TOGGLE_LABEL =
  'Use my grades and family details to match scholarships and estimate my admission score'

interface Props {
  value: boolean
  onChange: (next: boolean) => void
}

/**
 * The separate, default-OFF opt-in for grades, household income and Indigenous
 * Peoples status (sensitive personal information under RA 10173). Shown in
 * onboarding and wherever those fields are edited.
 */
export function SensitiveConsentToggle({ value, onChange }: Props) {
  const { theme: t } = useTheme()
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{SENSITIVE_TOGGLE_LABEL}</Text>
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
          Scholarships and the admission estimate need these details, and you can withdraw your consent anytime in your profile.
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={SENSITIVE_TOGGLE_LABEL}
        trackColor={{ false: t.inputBorder, true: t.accent }}
        thumbColor={t.surfaceRaised}
        ios_backgroundColor={t.inputBorder}
        {...({ activeThumbColor: t.surfaceRaised } as object)}
      />
    </Card>
  )
}
