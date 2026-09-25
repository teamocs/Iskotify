import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { User4Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius } from '../../theme/tokens'

/** "Juan Dela Cruz" → "JC" (first + last word), "maria" → "M". */
export function initialsFor(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0]!.charAt(0)
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : ''
  return (first + last).toUpperCase()
}

interface Props {
  name?: string | null
  size?: number
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
}

/**
 * Initials in an accent-tinted circle (accentText on accentSurface: 6.19:1
 * light, 8.81:1 dark). A pressable avatar keeps a 44pt target even when the
 * circle is drawn smaller.
 */
export function Avatar({ name, size = 36, onPress, accessibilityLabel, accessibilityHint }: Props) {
  const { theme: t } = useTheme()
  const initials = initialsFor(name)
  const circle = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: t.accentSurface,
        borderWidth: 1,
        borderColor: t.accentBorder,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {initials ? (
        <Text
          style={{ fontFamily: fonts.heading, fontSize: Math.max(12, Math.round(size * 0.38)), color: t.accentText }}
          maxFontSizeMultiplier={1}
        >
          {initials}
        </Text>
      ) : (
        <View testID="avatar-fallback-icon">
          <Lineicons icon={User4Outlined} size={Math.round(size * 0.5)} color={t.accentText} />
        </View>
      )}
    </View>
  )

  if (!onPress) return circle

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Profile'}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {circle}
    </Pressable>
  )
}
