import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronDownOutlined, ChevronUpOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../../ui/a11y'
import { SectionHeader } from '../../ui/SectionHeader'
import { ReviewCard, type ReviewCardProps } from '../ReviewCard'
import { groupReviewBySection } from '../../../utils/examBuilder'

/** One reviewed question: everything ReviewCard needs, plus the section it belongs to. */
export type RunnerReviewItem = Omit<ReviewCardProps, 'index' | 'selectedIndex'> & {
  id: string
  sectionName: string
}

interface Props {
  items: RunnerReviewItem[]
  answers: Record<number, number>
  /** Open every section (the results screen's "Review mistakes" action). */
  expandAll?: boolean
}

/**
 * The results screen's review, as in the mock exam runner: one collapsed
 * section per subtest / subject, mistakes first inside each, expanded on
 * demand. Keeps a long results page scannable on a phone.
 */
export function RunnerReview({ items, answers, expandAll = false }: Props) {
  const { theme: t } = useTheme()
  const sections = groupReviewBySection(items, answers, items.map(i => i.correctIndex))
  const [open, setOpen] = useState<Record<string, boolean>>({})

  if (items.length === 0) return null

  return (
    <View>
      <SectionHeader title="Review" subtitle="Mistakes first, with explanations" />
      <View style={{ gap: spacing.sm }}>
        {sections.map(sec => {
          const isOpen = expandAll || !!open[sec.sectionName]
          const toReview = sec.total - sec.correct
          const reviewLine = toReview === 0 ? 'All correct' : `${toReview} to review`
          return (
            <View
              key={sec.sectionName}
              style={{
                backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
                borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden',
              }}
            >
              <Pressable
                onPress={() => setOpen(prev => ({ ...prev, [sec.sectionName]: !isOpen }))}
                accessibilityRole="button"
                accessibilityLabel={`${sec.sectionName}, ${reviewLine}`}
                aria-expanded={isOpen}
                style={(state) => {
                  const { pressed, focused } = state as WebPressableState
                  return [
                    {
                      minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                      backgroundColor: pressed ? t.surface2 : 'transparent',
                    },
                    focusRing(t.focusRing, focused),
                  ]
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={1.6}>{sec.sectionName}</Text>
                  <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>{reviewLine}</Text>
                </View>
                <View {...decorative}>
                  <Lineicons icon={isOpen ? ChevronUpOutlined : ChevronDownOutlined} size={18} color={t.textSecondary} />
                </View>
              </Pressable>
              {isOpen ? (
                <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                  {sec.questionRefs.map(ref => {
                    const item = items[ref.flatIndex]
                    if (!item) return null
                    const { id, sectionName: _section, ...card } = item
                    return (
                      <ReviewCard key={id} {...card} index={ref.flatIndex + 1} selectedIndex={answers[ref.flatIndex]} />
                    )
                  })}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}
