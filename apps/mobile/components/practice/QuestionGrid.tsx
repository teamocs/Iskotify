import { memo } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Flag1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

interface Props {
  total: number
  currentIdx: number
  answeredIdxs: Set<number>
  flaggedIdxs?: Set<number>
  /** Questions before this index sit in an expired section and can't be revisited. */
  floorIdx?: number
  onPressCell: (idx: number) => void
}

/** Cell edge: clears the 44pt floor; 4 across fits a 280 side panel with gaps. */
export const CELL = 48

/**
 * The question overview shared by the review sheet and the desktop side panel.
 * State never rides on colour alone:
 * - answered → filled tint AND a small bar under the number;
 * - flagged  → a drawn flag in the corner;
 * - current  → a 2pt ring, exposed as `aria-selected` to assistive tech (aria-*
 *   props, not accessibilityState, which react-native-web 0.21 drops);
 * and every cell's name spells its state out ("Question 5, unanswered, flagged").
 */
export const QuestionGrid = memo(function QuestionGrid({
  total, currentIdx, answeredIdxs, flaggedIdxs, floorIdx = 0, onPressCell,
}: Props) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {Array.from({ length: total }, (_, i) => {
        const answered = answeredIdxs.has(i)
        const flagged = !!flaggedIdxs?.has(i)
        const current = i === currentIdx
        const locked = i < floorIdx
        const label = `Question ${i + 1}, ${answered ? 'answered' : 'unanswered'}${flagged ? ', flagged' : ''}`
        return (
          <Pressable
            key={i}
            onPress={() => onPressCell(i)}
            disabled={locked}
            accessibilityRole="button"
            accessibilityLabel={label}
            aria-selected={current}
            aria-disabled={locked}
            style={(state) => {
              const { pressed, focused } = state as WebPressableState
              return [
                {
                  width: CELL, height: CELL, minWidth: CELL, minHeight: CELL,
                  borderRadius: radius.sm, borderCurve: 'continuous',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: current ? 2 : 1,
                  borderColor: current ? t.focusRing : answered ? t.accentBorder : t.border,
                  backgroundColor: pressed ? t.surface2 : answered ? t.accentSurface : t.surface,
                  opacity: locked ? 0.45 : 1,
                },
                focusRing(t.focusRing, focused),
              ]
            }}
          >
            <Text
              style={[textStyle('label', answered ? t.accentText : t.textSecondary), answered ? { fontFamily: fonts.bodySemi } : null]}
              maxFontSizeMultiplier={1.3}
            >
              {i + 1}
            </Text>
            {answered ? (
              <View
                testID="qgrid-answered-mark"
                {...decorative}
                style={{ position: 'absolute', bottom: 6, width: 14, height: 3, borderRadius: radius.pill, backgroundColor: t.accentText }}
              />
            ) : null}
            {flagged ? (
              <View {...decorative} style={{ position: 'absolute', top: 3, right: 3 }}>
                <Lineicons icon={Flag1Outlined} size={12} color={t.warningStrong} />
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
})
