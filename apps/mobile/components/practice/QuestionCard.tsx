import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { PassagePanel } from '../upcat/PassagePanel'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'

export interface QuestionCardProps {
  /** The question stem / prompt — the dominant element of the screen. */
  questionText: string
  /** Optional reading passage rendered above the question card (UPCAT reading comp, blueprint exams). */
  passageText?: string | null
  /** Optional small uppercase label above the question text (diagnostic's subject tag). */
  subjectTag?: string
  /** Whether this question has already been reported. Ignored unless `onReport` is passed. */
  reported?: boolean
  /**
   * Report-a-question affordance. Omit entirely to hide the row (the diagnostic
   * engine has no report flow).
   */
  onReport?: () => void
}

/**
 * Shared question presentation for all four practice-exam engines (blueprint mock,
 * UPCAT subtest, diagnostic, flashcard quiz). Question text is the dominant element
 * on screen — large, generous line-height — with an optional passage slot above it
 * and an optional report-a-question row below it.
 */
export function QuestionCard({ questionText, passageText, subjectTag, reported, onReport }: QuestionCardProps) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  return (
    <>
      {passageText ? <PassagePanel passage={passageText} /> : null}
      <View style={s.qCard}>
        {subjectTag ? (
          <Text style={s.subjectTag} maxFontSizeMultiplier={1.4}>{subjectTag}</Text>
        ) : null}
        <Text style={s.qText} maxFontSizeMultiplier={1.6}>{questionText}</Text>
        {onReport ? (
          <View style={s.reportRow}>
            {reported ? (
              <Text style={s.reportedTxt} maxFontSizeMultiplier={1.4}>Reported ✓</Text>
            ) : (
              <Pressable accessibilityRole="button" onPress={onReport} hitSlop={8}>
                <Text style={s.reportBtn} maxFontSizeMultiplier={1.4}>⚐ Report</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
    </>
  )
}

function makeStyles(t: ReturnType<typeof useTheme>['theme'], typo: ReturnType<typeof useTheme>['typo']) {
  return StyleSheet.create({
    qCard: {
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, borderCurve: 'continuous',
      padding: 18, marginHorizontal: 14, marginBottom: spacing.md,
    },
    subjectTag: {
      fontSize: typo.xs, fontWeight: '700', color: t.accentText, textTransform: 'uppercase',
      letterSpacing: 0.6, marginBottom: 8, fontFamily: 'Lexend_600SemiBold',
    },
    // Question text is the dominant element: typo.lg floor with generous (≥1.35×) line-height.
    qText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: Math.round(typo.lg * 1.35), fontFamily: 'Outfit_600SemiBold' },
    reportRow: { marginTop: 10, alignItems: 'flex-end' },
    reportBtn: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    reportedTxt: { fontSize: typo.xs, color: t.success, fontFamily: 'Lexend_400Regular' },
  })
}
