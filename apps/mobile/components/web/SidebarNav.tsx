/**
 * SidebarNav — persistent desktop sidebar for lg breakpoint (web only).
 *
 * Reuses the exact same icon components as TabBar.tsx:
 *   Home2Outlined, Bolt2Outlined, GraduationCap1Outlined, Bell1Outlined
 * plus User4Outlined for profile and Gear1Outlined for settings.
 *
 * Hover support: react-native-web 0.21.2 exposes `hovered` in the Pressable
 * style function — VERIFIED in node_modules/react-native-web/src/exports/Pressable/index.js.
 * We use style={({hovered, pressed}) => [...]} directly (no onHoverIn/Out needed).
 *
 * focus-visible: RN-Web adds focus rings by default — not removed here.
 */
// RN Image is fine for a tiny bundled asset.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { View, Text, Pressable, StyleSheet, Image, Platform } from 'react-native'
import { usePathname, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Home2Outlined,
  Bolt2Outlined,
  GraduationCap1Outlined,
  Bell1Outlined,
  User4Outlined,
  Gear1Outlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, typography } from '../../theme/tokens'

const SIDEBAR_WIDTH = 240

interface NavEntry {
  label: string
  icon: typeof Home2Outlined
  route: string
  // The route segment that counts as "active" (pathname must start with this)
  activePrefix: string
}

const NAV_ITEMS: NavEntry[] = [
  { label: 'Home',    icon: Home2Outlined,           route: '/',          activePrefix: '/(tabs)/index' },
  { label: 'Exams',   icon: Bolt2Outlined,            route: '/practice',  activePrefix: '/practice' },
  { label: 'Lists',   icon: GraduationCap1Outlined,   route: '/listings',  activePrefix: '/listings' },
  { label: 'Updates', icon: Bell1Outlined,             route: '/updates',   activePrefix: '/updates' },
]

const BOTTOM_ITEMS: NavEntry[] = [
  { label: 'Profile',  icon: User4Outlined,  route: '/profile',  activePrefix: '/profile' },
  { label: 'Settings', icon: Gear1Outlined,  route: '/settings', activePrefix: '/settings' },
]

// Expo-router on web uses pathnames like "/" for the index tab.
// We also check for the /(tabs)/ segment that expo-router may return.
function isActive(pathname: string, entry: NavEntry): boolean {
  if (entry.route === '/') {
    return pathname === '/' || pathname === '/index' || pathname === '/(tabs)/index' || pathname === '/(tabs)'
  }
  // Strip /(tabs) prefix for comparison
  const clean = pathname.replace(/^\/\(tabs\)/, '')
  return clean === entry.route || clean.startsWith(entry.route + '/') ||
    pathname.startsWith(entry.activePrefix)
}

interface SidebarItemProps {
  entry: NavEntry
  active: boolean
  onPress: () => void
}

function SidebarItem({ entry, active, onPress }: SidebarItemProps) {
  const { theme: t } = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.label}
      accessibilityState={{ selected: active }}
      style={(state) => {
        // RN-Web 0.21.2: style function receives { hovered, focused, pressed }
        const { hovered, pressed } = state as { hovered?: boolean; focused?: boolean; pressed: boolean }
        return [
          styles.item,
          active && { backgroundColor: t.accentSurface },
          hovered && !active && { backgroundColor: t.surface },
          pressed && { opacity: 0.75 },
        ]
      }}
    >
      <Lineicons
        icon={entry.icon}
        size={20}
        color={active ? t.accentText : t.textSecondary}
      />
      <Text
        style={[
          styles.itemLabel,
          { color: active ? t.accentText : t.textSecondary },
          active && { fontFamily: 'Outfit_700Bold' },
        ]}
        numberOfLines={1}
      >
        {entry.label}
      </Text>
      {active ? (
        <View style={[styles.activePill, { backgroundColor: t.accentText }]} />
      ) : null}
    </Pressable>
  )
}

/**
 * Rendered only when Platform.OS === 'web' and breakpoint === 'lg'.
 * The layout switch in app/(tabs)/_layout.tsx conditionally mounts this.
 */
export function SidebarNav() {
  const { theme: t } = useTheme()
  const pathname = usePathname()

  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: t.tabBar,
          borderRightColor: t.border,
        },
      ]}
    >
      {/* Logo + app name */}
      <View style={styles.logoRow}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={styles.logoImg}
          resizeMode="contain"
          accessibilityLabel="Iskotify logo"
        />
        <Text style={[styles.appName, { color: t.textPrimary }]}>Iskotify</Text>
      </View>

      {/* Primary nav items */}
      <View style={styles.navSection}>
        {NAV_ITEMS.map(entry => (
          <SidebarItem
            key={entry.route}
            entry={entry}
            active={isActive(pathname, entry)}
            onPress={() => router.push(entry.route as any)}
          />
        ))}
      </View>

      {/* Spacer pushes bottom items down */}
      <View style={{ flex: 1 }} />

      {/* Bottom: Profile + Settings */}
      <View style={[styles.bottomSection, { borderTopColor: t.border }]}>
        {BOTTOM_ITEMS.map(entry => (
          <SidebarItem
            key={entry.route}
            entry={entry}
            active={isActive(pathname, entry)}
            onPress={() => router.push(entry.route as any)}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    // On web, position: 'sticky' / 'fixed' is not a valid RN style value.
    // The parent layout (tabs _layout) uses flexDirection:'row'; this sidebar
    // is a flex sibling, so it stays visible while content scrolls independently.
    alignSelf: 'stretch',
    borderRightWidth: 1,
    paddingTop: Platform.OS === 'web' ? 0 : 0,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
    // Ensure sidebar is above content on web
    zIndex: 10,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  logoImg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  appName: {
    fontSize: typography.md,
    fontFamily: 'Outfit_700Bold',
    letterSpacing: -0.3,
  },
  navSection: {
    gap: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    minHeight: 44,
    // cursor: pointer is automatic for Pressable on web (RN-Web applies it)
  },
  itemLabel: {
    flex: 1,
    fontSize: typography.sm,
    fontFamily: 'Outfit_600SemiBold',
    letterSpacing: 0.1,
  },
  activePill: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  bottomSection: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
})
