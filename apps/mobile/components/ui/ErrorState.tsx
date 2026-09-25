import { View, Text } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CloudRefreshClockwiseOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Button } from './Button'

interface Props {
  title?: string
  body?: string
  onRetry: () => void
  retryLabel?: string
}

/**
 * A load failure, said plainly, with a retry. Calm, not alarming: patchy data
 * is normal for our students, and their saved progress is not at risk.
 */
export function ErrorState({
  title = "Couldn't load this right now",
  body = 'Check your connection, then try again. Your saved progress is safe.',
  onRetry,
  retryLabel = 'Try again',
}: Props) {
  const { theme: t } = useTheme()
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.md }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          width: 56, height: 56, borderRadius: radius.pill, backgroundColor: t.warningSurface,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Lineicons icon={CloudRefreshClockwiseOutlined} size={26} color={t.warningStrong} />
      </View>
      {/* The title carries the alert role so the retry button stays separately focusable. */}
      <Text accessibilityRole="alert" style={[textStyle('titleSm', t.textPrimary), { textAlign: 'center' }]}>{title}</Text>
      <Text style={[textStyle('bodySm', t.textSecondary), { textAlign: 'center', maxWidth: 420 }]}>{body}</Text>
      <Button label={retryLabel} variant="secondary" onPress={onRetry} />
    </View>
  )
}
