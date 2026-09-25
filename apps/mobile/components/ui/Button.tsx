import { Pressable, Text, ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle, type Theme } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from './a11y'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  label: string
  onPress: () => void
  /**
   * `primary` is the maroon fill — direction C allows ONE per screen, for the
   * next step. `secondary` is outlined, `ghost` is text-only, `danger` is a
   * tinted destructive action (legible in both themes).
   */
  variant?: ButtonVariant
  size?: ButtonSize
  /** `rounded` (default) or `pill` for compact inline actions. */
  shape?: 'rounded' | 'pill'
  fullWidth?: boolean
  disabled?: boolean
  loading?: boolean
  /** Leading icon node (Lineicons element, not an emoji). */
  icon?: React.ReactNode
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

// Every size clears the 44pt target floor.
const HEIGHT: Record<ButtonSize, number> = { sm: 44, md: 48, lg: 52 }
const PAD_X: Record<ButtonSize, number> = { sm: spacing.lg, md: spacing.xl, lg: spacing.xxl }

type Colors = { bg: keyof Theme | null; bgPressed: keyof Theme | null; fg: keyof Theme; border: keyof Theme | null }
const VARIANTS: Record<ButtonVariant, Colors> = {
  primary:   { bg: 'accent',        bgPressed: 'accentPressed', fg: 'textInverse',  border: null },
  secondary: { bg: 'surface',       bgPressed: 'surface2',      fg: 'accentText',   border: 'accentBorder' },
  ghost:     { bg: null,            bgPressed: 'surface2',      fg: 'accentText',   border: null },
  danger:    { bg: 'dangerSurface', bgPressed: 'dangerSurface', fg: 'dangerStrong', border: 'dangerBorder' },
}

/** The app's one button. AppButton and PillButton are thin wrappers over it. */
export function Button({
  label, onPress, variant = 'primary', size = 'md', shape = 'rounded', fullWidth, disabled, loading,
  icon, accessibilityLabel, accessibilityHint, style, testID,
}: ButtonProps) {
  const { theme: t } = useTheme()
  const c = VARIANTS[variant]
  const inactive = !!(disabled || loading)
  const fg = t[c.fg]
  const transparent = 'transparent'

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      // react-native-web 0.21 ignores accessibilityState; aria-* reaches the DOM
      // (and RN 0.81 reads it natively too).
      aria-disabled={inactive}
      aria-busy={!!loading}
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
        {
          minHeight: HEIGHT[size],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingHorizontal: PAD_X[size],
          borderRadius: shape === 'pill' ? radius.pill : radius.lg,
          borderCurve: shape === 'pill' ? undefined : 'continuous',
          backgroundColor: pressed && !inactive && c.bgPressed ? t[c.bgPressed] : c.bg ? t[c.bg] : transparent,
          borderWidth: c.border ? 1 : 0,
          borderColor: c.border ? t[c.border] : transparent,
          opacity: inactive && !loading ? 0.5 : 1,
        },
        focusRing(t.focusRing, focused),
        style,
      ]
      }}
    >
      {loading
        ? <ActivityIndicator color={fg} size="small" />
        : icon ? <View {...decorative}>{icon}</View> : null}
      <Text
        style={textStyle(size === 'sm' ? 'label' : 'button', fg)}
        maxFontSizeMultiplier={2}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  )
}
