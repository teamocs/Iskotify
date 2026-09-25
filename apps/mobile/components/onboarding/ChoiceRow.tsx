import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

interface Props {
  label: string
  description?: string
  selected: boolean
  onPress: () => void
  /** `radio` — one of a group; `checkbox` — any number. */
  mode: 'radio' | 'checkbox'
  /** e.g. a 3-course cap reached: the row stays visible but cannot be picked. */
  disabled?: boolean
  /** Defaults to "label, description". */
  accessibilityLabel?: string
  testID?: string
}

/**
 * A large (≥56pt) answer row for onboarding. Selection is never colour alone:
 * the indicator changes shape (empty ring → filled dot / empty box → check),
 * the row tints, and the state is exposed as aria-checked. Space toggles it on
 * web like a native radio/checkbox.
 */
export function ChoiceRow({ label, description, selected, onPress, mode, disabled, accessibilityLabel, testID }: Props) {
  const { theme: t } = useTheme()

  const onKeyDown = (e: { key?: string; repeat?: boolean; preventDefault?: () => void }) => {
    if (e.key !== ' ' && e.key !== 'Spacebar') return
    e.preventDefault?.()
    if (!e.repeat && !disabled) onPress()
  }
  const webKeys = { onKeyDown } as Record<string, unknown>

  const ring = selected ? t.accentText : t.inputBorder

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      {...webKeys}
      testID={testID}
      accessibilityRole={mode}
      accessibilityLabel={accessibilityLabel ?? (description ? `${label}, ${description}` : label)}
      aria-checked={selected}
      aria-disabled={!!disabled}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        return [
          {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.lg,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: selected ? t.accentBorder : t.border,
            backgroundColor: selected
              ? t.accentSurface
              : pressed ? t.surface2 : hovered && !disabled ? t.surfaceSubtle : t.surface,
            opacity: disabled ? 0.5 : 1,
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={[textStyle('body', t.textPrimary), { fontFamily: selected ? fonts.bodySemi : fonts.bodyMedium }]}
          maxFontSizeMultiplier={2}
        >
          {label}
        </Text>
        {description ? (
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{description}</Text>
        ) : null}
      </View>
      <View
        {...decorative}
        testID="choice-indicator"
        style={{
          width: 24,
          height: 24,
          flexShrink: 0,
          borderRadius: mode === 'radio' ? radius.pill : 6,
          borderWidth: 2,
          borderColor: ring,
          backgroundColor: mode === 'checkbox' && selected ? t.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && mode === 'radio' ? (
          <View style={{ width: 12, height: 12, borderRadius: radius.pill, backgroundColor: t.accentText }} />
        ) : null}
        {selected && mode === 'checkbox' ? <Lineicons icon={CheckOutlined} size={14} color={t.textInverse} /> : null}
      </View>
    </Pressable>
  )
}
