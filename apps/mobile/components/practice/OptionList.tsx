import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckCircle1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export interface OptionListProps {
  options: string[]
  /** Index of the currently-selected option, or undefined if none picked yet. */
  selectedIndex: number | undefined
  onSelect: (index: number) => void
  /** Ignore presses (e.g. while an exam is being submitted). */
  disabled?: boolean
}

/**
 * Answer choices for every practice engine. Each choice is a full-width row at
 * least 48 tall (Android's target). The selected choice is told apart three
 * ways, never by colour alone: a thicker outline, a filled letter badge, and a
 * check mark at the end — plus radio semantics (`aria-checked`) for assistive
 * tech. The aria-* prop, not the nested accessibilityState, because
 * react-native-web 0.21 drops accessibilityState before it reaches the DOM.
 *
 * A fixed 2pt border on every row (tinted only when selected) keeps the rows
 * from shifting by a pixel when the selection moves.
 */
export function OptionList({ options, selectedIndex, onSelect, disabled = false }: OptionListProps) {
  const { theme: t } = useTheme()

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Answer choices" style={{ gap: spacing.sm }}>
      {options.map((o, oi) => {
        const selected = selectedIndex === oi
        return (
          <Pressable
            key={oi}
            accessibilityRole="radio"
            aria-checked={selected}
            onPress={() => { if (!disabled) onSelect(oi) }}
            style={(state) => {
              const { pressed, focused } = state as WebPressableState
              return [
                {
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  borderWidth: 2,
                  borderColor: selected ? t.accentText : t.border,
                  backgroundColor: selected ? t.accentSurface : pressed ? t.surface2 : t.surface,
                },
                focusRing(t.focusRing, focused),
              ]
            }}
          >
            <View
              style={{
                width: 32, height: 32, borderRadius: radius.pill, flexShrink: 0,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: selected ? t.accent : t.surface2,
              }}
            >
              <Text
                style={[textStyle('label', selected ? t.textInverse : t.textSecondary), { fontFamily: fonts.heading }]}
                maxFontSizeMultiplier={1.3}
              >
                {LETTERS[oi] ?? String(oi + 1)}
              </Text>
            </View>
            <Text
              style={[textStyle('body', t.textPrimary), { flex: 1 }, selected ? { fontFamily: fonts.bodyMedium } : null]}
              maxFontSizeMultiplier={1.6}
            >
              {o}
            </Text>
            {selected ? (
              <View testID="option-selected-mark" {...decorative} style={{ flexShrink: 0 }}>
                <Lineicons icon={CheckCircle1Outlined} size={22} color={t.accentText} />
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}
