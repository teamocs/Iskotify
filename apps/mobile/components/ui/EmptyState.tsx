import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Button } from './Button'

interface Props {
  /** A Lineicons element (or brand artwork). Decorative. */
  icon?: React.ReactNode
  title: string
  body?: string
  /** One next step — at most one action. */
  actionLabel?: string
  onAction?: () => void
}

/** What to show when there is nothing yet, and the single thing to do about it. */
export function EmptyState({ icon, title, body, actionLabel, onAction }: Props) {
  const { theme: t } = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg, gap: spacing.md }}>
      {icon ? (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{
            width: 56, height: 56, borderRadius: radius.pill, backgroundColor: t.surface2,
            alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
          }}
        >
          {icon}
        </View>
      ) : null}
      <Text accessibilityRole="header" style={[textStyle('headline', t.textPrimary), { textAlign: 'center' }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[textStyle('body', t.textSecondary), { textAlign: 'center', maxWidth: 420 }]}>{body}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.sm }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  )
}
