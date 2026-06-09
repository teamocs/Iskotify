import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { PillButton } from './PillButton'

interface Props {
  title: string
  subtitle?: string
  ctaLabel?: string
  onCta?: () => void
  /** Large graphic/illustration rendered on the right (e.g. mascot Image). */
  illustration?: React.ReactNode
  /** Override the maroon-tinted hero background. */
  backgroundColor?: string
}

/**
 * Dashboard hero card (design system §3): max-radius container, left-stacked
 * title/subtitle + inline pill CTA, large illustration on the right.
 */
export function HeroCard({ title, subtitle, ctaLabel, onCta, illustration, backgroundColor }: Props) {
  const { theme: t, typo } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: backgroundColor ?? t.accentSurface,
        borderWidth: 1,
        borderColor: 'rgba(128,0,0,0.28)',
        borderRadius: radius.xxl,
        borderCurve: 'continuous',
        boxShadow: t.shadowMd,
        padding: spacing.xl,
        overflow: 'hidden',
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <Text style={{ fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 }}>
            {subtitle}
          </Text>
        ) : null}
        {ctaLabel && onCta ? (
          <View style={{ marginTop: spacing.sm }}>
            <PillButton label={ctaLabel} onPress={onCta} />
          </View>
        ) : null}
      </View>
      {illustration ? <View style={{ flexShrink: 0 }}>{illustration}</View> : null}
    </View>
  )
}
