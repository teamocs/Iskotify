import { memo } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Badge } from '../ui/Badge'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import type { BadgeSpec } from './exploreModel'

type IconData = Parameters<typeof Lineicons>[0]['icon']

interface Props {
  /** Lineicons icon naming the kind of thing (exam, scholarship, school…). Decorative. */
  icon: IconData
  title: string
  /** One line of plain facts: date · place. */
  meta?: string
  /** Status badges, most time-critical first. Text carries the meaning. */
  badges?: readonly BadgeSpec[]
  onPress: () => void
  accessibilityHint?: string
  testID?: string
}

/**
 * Explore's one listing unit (replaces ListCard in this area): a bordered,
 * neutral card — no maroon; maroon is saved for the detail page's single
 * primary action. Fills its grid cell so a row of cards shares one height.
 * The whole card is one button whose name includes every badge.
 */
export const ListingCard = memo(function ListingCard({
  icon, title, meta, badges, onPress, accessibilityHint, testID,
}: Props) {
  const { theme: t } = useTheme()
  const label = [title, meta, ...(badges ?? []).map(b => b.label)].filter(Boolean).join(', ')

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        return [
          {
            flex: 1,
            minHeight: 72,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: hovered ? t.accentBorder : t.border,
            backgroundColor: pressed ? t.surface2 : t.surface,
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <View
        {...decorative}
        style={{
          width: 40, height: 40, borderRadius: radius.sm, borderCurve: 'continuous',
          backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <Lineicons icon={icon} size={20} color={t.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={1.6}>
          {title}
        </Text>
        {meta ? (
          <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={2} maxFontSizeMultiplier={1.6}>
            {meta}
          </Text>
        ) : null}
        {badges && badges.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
            {badges.map(b => <Badge key={b.label} label={b.label} tone={b.tone} />)}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
})
