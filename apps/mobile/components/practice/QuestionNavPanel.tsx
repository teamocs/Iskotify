import { View, Text, ScrollView } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { QuestionGrid } from './QuestionGrid'
import { SectionGrid, type SectionGridSection } from './SectionGrid'

interface Props {
  total: number
  currentIdx: number
  answeredIdxs: Set<number>
  flaggedIdxs?: Set<number>
  floorIdx?: number
  onJump: (idx: number) => void
  sections?: SectionGridSection[]
  onJumpSection?: (start: number) => void
  /** Width of the panel column (expanded layouts only). */
  width?: number
}

/**
 * The exam runner's question navigator as a side panel, shown only on
 * expanded widths (desktop web, landscape tablets). On phones the same grid
 * lives in the review sheet so the question keeps the screen.
 */
export function QuestionNavPanel({
  total, currentIdx, answeredIdxs, flaggedIdxs, floorIdx = 0, onJump, sections, onJumpSection, width = 264,
}: Props) {
  const { theme: t } = useTheme()
  const answered = answeredIdxs.size
  return (
    <View
      testID="question-nav-panel"
      accessibilityLabel="Question navigator"
      style={{ width, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: t.divider }}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={1.5}>
            Questions
          </Text>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.5}>
            {answered} of {total} answered
          </Text>
        </View>
        {sections && sections.length > 1 && onJumpSection ? (
          <SectionGrid sections={sections} onJump={onJumpSection} stacked />
        ) : null}
        <QuestionGrid
          total={total}
          currentIdx={currentIdx}
          answeredIdxs={answeredIdxs}
          flaggedIdxs={flaggedIdxs}
          floorIdx={floorIdx}
          onPressCell={i => { if (i >= floorIdx) onJump(i) }}
        />
      </ScrollView>
    </View>
  )
}
