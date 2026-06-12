import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'

export interface SectionGridSection {
  name: string
  start: number
  active: boolean
  disabled: boolean
}

interface Props {
  sections: SectionGridSection[]
  onJump: (start: number) => void
}

/**
 * Fixed section-navigation grid for the mock-exam runner. Replaces the old
 * horizontally scrolling chip row: every section is always visible as a compact
 * card sized proportionally to the screen (2-up for ≤4 sections, 3-up for 5+),
 * so the block never shifts layout between questions.
 */
export function SectionGrid({ sections, onJump }: Props) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  if (sections.length <= 1) return null

  const basis = sections.length <= 4 ? '48%' : '31%'

  return (
    <View style={s.grid}>
      {sections.map(sec => (
        <Pressable
          key={sec.name}
          style={[s.card, { flexBasis: basis }, sec.active && s.cardActive, sec.disabled && s.cardDisabled]}
          disabled={sec.disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: sec.active, disabled: sec.disabled }}
          onPress={() => onJump(sec.start)}
        >
          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[s.cardTxt, sec.active && s.cardTxtActive]}>
            {sec.name}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function makeStyles(t: ReturnType<typeof useTheme>['theme'], typo: ReturnType<typeof useTheme>['typo']) {
  return StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: 14,
      paddingVertical: spacing.xs,
    },
    card: {
      flexGrow: 1,
      minHeight: 44,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardActive: { backgroundColor: 'rgba(128,0,0,0.82)', borderColor: 'transparent' },
    cardDisabled: { opacity: 0.4 },
    cardTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    cardTxtActive: { color: '#fff' },
  })
}
