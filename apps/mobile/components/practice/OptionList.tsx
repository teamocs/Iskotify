import { View, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckCircle1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, weight } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { Text } from '../ui/Text'
import { AnimatedCheck } from './AnimatedCheck'

export const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

/** The letter a choice is read by ("B"); past E, its number. */
export function optionLetter(i: number): string {
  return LETTERS[i] ?? String(i + 1)
}

/** The letter disc: 26pt, growing with the text (minWidth/minHeight, never a fixed box). */
const DISC = 26

export interface OptionListProps {
  options: string[]
  /** Index of the currently-selected option, or undefined if none picked yet. */
  selectedIndex: number | undefined
  onSelect: (index: number) => void
  /** Ignore presses (e.g. while an exam is being submitted). */
  disabled?: boolean
  /**
   * Reveal the answer (only where a mode shows it): the correct choice turns
   * success-tinted with a check and "Correct", a wrong pick turns
   * danger-tinted with "Your answer". Choices stop taking presses.
   */
  reveal?: { correctIndex: number }
}

/**
 * Answer choices for every practice engine (iOS redesign P4): 14pt rows at
 * least 56 tall, each led by a 26pt letter disc.
 * - Selected: accentSurface fill, a 2pt accent edge, a filled maroon disc and
 *   a check at the end, plus radio semantics (`aria-checked`). Never colour
 *   alone. The aria-* prop, not accessibilityState, because react-native-web
 *   0.21 drops accessibilityState before it reaches the DOM.
 * - Revealed: correct = successSurface with a successBorder edge, a check and
 *   the word "Correct"; a wrong pick = dangerSurface with "Your answer". The
 *   state is in the text (and so in the radio's name), not only the tint.
 *
 * Every row keeps a 2pt border (transparent when idle), so rows never shift by
 * a pixel as the selection moves.
 */
export function OptionList({ options, selectedIndex, onSelect, disabled = false, reveal }: OptionListProps) {
  const { theme: t } = useTheme()
  const locked = disabled || !!reveal

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Answer choices" style={{ gap: spacing.sm }}>
      {options.map((o, oi) => {
        const selected = selectedIndex === oi
        const isCorrect = !!reveal && oi === reveal.correctIndex
        const isWrongPick = !!reveal && selected && !isCorrect
        const edge = isCorrect ? t.successBorder : isWrongPick ? t.dangerBorder : selected ? t.accent : 'transparent'
        const fill = isCorrect ? t.successSurface : isWrongPick ? t.dangerSurface : selected ? t.accentSurface : t.surface
        const discFill = isCorrect ? t.success : isWrongPick ? t.danger : selected ? t.accent : t.surface2
        const discInk = isCorrect || isWrongPick || selected ? t.textInverse : t.textSecondary
        return (
          <Pressable
            key={oi}
            accessibilityRole="radio"
            aria-checked={selected}
            aria-disabled={locked}
            onPress={() => { if (!locked) onSelect(oi) }}
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
                  borderRadius: radius.button,
                  borderCurve: 'continuous',
                  borderWidth: 2,
                  borderColor: edge,
                  backgroundColor: !selected && !isCorrect && pressed && !locked ? t.surface2 : fill,
                },
                focusRing(t.focusRing, focused),
              ]
            }}
          >
            <View
              testID="option-letter-disc"
              style={{
                minWidth: DISC, minHeight: DISC, paddingHorizontal: spacing.xs, borderRadius: radius.capsule, flexShrink: 0,
                alignItems: 'center', justifyContent: 'center', backgroundColor: discFill,
              }}
            >
              <Text role="footnote" color={discInk} style={weight('700')} maxFontSizeMultiplier={1.3}>
                {optionLetter(oi)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text role="body" style={selected || isCorrect ? weight('600') : null} maxFontSizeMultiplier={1.6}>
                {o}
              </Text>
              {isCorrect ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <AnimatedCheck color={t.successStrong} size={14} />
                  <Text role="footnote" color={t.successStrong} style={weight('600')} maxFontSizeMultiplier={1.6}>Correct</Text>
                </View>
              ) : isWrongPick ? (
                <Text role="footnote" color={t.dangerStrong} style={weight('600')} maxFontSizeMultiplier={1.6}>Your answer</Text>
              ) : null}
            </View>
            {selected && !reveal ? (
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
