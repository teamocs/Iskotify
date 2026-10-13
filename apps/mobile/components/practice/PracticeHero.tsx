import { ScrollView, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, weight } from '../../theme/tokens'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { focusRing } from '../ui/a11y'

export interface ExamChip { slug: string; label: string }

/**
 * The Practice tab's exam chips (iOS redesign P4): a horizontal row of
 * capsules, one per exam with a runnable mock. The selected one is a maroon
 * fill with white text, the others accentSurface with accentText. A single
 * choice, so a radiogroup of radios (aria-checked), never colour alone.
 */
export function ExamChips({ chips, selected, onSelect }: { chips: ExamChip[]; selected: string | null; onSelect: (slug: string) => void }) {
  const { theme: t } = useTheme()
  if (chips.length < 2) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Exam"
      testID="practice-exam-chips"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
    >
      {chips.map(c => {
        const on = c.slug === selected
        return (
          <PressableScale
            key={c.slug}
            onPress={() => onSelect(c.slug)}
            accessibilityRole="radio"
            accessibilityLabel={c.label}
            aria-checked={on}
            style={({ pressed, focused }) => [
              {
                minHeight: 44, minWidth: 44, paddingHorizontal: spacing.lg, borderRadius: radius.capsule,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? t.accent : pressed ? t.surface2 : t.accentSurface,
              },
              focusRing(t.focusRing, focused),
            ]}
          >
            <Text role="subheadline" color={on ? t.textInverse : t.accentText} style={weight('600')} maxFontSizeMultiplier={1.6}>
              {c.label}
            </Text>
          </PressableScale>
        )
      })}
    </ScrollView>
  )
}

export interface MockHeroProps {
  acronym: string
  name: string
  items: number
  minutesLabel: string
  /** An unfinished run of this mock: answered of total. */
  inProgress?: { answered: number; total: number } | null
  onBegin: () => void
}

/**
 * The full mock exam hero: a maroon 22pt card with white text and a white
 * capsule "Begin" (or "Resume"). It is the Practice tab's one primary action,
 * so its button carries testID "primary-action". Only real figures: the
 * blueprint's items and minutes, and a saved run's answered count.
 */
export function MockHeroCard({ acronym, name, items, minutesLabel, inProgress, onBegin }: MockHeroProps) {
  const { theme: t } = useTheme()
  const action = inProgress ? 'Resume' : 'Begin'
  return (
    <View
      testID="practice-mock-hero"
      style={{
        backgroundColor: t.accent, borderRadius: radius.card, borderCurve: 'continuous',
        padding: spacing.xl, gap: spacing.lg,
      }}
    >
      <View style={{ gap: spacing.xs }}>
        <Text role="footnote" color={t.textInverse} style={weight('600')} maxFontSizeMultiplier={1.6}>
          Full mock exam · {acronym}
        </Text>
        <Text role="title2" color={t.textInverse} accessibilityRole="header" maxFontSizeMultiplier={1.6}>{name}</Text>
        <Text role="subheadline" color={t.textInverse} style={{ fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.8}>
          {items} items · {minutesLabel}
          {inProgress ? ` · ${inProgress.answered} of ${inProgress.total} answered` : ''}
        </Text>
      </View>
      <PressableScale
        testID="primary-action"
        onPress={onBegin}
        accessibilityRole="button"
        accessibilityLabel={`${action} the ${acronym} full mock`}
        style={({ pressed, focused }) => [
          {
            alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: spacing.xxl, borderRadius: radius.capsule,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: pressed ? t.bg : t.surface,
          },
          // The ring is white-on-maroon here: the default maroon ring would vanish.
          focusRing(t.textInverse, focused),
        ]}
      >
        <Text role="headline" color={t.accent} maxFontSizeMultiplier={1.6}>{action}</Text>
      </PressableScale>
    </View>
  )
}
