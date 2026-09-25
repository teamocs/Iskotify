import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Flag1Outlined, CheckOutlined } from '@lineiconshq/free-icons'
import { ExamPassage } from './ExamPassage'
import { QuestionFigure } from './QuestionFigure'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle, textStyles } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

export interface QuestionCardProps {
  /** The question stem / prompt — the dominant element of the screen. */
  questionText: string
  /** Optional reading passage rendered above the question (UPCAT reading comp, blueprint exams). */
  passageText?: string | null
  /** Optional small label above the question text (diagnostic's subject tag). */
  subjectTag?: string
  /** Optional orientation line, e.g. "Question 3 of 40" (announced before the stem). */
  questionLabel?: string
  /** Whether this question has already been reported. Ignored unless `onReport` is passed. */
  reported?: boolean
  /**
   * Report-a-question affordance. Omit entirely to hide the row (the diagnostic
   * engine has no report flow).
   */
  onReport?: () => void
  /** Question-media (diagram/infographic/comic-panel/chart) — rendered via
   *  QuestionFigure between the stem and the caller's OptionList. */
  imageUrl?: string | null
  imageAlt?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
}

// The stem reads at the headline size (20) with a reading line-height rather
// than the headline's tight 26, and in the semibold face so long stems stay calm.
const STEM = { ...textStyles.headline, fontFamily: fonts.headingSemi, lineHeight: 30, letterSpacing: 0 }

/**
 * Shared question presentation for every practice engine (blueprint mock,
 * UPCAT subtest, diagnostic, flashcard quiz). No card chrome: the question sits
 * straight on the page as the largest text on screen, the passage (if any)
 * above it and the figure below it, with a quiet report control at the end.
 * The caller supplies the horizontal gutter.
 */
export function QuestionCard({
  questionText, passageText, subjectTag, questionLabel, reported, onReport,
  imageUrl, imageAlt, imageWidth, imageHeight,
}: QuestionCardProps) {
  const { theme: t } = useTheme()

  return (
    <View>
      {passageText ? <ExamPassage passage={passageText} /> : null}
      {questionLabel || subjectTag ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          {questionLabel ? (
            <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.5}>{questionLabel}</Text>
          ) : null}
          {subjectTag ? (
            <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={1.4}>{subjectTag}</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={[STEM, { color: t.textPrimary }]} maxFontSizeMultiplier={1.6}>{questionText}</Text>
      <View style={{ marginTop: spacing.md }}>
        <QuestionFigure imageUrl={imageUrl} imageAlt={imageAlt} imageWidth={imageWidth} imageHeight={imageHeight} />
      </View>
      {onReport ? (
        <View style={{ alignItems: 'flex-end', marginTop: spacing.xs }}>
          {reported ? (
            <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm }}>
              <View {...decorative}>
                <Lineicons icon={CheckOutlined} size={14} color={t.success} />
              </View>
              <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.4}>Reported</Text>
            </View>
          ) : (
            <Pressable
              onPress={onReport}
              accessibilityRole="button"
              accessibilityLabel="Report this question"
              style={(state) => {
                const { pressed, focused } = state as WebPressableState
                return [
                  {
                    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                    paddingHorizontal: spacing.md, borderRadius: radius.pill,
                    backgroundColor: pressed ? t.surface2 : 'transparent',
                  },
                  focusRing(t.focusRing, focused),
                ]
              }}
            >
              <View {...decorative}>
                <Lineicons icon={Flag1Outlined} size={14} color={t.textSecondary} />
              </View>
              <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.4}>Report</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  )
}
