import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'

const LETTERS = ['A', 'B', 'C', 'D'] as const

export interface ReviewCardProps {
  /** 1-based question number, shown as "Q{n}." before the stem. */
  index: number
  questionText: string
  options: string[]
  correctIndex: number
  /** Index the student picked, or undefined if they skipped the question. */
  selectedIndex: number | undefined
  /** "Why the correct answer is correct" — the existing per-question explanation column. */
  explanation: string
  /** Index-aligned with `options`; a per-option "why this is wrong" rationale. Rows render only for entries that are present (non-empty). */
  optionExplanations?: (string | null)[] | null
  /** Short formula/mnemonic/pacing tip. Rendered as a chip only when present. */
  strategyTip?: string | null
}

/**
 * Shared review presentation for all four practice-exam engines (blueprint mock,
 * UPCAT subtest, diagnostic, flashcard quiz) — the results-screen counterpart to
 * QuestionCard/OptionList. Replaces the old single 💡-prefixed 12px text blob with:
 * tone-colored your-answer/correct-answer options, the correct-answer rationale at
 * a readable size, per-option "why it's wrong" rows (only when the data has them),
 * and an optional strategy-tip chip.
 */
export function ReviewCard({
  index, questionText, options, correctIndex, selectedIndex, explanation, optionExplanations, strategyTip,
}: ReviewCardProps) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  const ok = selectedIndex === correctIndex
  const wrongRows = (optionExplanations ?? [])
    .map((text, i) => ({ i, text }))
    .filter((r): r is { i: number; text: string } => !!r.text && r.text.trim().length > 0 && r.i !== correctIndex)
  const tip = strategyTip?.trim()

  return (
    <View style={[s.card, ok ? s.cardOk : s.cardBad]}>
      <Text style={s.qText} maxFontSizeMultiplier={1.5}>
        Q{index}. {questionText}
      </Text>

      <View style={s.optsWrap}>
        {options.map((o, oi) => {
          const isCorrect = oi === correctIndex
          const isWrongPick = oi === selectedIndex && !isCorrect
          return (
            <View
              key={oi}
              style={[
                s.optRow,
                isCorrect ? s.optRowCorrect : isWrongPick ? s.optRowWrong : null,
              ]}
            >
              <View style={[s.optLetter, isCorrect ? s.optLetterCorrect : isWrongPick ? s.optLetterWrong : null]}>
                <Text
                  style={[s.optLetterTxt, (isCorrect || isWrongPick) && { color: t.textInverse }]}
                  maxFontSizeMultiplier={1.3}
                >
                  {LETTERS[oi]}
                </Text>
              </View>
              <Text
                style={[s.optTxt, isCorrect && s.optTxtCorrect, isWrongPick && s.optTxtWrong]}
                maxFontSizeMultiplier={1.5}
              >
                {o}
              </Text>
              {isCorrect ? <Text style={[s.optMark, { color: t.success }]}>✓</Text> : null}
              {isWrongPick ? <Text style={[s.optMark, { color: t.danger }]}>✗</Text> : null}
            </View>
          )
        })}
      </View>

      {explanation ? (
        <View style={s.explainBlock}>
          <Text style={s.explainLabel} maxFontSizeMultiplier={1.4}>Why {LETTERS[correctIndex]} is correct</Text>
          <Text style={s.explainTxt} maxFontSizeMultiplier={1.6}>{explanation}</Text>
        </View>
      ) : null}

      {wrongRows.length > 0 ? (
        <View style={s.wrongBlock}>
          <Text style={s.explainLabel} maxFontSizeMultiplier={1.4}>Why the others are wrong</Text>
          {wrongRows.map(r => (
            <Text key={r.i} style={s.wrongTxt} maxFontSizeMultiplier={1.6}>
              <Text style={s.wrongLetter}>{LETTERS[r.i]}. </Text>
              {r.text}
            </Text>
          ))}
        </View>
      ) : null}

      {tip ? (
        <View style={s.tipChip}>
          <Text style={s.tipTxt} maxFontSizeMultiplier={1.5}>💡 {tip}</Text>
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: ReturnType<typeof useTheme>['theme'], typo: ReturnType<typeof useTheme>['typo']) {
  return StyleSheet.create({
    card: {
      backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.border, borderRadius: radius.lg,
      borderCurve: 'continuous', padding: spacing.lg, marginBottom: spacing.md,
    },
    cardOk: { borderColor: t.success },
    cardBad: { borderColor: t.danger },
    // Question stem stays the dominant element, matching QuestionCard's scale.
    qText: {
      fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold',
      lineHeight: Math.round(typo.md * 1.35), marginBottom: spacing.md,
    },
    optsWrap: { gap: spacing.xs, marginBottom: spacing.sm },
    optRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.surface2,
      borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous',
      paddingVertical: 9, paddingHorizontal: spacing.md,
    },
    optRowCorrect: { backgroundColor: t.successSurface, borderColor: t.success },
    optRowWrong: { backgroundColor: t.dangerSurface, borderColor: t.danger },
    optLetter: { width: 22, height: 22, borderRadius: 7, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' },
    optLetterCorrect: { backgroundColor: t.success },
    optLetterWrong: { backgroundColor: t.danger },
    optLetterTxt: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    optTxt: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: Math.round(typo.sm * 1.5) },
    optTxtCorrect: { color: t.success, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    optTxtWrong: { color: t.danger, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    optMark: { fontSize: typo.sm, fontWeight: '700' },
    // Correct-answer rationale — the flagship "why" content, bumped well past the
    // old typo.xs(12px) blob for actual readability.
    explainBlock: {
      backgroundColor: t.successSurface, borderRadius: radius.md, borderCurve: 'continuous',
      padding: spacing.md, marginTop: spacing.xs,
    },
    explainLabel: {
      fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase',
      letterSpacing: 0.6, marginBottom: 4, fontFamily: 'Lexend_600SemiBold',
    },
    explainTxt: { fontSize: typo.base, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: Math.round(typo.base * 1.5) },
    // Per-option "why it's wrong" rows — subordinate to the correct-answer block,
    // still well above the old 12px floor.
    wrongBlock: {
      backgroundColor: t.surfaceSubtle, borderRadius: radius.md, borderCurve: 'continuous',
      padding: spacing.md, marginTop: spacing.sm, gap: 4,
    },
    wrongTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: Math.round(typo.sm * 1.5) },
    wrongLetter: { fontWeight: '700', color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
    tipChip: {
      flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: t.warningSurface, borderWidth: 1,
      borderColor: t.warning, borderRadius: radius.pill, paddingHorizontal: spacing.md,
      paddingVertical: 6, marginTop: spacing.sm,
    },
    tipTxt: { fontSize: typo.sm, color: t.warning, fontWeight: '600', fontFamily: 'Lexend_600SemiBold', lineHeight: Math.round(typo.sm * 1.4) },
  })
}
