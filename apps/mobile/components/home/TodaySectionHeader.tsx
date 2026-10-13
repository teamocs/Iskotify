import { Pressable, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { Text } from '../ui/Text'
import { focusRing, heading, type WebPressableState } from '../ui/a11y'

interface Props {
  title: string
  /** Quiet trailing note, e.g. "1 of 3" (spoken as `metaLabel` when given). */
  meta?: string
  metaLabel?: string
  /** Trailing text action, e.g. "See all". */
  actionLabel?: string
  actionAccessibilityLabel?: string
  onAction?: () => void
}

/**
 * A Today section title (title3, a level-2 heading) over its inset group,
 * with an optional count or text action on the trailing edge. The row grows
 * with Dynamic Type (minHeight, never height).
 */
export function TodaySectionHeader({ title, meta, metaLabel, actionLabel, actionAccessibilityLabel, onAction }: Props) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
        minHeight: 32, marginBottom: spacing.sm, paddingHorizontal: spacing.xs,
      }}
    >
      <Text role="title3" {...heading(2)} style={{ flexShrink: 1 }}>{title}</Text>
      {meta ? (
        <Text role="subheadline" color={t.textSecondary} accessibilityLabel={metaLabel}>{meta}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          style={(state) => {
            const { pressed, focused } = state as WebPressableState
            return [{ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 }, focusRing(t.focusRing, focused)]
          }}
        >
          <Text role="subheadline" color={t.accentText} style={{ fontWeight: '600' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
