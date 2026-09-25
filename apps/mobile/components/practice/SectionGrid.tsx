import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

export interface SectionGridSection {
  name: string
  start: number
  active: boolean
  disabled: boolean
}

interface Props {
  sections: SectionGridSection[]
  onJump: (start: number) => void
  /** One section per row (side panel) instead of the 2-/3-up grid. */
  stacked?: boolean
}

/**
 * Section navigation for the mock-exam runner. Every section is always visible
 * (no sideways scroll), so the block never shifts between questions. The
 * active section is marked by a check and heavier label as well as its tint.
 * Sections locked by a section timer are disabled and announced as such.
 */
export function SectionGrid({ sections, onJump, stacked = false }: Props) {
  const { theme: t } = useTheme()
  if (sections.length <= 1) return null

  const basis = stacked ? '100%' : sections.length <= 4 ? '48%' : '31%'

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {sections.map(sec => (
        <Pressable
          key={sec.name}
          disabled={sec.disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: sec.active, disabled: sec.disabled }}
          onPress={() => onJump(sec.start)}
          style={(state) => {
            const { pressed, focused } = state as WebPressableState
            return [
              {
                flexBasis: basis,
                flexGrow: 1,
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: stacked ? 'flex-start' : 'center',
                gap: spacing.xs,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.sm,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: sec.active ? t.accentBorder : t.border,
                backgroundColor: sec.active ? t.accentSurface : pressed ? t.surface2 : t.surface,
                opacity: sec.disabled ? 0.45 : 1,
              },
              focusRing(t.focusRing, focused),
            ]
          }}
        >
          {sec.active ? (
            <View {...decorative}>
              <Lineicons icon={CheckOutlined} size={14} color={t.accentText} />
            </View>
          ) : null}
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.5}
            style={[
              textStyle('label', sec.active ? t.accentText : t.textSecondary),
              { fontFamily: sec.active ? fonts.bodySemi : fonts.bodyMedium, flexShrink: 1 },
            ]}
          >
            {sec.name}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
