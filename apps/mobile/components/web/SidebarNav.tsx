/**
 * SidebarNav — persistent navigation for expanded web (≥ 1024).
 *
 * Same four destinations as the bottom TabBar (Today / Practice / Explore /
 * Progress), as links inside a navigation landmark; the current one carries
 * aria-current="page". Profile (avatar + name) and Settings sit at the bottom.
 *
 * Hover: react-native-web exposes `hovered` in the Pressable style function.
 * Focus rings: RN-Web's default focus-visible outline is kept.
 */
// RN Image is fine for a tiny bundled asset.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { View, Text, Pressable, Image } from 'react-native'
import { usePathname, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Gear1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { TAB_DESTINATIONS, activeDestination } from '../navigation/destinations'
import { Avatar } from '../ui/Avatar'
import { useProfileName } from '../../hooks/useProfileName'

const SIDEBAR_WIDTH = 248

// aria-current is honoured by react-native-web but missing from RN's types.
const CURRENT_PAGE = { 'aria-current': 'page' } as Record<string, string>

interface ItemProps {
  label: string
  /** Secondary line inside the link (e.g. the student's name under Profile). */
  sublabel?: string
  active: boolean
  onPress: () => void
  leading: React.ReactNode
}

function SidebarLink({ label, sublabel, active, onPress, leading }: ItemProps) {
  const { theme: t } = useTheme()
  const color = active ? t.accentText : t.textSecondary
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      {...(active ? CURRENT_PAGE : null)}
      style={(state) => {
        const { hovered, pressed } = state as { hovered?: boolean; pressed: boolean }
        return {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: 44,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: active ? t.accentSurface : hovered ? t.surface2 : 'transparent',
          opacity: pressed ? 0.75 : 1,
        }
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[textStyle('body', color), { fontFamily: active ? fonts.heading : fonts.bodyMedium }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text style={textStyle('caption', t.textSecondary)} numberOfLines={1}>{sublabel}</Text>
        ) : null}
      </View>
    </Pressable>
  )
}

/** Rendered only on web at the expanded breakpoint (see app/(tabs)/_layout.tsx). */
export function SidebarNav() {
  const { theme: t } = useTheme()
  const pathname = usePathname()
  const current = activeDestination(pathname)
  const name = useProfileName()
  const onProfile = pathname.replace(/^\/\(tabs\)/, '').startsWith('/profile')
  const onSettings = pathname.startsWith('/settings')

  return (
    <View
      testID="sidebar-nav"
      role="navigation"
      accessibilityLabel="Main"
      style={{
        width: SIDEBAR_WIDTH,
        alignSelf: 'stretch',
        backgroundColor: t.surface,
        borderRightWidth: 1,
        borderRightColor: t.border,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.xl }}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={{ width: 32, height: 32, borderRadius: radius.sm }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <Text style={textStyle('headline', t.textPrimary)}>Iskotify</Text>
      </View>

      <View style={{ gap: spacing.xs }}>
        {TAB_DESTINATIONS.map(dest => {
          const active = current === dest.name
          return (
            <SidebarLink
              key={dest.name}
              label={dest.label}
              active={active}
              onPress={() => router.push(dest.href as never)}
              leading={<Lineicons icon={dest.icon} size={20} color={active ? t.accentText : t.textSecondary} />}
            />
          )
        })}
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.sm, gap: spacing.xs }}>
        <SidebarLink
          label="Profile"
          sublabel={name || undefined}
          active={onProfile}
          onPress={() => router.push('/profile' as never)}
          leading={<Avatar name={name} size={28} />}
        />
        <SidebarLink
          label="Settings"
          active={onSettings}
          onPress={() => router.push('/settings' as never)}
          leading={<Lineicons icon={Gear1Outlined} size={20} color={onSettings ? t.accentText : t.textSecondary} />}
        />
      </View>
    </View>
  )
}
