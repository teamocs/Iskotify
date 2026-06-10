import { View, Text, Pressable } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

interface Props {
  /** Leading glyph/emoji or icon element (rendered inside a rounded-square box). */
  icon?: React.ReactNode
  iconBg?: string
  title: string
  subtitle?: string
  /** Trailing content: chevron by default, or pass a node (badge / progress text). */
  trailing?: React.ReactNode
  showChevron?: boolean
  onPress?: () => void
  onLongPress?: () => void
  /** 0–1 progress; renders a thin bar along the bottom edge (Progress List Card variant). */
  progress?: number
  /** Override the progress bar fill color (e.g. severity red/amber/green). Defaults to accent. */
  progressColor?: string
  /** Override the title color (e.g. danger red for destructive rows). Defaults to textPrimary. */
  titleColor?: string
}

/** Full-width list card: leading icon box → title/subtitle → trailing (design system §3). */
export function ListCard({
  icon, iconBg, title, subtitle, trailing, showChevron = true, onPress, onLongPress, progress, progressColor, titleColor,
}: Props) {
  const { theme: t, typo } = useTheme()
  const Container: typeof Pressable | typeof View = onPress || onLongPress ? Pressable : (View as never)
  const interactive = !!(onPress || onLongPress)

  return (
    <Container
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={interactive ? 'button' : undefined}
      style={
        interactive
          ? ({ pressed }: { pressed: boolean }) => [cardStyle(t), pressed ? { opacity: 0.7 } : null]
          : cardStyle(t)
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg }}>
        {icon ? (
          <View style={{
            width: 44, height: 44, borderRadius: radius.md, borderCurve: 'continuous',
            backgroundColor: iconBg ?? t.accentSurface, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {icon}
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: typo.base, fontWeight: '700', color: titleColor ?? t.textPrimary, fontFamily: 'Outfit_700Bold' }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing ?? (showChevron ? <Text style={{ fontSize: 20, color: t.textTertiary }}>›</Text> : null)}
      </View>
      {progress != null ? (
        <View style={{ height: 3, backgroundColor: t.surface2, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: 'hidden' }}>
          <View style={{ height: 3, width: `${Math.max(0, Math.min(1, progress)) * 100}%`, backgroundColor: progressColor ?? t.accent }} />
        </View>
      ) : null}
    </Container>
  )
}

function cardStyle(t: ReturnType<typeof useTheme>['theme']) {
  return {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radius.xl,
    borderCurve: 'continuous' as const,
    boxShadow: t.shadowSm,
    overflow: 'hidden' as const,
  }
}
