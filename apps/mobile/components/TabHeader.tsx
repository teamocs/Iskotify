import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { spacing, textStyle } from '../theme/tokens'
import { Avatar } from './ui/Avatar'
import { useProfileName } from '../hooks/useProfileName'

interface Props {
  title: string
  subtitle?: string
  /** Extra header actions (e.g. the web refresh button), placed before the avatar. */
  actions?: React.ReactNode
  /** Pass when the screen already knows the name, to skip the lookup. */
  avatarName?: string
}

/**
 * The header every tab shares: screen title (a header for screen readers),
 * optional subtitle, and the avatar that opens Profile — Profile is no longer
 * a tab (redesign M1).
 */
export function TabHeader({ title, subtitle, actions, avatarName }: Props) {
  const { theme: t } = useTheme()
  const looked = useProfileName(avatarName === undefined)
  const name = avatarName ?? looked

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[textStyle('bodySm', t.textSecondary), { marginTop: 2 }]} maxFontSizeMultiplier={1.4}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions}
      <Avatar
        name={name}
        size={36}
        onPress={() => router.push('/profile')}
        accessibilityLabel="Profile"
        accessibilityHint="Opens your profile and settings"
      />
    </View>
  )
}
