import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ArrowAngularTopRightOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { externalLinkProps } from './externalLink'

interface Props {
  label: string
  /** Where the link goes: a real anchor on web, Linking.openURL on native. */
  url: string
  /** Secondary line, e.g. the domain. */
  detail?: string
  /** Spoken name when the visible label needs context (e.g. which exam). */
  accessibilityLabel?: string
}

/**
 * An outbound link as a full-width 48pt row: link role (a real <a href> on
 * web), a drawn "opens elsewhere" arrow, and a spoken name that says it
 * leaves the app.
 */
export function LinkRow({ label, url, detail, accessibilityLabel }: Props) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      {...externalLinkProps(url)}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? `${label}, opens in your browser`}
      accessibilityHint={accessibilityLabel ? 'Opens in your browser' : undefined}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        return [
          {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[textStyle('label', t.accentText), { textDecorationLine: 'underline' }]} maxFontSizeMultiplier={1.6}>
          {label}
        </Text>
        {detail ? (
          <Text style={textStyle('caption', t.textSecondary)} numberOfLines={1} maxFontSizeMultiplier={1.6}>{detail}</Text>
        ) : null}
      </View>
      <View {...decorative}>
        <Lineicons icon={ArrowAngularTopRightOutlined} size={16} color={t.accentText} />
      </View>
    </Pressable>
  )
}
