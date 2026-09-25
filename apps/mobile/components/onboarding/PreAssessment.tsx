import { View, Text, Pressable, ScrollView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, pagePadding } from '../../hooks/useBreakpoint'
import { QuestionFigure } from '../practice/QuestionFigure'
import { Button } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { decorative, focusRing, heading, type WebPressableState } from '../ui/a11y'
import type { PreAssessQuestion } from '../../data/preAssessment'

const LETTERS = ['A', 'B', 'C', 'D'] as const

/**
 * One quick-check question. Tapping an option answers it and moves on (no
 * right/wrong reveal here: this is a starting point, not a test), so each
 * option is a plain button named "Option A, <text>".
 */
export function QuestionView({ q, index, total, onAnswer }: {
  q: PreAssessQuestion
  index: number
  total: number
  onAnswer: (optionIdx: number) => void
}) {
  const { theme: t } = useTheme()
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.6}>
          {`${q.subject} · Question ${index + 1} of ${total}`}
        </Text>
        <ProgressBar value={(index + 1) / total} label={`Question ${index + 1} of ${total}`} height={4} />
      </View>
      <View
        style={{
          backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
          borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.xl,
        }}
      >
        <Text {...heading(2)} style={textStyle('headline', t.textPrimary)} maxFontSizeMultiplier={2}>{q.stem}</Text>
      </View>
      <QuestionFigure imageUrl={q.imageUrl} imageAlt={q.imageAlt} imageWidth={q.imageWidth} imageHeight={q.imageHeight} />
      <View style={{ gap: spacing.sm }}>
        {q.options.map((opt, i) => (
          <Pressable
            key={`${q.id}-${i}`}
            onPress={() => onAnswer(i)}
            accessibilityRole="button"
            accessibilityLabel={`Option ${LETTERS[i]}, ${opt}`}
            style={(state) => {
              const { pressed, hovered, focused } = state as WebPressableState
              return [{
                minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                borderRadius: radius.lg, borderCurve: 'continuous', borderWidth: 1,
                borderColor: t.inputBorder,
                backgroundColor: pressed ? t.surface2 : hovered ? t.surfaceSubtle : t.surface,
              }, focusRing(t.focusRing, focused)]
            }}
          >
            <View
              {...decorative}
              style={{
                width: 32, height: 32, borderRadius: radius.sm, flexShrink: 0,
                backgroundColor: t.accentSurface, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={textStyle('titleSm', t.accentText)}>{LETTERS[i]}</Text>
            </View>
            <Text style={[textStyle('body', t.textPrimary), { flex: 1 }]} maxFontSizeMultiplier={2}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

interface SubjectScore { sub: string; correct: number; total: number }

/**
 * The peak-end moment after the quick check. Deliberately neutral: a starting
 * point per subject with an accent bar, never a pass/fail colour or verdict
 * (PRODUCT.md: no pass/fail language).
 */
export function ResultsView({ correct, total, bySubject, focusTitles, onStart }: {
  correct: number
  total: number
  bySubject: SubjectScore[]
  focusTitles: string[]
  onStart: () => void
}) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      {Platform.OS === 'web' ? <View style={{ height: spacing.md }} /> : null}
      <ScrollView contentContainerStyle={{ paddingVertical: spacing.xxl }}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: pagePadding(bp), gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}>
            <Text style={textStyle('label', t.accentText)}>Tapos na!</Text>
            <Text {...heading(1)} style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.6}>Your starting point</Text>
            <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>
              {`You got ${correct} of ${total} right. This isn't a grade — it shows where to begin, and your study plan starts here.`}
            </Text>
          </View>

          <View style={{ gap: spacing.md }}>
            {bySubject.filter(s => s.total > 0).map(({ sub, correct: c, total: n }) => (
              <View
                key={sub}
                style={{
                  backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
                  borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                  <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { flex: 1 }]}>{sub}</Text>
                  <Text style={[textStyle('label', t.textSecondary), { fontFamily: fonts.bodySemi, fontVariant: ['tabular-nums'] }]}>
                    {`${c} of ${n}`}
                  </Text>
                </View>
                <ProgressBar value={n > 0 ? c / n : 0} label={`${sub}: ${c} of ${n} right`} />
              </View>
            ))}
          </View>

          {focusTitles.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)}>Your focus list</Text>
              {focusTitles.map(title => (
                <Text key={title} style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>{title}</Text>
              ))}
            </View>
          ) : null}

          <Button label="Start studying" onPress={onStart} size="lg" fullWidth />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
