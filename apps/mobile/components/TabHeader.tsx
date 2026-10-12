import { router } from 'expo-router'
import { Avatar } from './ui/Avatar'
import { useProfileName } from '../hooks/useProfileName'
import { LargeTitleHeader } from './navigation/LargeTitleHeader'

interface Props {
  title: string
  subtitle?: string
  /** Extra header actions (e.g. the web refresh button), placed before the avatar. */
  actions?: React.ReactNode
  /** Pass when the screen already knows the name, to skip the lookup. */
  avatarName?: string
}

/**
 * The header every tab shares: a large title (a header for screen readers)
 * that collapses into the inline title band once scrolled (see
 * LargeTitleHeader), an optional subtitle, and the avatar that opens Profile.
 */
export function TabHeader({ title, subtitle, actions, avatarName }: Props) {
  const looked = useProfileName(avatarName === undefined)
  const name = avatarName ?? looked

  return (
    <LargeTitleHeader
      title={title}
      subtitle={subtitle}
      actions={(
        <>
          {actions}
          <Avatar
            name={name}
            size={36}
            onPress={() => router.push('/profile')}
            accessibilityLabel="Profile"
            accessibilityHint="Opens your profile and settings"
          />
        </>
      )}
    />
  )
}
