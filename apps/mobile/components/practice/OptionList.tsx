import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'

const LETTERS = ['A', 'B', 'C', 'D'] as const

export interface OptionListProps {
  options: string[]
  /** Index of the currently-selected option, or undefined if none picked yet. */
  selectedIndex: number | undefined
  onSelect: (index: number) => void
}

/**
 * Shared option-chip list for all four practice-exam engines. Deliberately
 * subordinate to QuestionCard: compact letter chips, tighter padding, smaller
 * text — the question stays the dominant element on screen.
 */
export function OptionList({ options, selectedIndex, onSelect }: OptionListProps) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  return (
    <View style={s.opts}>
      {options.map((o, oi) => {
        const selected = selectedIndex === oi
        return (
          <Pressable
            key={oi}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[s.opt, selected && s.optOn]}
            onPress={() => onSelect(oi)}
          >
            <View style={[s.optLetter, selected && s.optLetterOn]}>
              <Text
                style={[s.optLetterTxt, selected && { color: t.textInverse }]}
                maxFontSizeMultiplier={1.3}
              >
                {LETTERS[oi]}
              </Text>
            </View>
            <Text style={s.optTxt} maxFontSizeMultiplier={1.5}>{o}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function makeStyles(t: ReturnType<typeof useTheme>['theme'], typo: ReturnType<typeof useTheme>['typo']) {
  return StyleSheet.create({
    opts: { gap: 8, paddingHorizontal: 14 },
    opt: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.surface, borderWidth: 1.5,
      borderColor: t.border, borderRadius: 16, borderCurve: 'continuous', paddingVertical: 9, paddingHorizontal: 13,
    },
    optOn: { backgroundColor: t.accentSurface, borderColor: t.accent },
    optLetter: { width: 24, height: 24, borderRadius: 8, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' },
    optLetterOn: { backgroundColor: t.accent },
    optLetterTxt: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    // Subordinate to the question text: smaller than typo.md, generous (≥1.35×) line-height.
    optTxt: { flex: 1, fontSize: 15, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: 21 },
  })
}
