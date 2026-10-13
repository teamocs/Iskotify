import { memo, type ReactNode } from 'react'
import { View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { layout, radius, spacing } from '../../theme/tokens'
import { Badge } from '../ui/Badge'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { decorative, focusRing } from '../ui/a11y'
import type { BadgeSpec } from './exploreModel'

type IconData = Parameters<typeof Lineicons>[0]['icon']

interface Props {
  /** Lineicons icon naming the kind of thing (exam, scholarship, course…). Decorative. */
  icon?: IconData
  /** A leading node in place of the icon tile (a school's LogoTile, a DateTile). Decorative. */
  leading?: ReactNode
  title: string
  /** One line of plain facts: city · exam · courses, or provider · exact date. */
  meta?: string
  /** "Official site: {host}" — only when the listing has an official link. */
  source?: string | null
  /** Status badges, most time-critical first. Text carries the meaning. */
  badges?: readonly BadgeSpec[]
  onPress: () => void
  accessibilityHint?: string
  testID?: string
}

/**
 * Explore's one listing unit, an iOS grouped-list row: a leading tile (icon,
 * logo initials or a date leaf), a semibold title, a footnote line of facts,
 * the official source when there is one, badges, and a chevron. It draws no
 * panel of its own: ExploreGrid groups the rows on one surface (phones) or
 * gives each its own rounded tile (tablet and desktop columns). The whole row
 * is one button whose name includes every fact and badge; it settles to 0.97
 * on press (PressableScale). No maroon fill: maroon is saved for the detail
 * page's single primary action.
 */
export const ListingCard = memo(function ListingCard({
  icon, leading, title, meta, source, badges, onPress, accessibilityHint, testID,
}: Props) {
  const { theme: t } = useTheme()
  const label = [title, meta, source, ...(badges ?? []).map(b => b.label)].filter(Boolean).join(', ')

  const lead = leading ?? (icon ? (
    <View
      style={{
        width: 44, height: 44, borderRadius: radius.field, borderCurve: 'continuous',
        backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Lineicons icon={icon} size={20} color={t.textSecondary} />
    </View>
  ) : null)

  return (
    <PressableScale
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed, hovered, focused }) => [
        {
          flex: 1,
          minHeight: Math.max(layout.rowMinHeight, 64),
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: pressed ? t.surface2 : hovered ? t.surfaceSubtle : 'transparent',
        },
        focusRing(t.focusRing, focused),
      ]}
    >
      {lead ? <View {...decorative} style={{ flexShrink: 0 }}>{lead}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text role="headline" numberOfLines={2}>{title}</Text>
        {meta ? <Text role="footnote" color={t.textSecondary} numberOfLines={2}>{meta}</Text> : null}
        {source ? <Text role="footnote" color={t.textSecondary} numberOfLines={1}>{source}</Text> : null}
        {badges && badges.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
            {badges.map(b => <Badge key={b.label} label={b.label} tone={b.tone} />)}
          </View>
        ) : null}
      </View>
      <View {...decorative} style={{ flexShrink: 0, transform: [{ scaleX: -1 }] }}>
        <Lineicons icon={ChevronLeftOutlined} size={14} color={t.textTertiary} />
      </View>
    </PressableScale>
  )
})
