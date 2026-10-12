import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, weight } from '../../theme/tokens'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { decorative, focusRing } from '../ui/a11y'
import { fmtLongDate, fmtMonthDay, officialSourceLine, relativeDay } from './exploreModel'

interface Props {
  /** What kind of date leads, e.g. "Next scholarship deadline". */
  eyebrow: string
  title: string
  /** The open deadline the card is about (always a real catalog date). */
  deadline: number
  /** Who gives it (scholarship provider, exam body), when the catalog names one. */
  provider?: string | null
  /** The listing's official link; the card names its host only when it exists. */
  externalUrl?: string | null
  onPress: () => void
  accessibilityHint?: string
  now?: number
}

/**
 * The deep featured card: an ink ground with maroon and amber shapes, white
 * text, a date capsule ("Closes Oct 20") and one factual line (provider, the
 * exact date, the official source). The caller shows it only when the
 * catalog holds an open deadline (exploreModel.pickFeatured), never invented.
 */
export function FeaturedCard({ eyebrow, title, deadline, provider, externalUrl, onPress, accessibilityHint, now }: Props) {
  const { theme: t } = useTheme()
  const capsule = `Closes ${fmtMonthDay(deadline)}`
  const when = relativeDay(deadline, now)
  const facts = [provider || null, `Apply by ${fmtLongDate(deadline)}`].filter(Boolean).join(' · ')
  const source = officialSourceLine(externalUrl)
  const label = [eyebrow, title, capsule, when, facts, source].filter(Boolean).join(', ')

  return (
    <PressableScale
      testID="featured-card"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ focused }) => [
        {
          borderRadius: radius.card,
          borderCurve: 'continuous',
          backgroundColor: t.textPrimary, // the ink ground (#2d0a0a)
          overflow: 'hidden',
          padding: spacing.xl,
          gap: spacing.sm,
          minHeight: 148,
        },
        focusRing(t.focusRing, focused),
      ]}
    >
      {/* Maroon and amber shapes, drawn first so the text sits over them. */}
      <View {...decorative} pointerEvents="none" style={{ position: 'absolute', top: -48, right: -40, width: 168, height: 168, borderRadius: 84, backgroundColor: t.accent, opacity: 0.9 }} />
      <View {...decorative} pointerEvents="none" style={{ position: 'absolute', bottom: -56, right: 56, width: 112, height: 112, borderRadius: 56, backgroundColor: t.warning, opacity: 0.55 }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text role="footnote" color={t.textInverse} style={[weight('600'), { opacity: 0.85, flexShrink: 1 }]}>{eyebrow}</Text>
        <View
          testID="featured-date"
          style={{
            paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
            borderRadius: radius.capsule, backgroundColor: t.textInverse,
          }}
        >
          <Text role="footnote" chrome style={weight('600')}>{capsule}</Text>
        </View>
      </View>
      <Text role="title2" color={t.textInverse} numberOfLines={3}>{title}</Text>
      <Text role="subheadline" color={t.textInverse} style={{ opacity: 0.9 }}>
        {when ? `${when} · ${facts}` : facts}
      </Text>
      {source ? (
        <Text role="footnote" color={t.textInverse} style={{ opacity: 0.85 }}>{source}</Text>
      ) : null}
    </PressableScale>
  )
}
