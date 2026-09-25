import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from './a11y'

/** Static tag. Not a control — use FilterChip for anything tappable. */
export function Chip({ label, leading }: { label: string; leading?: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        minHeight: 28,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: t.surface2,
      }}
    >
      {leading}
      <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={2}>{label}</Text>
    </View>
  )
}

interface FilterChipProps {
  label: string
  selected: boolean
  onPress: () => void
  /**
   * `single` (default) → radio semantics (one of a group);
   * `multiple` → checkbox semantics. DESIGN.md: selection is exposed through
   * aria-checked / aria-selected, never colour alone.
   */
  mode?: 'single' | 'multiple'
  /** Use 'tab' when the chip row switches sections (inside a tablist). */
  role?: 'tab'
  accessibilityHint?: string
  testID?: string
}

/** Tappable filter / section chip. ≥44pt target, visible check when selected. */
export function FilterChip({ label, selected, onPress, mode = 'single', role, accessibilityHint, testID }: FilterChipProps) {
  const { theme: t } = useTheme()
  const a11yRole = role ?? (mode === 'multiple' ? 'checkbox' : 'radio')
  const fg = selected ? t.accentText : t.textSecondary

  // react-native-web only lets Space activate role="button"; checkbox, radio
  // and tab must toggle on Space too (Enter is already handled by RNW).
  const onKeyDown = (e: { key?: string; repeat?: boolean; preventDefault?: () => void }) => {
    if (e.key !== ' ' && e.key !== 'Spacebar') return
    e.preventDefault?.() // keep the page from scrolling
    if (!e.repeat) onPress()
  }
  const webKeys = { onKeyDown } as Record<string, unknown>

  return (
    <Pressable
      onPress={onPress}
      {...webKeys}
      testID={testID}
      accessibilityRole={a11yRole}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      // State rides on aria-*: react-native-web maps it to the DOM, native folds
      // it into accessibility state. Checkbox/radio are checked, tab is selected.
      {...(a11yRole === 'checkbox' || a11yRole === 'radio' ? { 'aria-checked': selected } : { 'aria-selected': selected })}
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            minHeight: 44,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: selected ? t.accentBorder : t.border,
            backgroundColor: selected ? t.accentSurface : pressed ? t.surface2 : t.surface,
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      {selected && a11yRole !== 'tab' ? (
        <View testID="filter-chip-check" {...decorative}>
          <Lineicons icon={CheckOutlined} size={14} color={fg} />
        </View>
      ) : null}
      <Text
        style={[textStyle('label', fg), { fontFamily: selected ? fonts.bodySemi : fonts.bodyMedium }]}
        numberOfLines={1}
        maxFontSizeMultiplier={2}
      >
        {label}
      </Text>
    </Pressable>
  )
}
