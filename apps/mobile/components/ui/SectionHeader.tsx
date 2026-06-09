import { View, Text, Pressable } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'

interface Props {
  title: string
  /** Optional trailing action (e.g. "See all", "+ Add"). */
  actionLabel?: string
  onAction?: () => void
}

/** Consistent section title row with an optional trailing text action. */
export function SectionHeader({ title, actionLabel, onAction }: Props) {
  const { theme: t, typo } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
      <Text style={{ fontSize: typo.md, fontFamily: 'Outfit_700Bold', color: t.textPrimary }}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text style={{ fontSize: typo.sm, fontFamily: 'Lexend_500Medium', color: t.accentText }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
