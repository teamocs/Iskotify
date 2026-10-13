import { View } from 'react-native'
import { QuestionFigure } from './QuestionFigure'
import { useTheme } from '../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bulb2Outlined, XmarkOutlined } from '@lineiconshq/free-icons'
import { decorative } from '../ui/a11y'
import { Text } from '../ui/Text'
import { spacing, radius, weight } from '../../theme/tokens'
import { AnimatedCheck } from './AnimatedCheck'
import { optionLetter } from './OptionList'

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
  /** Question-media (diagram/infographic/comic-panel/chart) — rendered via
   *  QuestionFigure just below the stem. Renders nothing when absent. */
  imageUrl?: string | null
  imageAlt?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  /** The answer choices or explanation came from the AI content pipeline: show a disclosure caption. */
  aiAssisted?: boolean
}

export const AI_ASSISTED_CAPTION =
  'AI-assisted: the answer choices or explanation were written with AI and reviewed by our team.'

/** The kind status line over a reviewed question (never a verdict, never blame). */
export function reviewStatusLine(correctIndex: number, selectedIndex: number | undefined): string {
  const answer = optionLetter(correctIndex)
  if (selectedIndex === correctIndex) return 'Correct.'
  if (selectedIndex === undefined) return `Skipped. The answer is ${answer}.`
  return `Not quite. The answer is ${answer}. Here’s why…`
}

/**
 * Shared review presentation for all four practice-exam engines (blueprint mock,
 * UPCAT subtest, diagnostic, flashcard quiz) — the results-screen counterpart to
 * QuestionCard/OptionList, in the same choice language (iOS redesign P4):
 * - a kind status line first ("Not quite. The answer is B. Here's why…");
 * - the correct choice on successSurface with a successBorder edge, a check
 *   (spring.bouncy, once) and the word "Correct"; a wrong pick on
 *   dangerSurface with a dangerBorder edge, a cross and "Your answer". State
 *   is always in words, never colour alone; the card itself stays neutral;
 * - the rationale, per-option "why it's wrong" rows (only when the data has
 *   them), and an optional strategy-tip chip.
 */
export function ReviewCard({
  index, questionText, options, correctIndex, selectedIndex, explanation, optionExplanations, strategyTip,
  imageUrl, imageAlt, imageWidth, imageHeight, aiAssisted,
}: ReviewCardProps) {
  const { theme: t } = useTheme()
  // Per-option explanations are free for everyone (not part of Full Access).
  const wrongPick = selectedIndex !== undefined && selectedIndex !== correctIndex
  const wrongRows = (optionExplanations ?? [])
    .map((text, i) => ({ i, text }))
    .filter((r): r is { i: number; text: string } => !!r.text && r.text.trim().length > 0 && r.i !== correctIndex)
  const tip = strategyTip?.trim()

  return (
    <View
      style={{
        backgroundColor: t.surface, borderRadius: radius.group, borderCurve: 'continuous',
        padding: spacing.lg, marginBottom: spacing.md, gap: spacing.md,
      }}
    >
      <Text role="headline" maxFontSizeMultiplier={1.5}>
        Q{index}. {questionText}
      </Text>

      <QuestionFigure imageUrl={imageUrl} imageAlt={imageAlt} imageWidth={imageWidth} imageHeight={imageHeight} />

      <Text
        role="subheadline"
        color={wrongPick ? t.dangerStrong : selectedIndex === undefined ? t.textSecondary : t.successStrong}
        style={weight('600')}
        maxFontSizeMultiplier={1.6}
      >
        {reviewStatusLine(correctIndex, selectedIndex)}
      </Text>

      <View style={{ gap: spacing.xs }}>
        {options.map((o, oi) => {
          const isCorrect = oi === correctIndex
          const isWrongPick = oi === selectedIndex && !isCorrect
          return (
            <View
              key={oi}
              testID={isCorrect ? 'review-option-correct' : isWrongPick ? 'review-option-wrong' : undefined}
              style={{
                minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                borderRadius: radius.button, borderCurve: 'continuous', borderWidth: 2,
                borderColor: isCorrect ? t.successBorder : isWrongPick ? t.dangerBorder : 'transparent',
                backgroundColor: isCorrect ? t.successSurface : isWrongPick ? t.dangerSurface : t.surface2,
              }}
            >
              <View
                style={{
                  minWidth: 26, minHeight: 26, paddingHorizontal: spacing.xs, borderRadius: radius.capsule,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isCorrect ? t.success : isWrongPick ? t.danger : t.surface,
                }}
              >
                <Text role="footnote" color={isCorrect || isWrongPick ? t.textInverse : t.textSecondary} style={weight('700')} maxFontSizeMultiplier={1.3}>
                  {optionLetter(oi)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text role="subheadline" style={isCorrect || isWrongPick ? weight('600') : null} maxFontSizeMultiplier={1.5}>
                  {o}
                </Text>
                {isCorrect ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <AnimatedCheck color={t.successStrong} size={14} />
                    <Text role="footnote" color={t.successStrong} style={weight('600')} maxFontSizeMultiplier={1.5}>Correct</Text>
                  </View>
                ) : isWrongPick ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <View {...decorative}>
                      <Lineicons icon={XmarkOutlined} size={14} color={t.dangerStrong} />
                    </View>
                    <Text role="footnote" color={t.dangerStrong} style={weight('600')} maxFontSizeMultiplier={1.5}>Your answer</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>

      {explanation ? (
        <View style={{ backgroundColor: t.successSurface, borderRadius: radius.button, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs }}>
          <Text role="footnote" color={t.successStrong} style={weight('600')} maxFontSizeMultiplier={1.4}>
            Why {optionLetter(correctIndex)} is correct
          </Text>
          <Text role="body" maxFontSizeMultiplier={1.6}>{explanation}</Text>
        </View>
      ) : null}

      {wrongRows.length > 0 ? (
        <View style={{ backgroundColor: t.surfaceSubtle, borderRadius: radius.button, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs }}>
          <Text role="footnote" color={t.textSecondary} style={weight('600')} maxFontSizeMultiplier={1.4}>Why the others are wrong</Text>
          {wrongRows.map(r => (
            <Text key={r.i} role="subheadline" color={t.textSecondary} maxFontSizeMultiplier={1.6}>
              <Text role="subheadline" style={weight('600')}>{optionLetter(r.i)}. </Text>
              {r.text}
            </Text>
          ))}
        </View>
      ) : null}

      {tip ? (
        <View
          accessible
          accessibilityLabel={`Strategy tip: ${tip}`}
          style={{
            flexDirection: 'row', alignSelf: 'flex-start', gap: spacing.sm,
            backgroundColor: t.warningSurface, borderWidth: 1, borderColor: t.warningBorder,
            borderRadius: radius.button, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
          }}
        >
          <View {...decorative} style={{ paddingTop: 2 }}>
            <Lineicons icon={Bulb2Outlined} size={16} color={t.warningStrong} />
          </View>
          <Text role="subheadline" color={t.warningStrong} style={[{ flex: 1 }, weight('600')]} maxFontSizeMultiplier={1.5}>{tip}</Text>
        </View>
      ) : null}

      {aiAssisted ? (
        <Text role="footnote" color={t.textSecondary} maxFontSizeMultiplier={1.6}>{AI_ASSISTED_CAPTION}</Text>
      ) : null}
    </View>
  )
}
