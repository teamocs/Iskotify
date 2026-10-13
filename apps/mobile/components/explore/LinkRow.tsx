import { View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ArrowAngularTopRightOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, weight } from '../../theme/tokens'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { decorative, focusRing } from '../ui/a11y'
import { externalLinkProps } from './externalLink'

interface Props {
  label: string
  /** Where the link goes: a real anchor on web, Linking.openURL on native. */
  url: string
  /** Secondary line, e.g. the domain. */
  detail?: string
  /** Spoken name when the visible label needs context (e.g. which exam). */
  accessibilityLabel?: string
  /** Inside an InsetGroup: pad to the group's row inset. */
  grouped?: boolean
}

/**
 * An outbound link as a full-width row (at least 48pt): link role (a real
 * <a href> on web), a drawn "opens elsewhere" arrow, and a spoken name that
 * says it leaves the app. Settles to 0.97 on press.
 */
export function LinkRow({ label, url, detail, accessibilityLabel, grouped = false }: Props) {
  const { theme: t } = useTheme()
  return (
    <PressableScale
      {...externalLinkProps(url)}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? `${label}, opens in your browser`}
      accessibilityHint={accessibilityLabel ? 'Opens in your browser' : undefined}
      style={({ pressed, hovered, focused }) => [
        {
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: grouped ? spacing.lg : 0,
          backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
        },
        focusRing(t.focusRing, focused),
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text role="body" color={t.accentText} style={[weight('600'), { textDecorationLine: 'underline' }]}>
          {label}
        </Text>
        {detail ? <Text role="footnote" color={t.textSecondary} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <View {...decorative}>
        <Lineicons icon={ArrowAngularTopRightOutlined} size={16} color={t.accentText} />
      </View>
    </PressableScale>
  )
}
