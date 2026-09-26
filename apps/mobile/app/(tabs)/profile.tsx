import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Pressable, Alert, RefreshControl, Platform } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  ArrowLeftOutlined,
  Gear1Outlined,
  Upload1Outlined,
  Download1Outlined,
  ChevronUpOutlined,
  ChevronDownOutlined,
  XmarkOutlined,
  GoogleOutlined,
  ExitOutlined,
  Trash3Outlined,
  TrendUp1Outlined,
  GraduationCap1Outlined,
} from '@lineiconshq/free-icons'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useFocusListings, type FocusListing } from '../../hooks/useFocusListings'
import { exportUserData, importUserData } from '../../services/export'
import { resetStudyData } from '../../services/resetStudyData'
import { scholarshipProfileIncomplete, type IncomeBracket } from '../../utils/scholarshipMatch'
import { supabase } from '../../services/supabase'
import { clearWebData } from '../../services/webReset'
import { userSettings, listings } from '../../db/schema'
import { TargetCoursesCard } from '../../components/TargetCoursesCard'
import { Screen } from '../../components/ui/Screen'
import { TwoColumn } from '../../components/ui/TwoColumn'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { ListRow } from '../../components/ui/ListRow'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { WebRefreshButton } from '../../components/ui/WebRefreshButton'
import { decorative, focusRing, type WebPressableState } from '../../components/ui/a11y'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { useSyncStatus } from '../../hooks/useSyncStatus'
import { syncOnLaunch } from '../../services/sync'

interface ProfileData {
  fullName: string
  school: string
  gradeLevel: number | null
  googleId: string
  email: string
  listingTitle: string
  scholarshipIncomplete: boolean
}

const DEFAULT: ProfileData = {
  fullName: 'Student',
  school: '—',
  gradeLevel: null,
  googleId: '',
  email: '',
  listingTitle: 'No exam selected',
  scholarshipIncomplete: true,
}

type LoadStatus = 'loading' | 'ready' | 'error'

/** A 44×44 icon button (header actions, reorder controls). */
function IconButton({
  icon, label, onPress, disabled, hint, tone = 'secondary',
}: {
  icon: typeof Gear1Outlined
  label: string
  onPress: () => void
  disabled?: boolean
  hint?: string
  tone?: 'primary' | 'secondary'
}) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-disabled={!!disabled}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        return [
          {
            width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
            backgroundColor: (pressed || hovered) && !disabled ? t.surface2 : 'transparent',
            opacity: disabled ? 0.35 : 1,
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <Lineicons icon={icon} size={20} color={tone === 'primary' ? t.textPrimary : t.textSecondary} />
    </Pressable>
  )
}

// ── Drag-to-reorder focus item ───────────────────────────────────────────────

function DragHandle({ color }: { color: string }) {
  // 6-dot grip, drawn (not a glyph).
  const dot = { width: 4, height: 4, borderRadius: 2, backgroundColor: color }
  return (
    <View {...decorative} style={{ width: 20, alignItems: 'center', gap: 3, paddingVertical: 2 }}>
      {[0, 1, 2].map(r => (
        <View key={r} style={{ flexDirection: 'row', gap: 3 }}>
          <View style={dot} />
          <View style={dot} />
        </View>
      ))}
    </View>
  )
}

function FocusListItem({
  item, index, total, onMoveUp, onMoveDown, onRemove, isDragging, onDragStart,
}: {
  item: FocusListing
  index: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  isDragging: boolean
  onDragStart: () => void
}) {
  const { theme: t } = useTheme()
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  const lifted = useSharedValue(0)
  const liftedBg = t.surface2

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: lifted.value > 0.5 ? liftedBg : 'transparent',
    zIndex: isDragging ? 10 : 1,
  }))

  // Long press lifts the row (visual cue). Under reduced motion the lift is
  // an instant background change, with no scale spring.
  const spring = { damping: 12, stiffness: 300 }
  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
      scale.value = reduced ? 1 : withSpring(1.02, spring)
      lifted.value = 1
      runOnJS(onDragStart)()
    })
    .onFinalize(() => {
      scale.value = reduced ? 1 : withSpring(1, spring)
      lifted.value = 0
    })

  const isFirst = index === 0
  const isLast = index === total - 1

  return (
    <GestureDetector gesture={longPressGesture}>
      <Animated.View
        style={[
          animStyle,
          {
            flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 56,
            borderRadius: radius.md, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: t.divider,
          },
        ]}
      >
        <Pressable
          onPress={() => Alert.alert('Reorder', 'Long-press an exam to drag it, or use the up and down buttons.')}
          accessibilityRole="button"
          accessibilityLabel={`Reorder ${item.title}`}
          accessibilityHint="Long-press to drag, or use the up and down buttons"
          style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <DragHandle color={t.textTertiary} />
        </Pressable>

        {/* Badge pins itself to flex-start; the wrapper centres it in the row. */}
        <View style={{ alignSelf: 'center' }}>
          <Badge label={`#${item.priority}`} tone="accent" />
        </View>

        <Text style={[textStyle('titleSm', t.textPrimary), { flex: 1, marginLeft: spacing.xs }]} numberOfLines={2} maxFontSizeMultiplier={2}>
          {item.title}
        </Text>

        <IconButton icon={ChevronUpOutlined} label={`Move ${item.title} up`} onPress={onMoveUp} disabled={isFirst} />
        <IconButton icon={ChevronDownOutlined} label={`Move ${item.title} down`} onPress={onMoveDown} disabled={isLast} />
        <IconButton icon={XmarkOutlined} label={`Remove ${item.title} from your focus list`} onPress={onRemove} />
      </Animated.View>
    </GestureDetector>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

/**
 * Profile (opened from the avatar; not a tab). Identity, focus list and
 * target courses on the left; links to Progress and the scholarship profile,
 * then data and account actions on the right (desktop), stacked on phones.
 * Analytics lives in Progress only — this screen links there.
 */
export default function ProfileScreen() {
  const db = useDb()
  const bp = useBreakpoint()
  const [profile, setProfile] = useState<ProfileData>(DEFAULT)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const { focusListings: focusListingsData, moveListing, removeListing } = useFocusListings()
  const { theme: t } = useTheme()
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null)

  const sync = useSyncStatus()
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  const loadProfile = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const row = rows[0]
      if (!row) {
        if (isMountedRef.current) setStatus('ready')
        return
      }

      let listingTitle = 'No exam selected'
      if (row.selectedListingSlug) {
        const lr = await db
          .select({ title: listings.title })
          .from(listings)
          .where(eq(listings.slug, row.selectedListingSlug))
          .limit(1)
        listingTitle = lr[0]?.title ?? 'No exam selected'
      }

      if (isMountedRef.current) {
        setProfile({
          fullName: row.fullName || 'Student',
          school: row.school || '—',
          gradeLevel: row.gradeLevel ?? null,
          googleId: row.googleId ?? '',
          email: row.email ?? '',
          listingTitle,
          scholarshipIncomplete: scholarshipProfileIncomplete({
            gwa: row.gwa ?? null,
            province: row.province ?? null,
            incomeBracket: (row.incomeBracket as IncomeBracket | null) ?? null,
          }),
        })
        setStatus('ready')
      }
    } catch (e) {
      console.warn('[profile] load error:', e)
      if (isMountedRef.current) setStatus('error')
    } finally {
      loadingRef.current = false
    }
  }, [db])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useFocusEffect(useCallback(() => {
    void loadProfile()
  }, [loadProfile]))

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await loadProfile() } finally { setRefreshing(false) }
  }, [loadProfile])

  // Web-only refresh: run a full sync then reload profile data.
  const webRefresh = useCallback(async () => {
    if (refreshing || sync.isSyncing) return
    setRefreshing(true)
    try {
      await syncOnLaunch(db)
      await loadProfile()
    } catch (e) {
      console.warn('[profile] webRefresh error:', e)
    } finally {
      setRefreshing(false)
    }
  }, [db, loadProfile, refreshing, sync.isSyncing])

  const retry = useCallback(() => {
    setStatus('loading')
    void loadProfile()
  }, [loadProfile])

  async function handleExport() {
    try {
      const result = await exportUserData(db)
      if (result.status === 'saved') {
        Alert.alert('Export complete', `Saved as ${result.filename}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not export data. Please try again.'
      Alert.alert('Export failed', msg)
    }
  }

  async function handleImport() {
    try {
      await importUserData(db)
      Alert.alert('Import successful', 'Your data has been restored.', [
        { text: 'OK', onPress: () => void loadProfile() },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not import data.'
      Alert.alert('Import failed', msg)
    }
  }

  // On web, sign-out routes to /auth/sign-in (the web login screen).
  // On native, it routes to /landing (the native welcome/Google sign-in screen).
  const postSignOutRoute = Platform.OS === 'web' ? '/auth/sign-in' : '/landing'
  // Sign-IN entry (for users who skipped auth at startup) reuses the existing auth flow.
  const signInRoute = postSignOutRoute

  // react-native-web's Alert.alert is a NO-OP, so destructive actions use
  // window.confirm() on web and the two-button Alert on native. The action
  // runs only after a TRUE confirm on both platforms.
  function confirmDestructive(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false
      if (ok) onConfirm()
      return
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ])
  }

  function handleSignOut() {
    confirmDestructive(
      'Sign Out?',
      'Your local progress stays on this device. Your cloud backup is safe.',
      'Sign Out',
      async () => {
        try {
          await supabase.auth.signOut()
        } catch (err) {
          console.warn('[profile] signOut failed:', err)
        }
        router.replace(postSignOutRoute)
      },
    )
  }

  // Web reset is a FULL wipe: clearWebData() deletes IndexedDB('iskotify') +
  // sb-* localStorage keys, signs out, and hard-reloads to /auth/sign-in.
  // Native clears every study table (services/resetStudyData.ts; notes are
  // kept) + signOut + route.
  const resetTitle = Platform.OS === 'web' ? 'Clear data & start over?' : 'Reset App Data?'
  const resetMessage = Platform.OS === 'web'
    ? 'This will permanently delete ALL local data in this browser (progress, focus listings, settings) and sign you out. Your cloud backup (if you signed in) is unaffected.'
    : 'This permanently deletes all your study data on this device: progress, practice sessions, answer history, flashcard reviews, study plan, focus list and settings. It also signs you out. Your notes are kept; you can delete them from Notes. Want a copy? Use Export Data first. Your cloud backup (if you signed in) is unaffected.'

  function handleResetAppData() {
    confirmDestructive(
      resetTitle,
      resetMessage,
      Platform.OS === 'web' ? 'Clear & start over' : 'Reset Everything',
      async () => {
        if (Platform.OS === 'web') {
          try {
            await clearWebData()
          } catch (err) {
            console.warn('[profile] web reset failed:', err)
          }
          return
        }
        try {
          await resetStudyData(db)
          await supabase.auth.signOut()
        } catch (err) {
          console.warn('[profile] reset failed:', err)
        }
        router.replace(postSignOutRoute)
      },
    )
  }

  const rowIcon = (icon: typeof Gear1Outlined, color: string) => <Lineicons icon={icon} size={20} color={color} />
  const divided = (i: number) => ({ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider })

  // ── Identity ────────────────────────────────────────────────────────────────
  let identity: React.ReactNode
  if (status === 'loading') {
    identity = (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Skeleton accessible label="Loading your profile" width={52} height={52} radius={radius.pill} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width="60%" height={22} />
            <Skeleton width="40%" height={14} />
          </View>
        </View>
      </Card>
    )
  } else if (status === 'error') {
    identity = (
      <Card>
        <ErrorState title="Couldn't load your profile" onRetry={retry} />
      </Card>
    )
  } else {
    identity = (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Avatar name={profile.fullName} size={52} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={textStyle('headline', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={1.6}>{profile.fullName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={1} maxFontSizeMultiplier={2}>{profile.school}</Text>
              {profile.gradeLevel ? <Badge label={`G${profile.gradeLevel}`} tone="accent" /> : null}
            </View>
            <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={1} maxFontSizeMultiplier={2}>
              {profile.listingTitle}
            </Text>
          </View>
        </View>

        {profile.googleId ? (
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
              marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: t.divider,
            }}
          >
            <View {...decorative}>
              <Lineicons icon={GoogleOutlined} size={18} color={t.textSecondary} />
            </View>
            <Text style={[textStyle('bodySm', t.textSecondary), { flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={2}>
              {profile.email}
            </Text>
            <View
              style={{
                backgroundColor: t.successSurface, borderWidth: 1, borderColor: t.successBorder,
                borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2,
              }}
            >
              <Text style={[textStyle('caption', t.successStrong), { fontFamily: fonts.bodySemi }]} maxFontSizeMultiplier={1.6}>
                Signed in
              </Text>
            </View>
          </View>
        ) : null}
      </Card>
    )
  }

  const primary = (
    <View style={{ gap: spacing.xxl }}>
      <View style={{ gap: spacing.md }}>
        {identity}

        {/* Sign-in entry — only for users who skipped auth at startup (no googleId).
            Routes to the EXISTING auth flow; no duplicated OAuth code. */}
        {status === 'ready' && !profile.googleId ? (
          <Card>
            <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>Back up your progress</Text>
            <Text style={[textStyle('bodySm', t.textSecondary), { marginTop: spacing.xs, marginBottom: spacing.md }]} maxFontSizeMultiplier={2}>
              Save your data and restore it on any device
            </Text>
            <Button
              label="Sign in with Google"
              accessibilityLabel="Sign in with Google to back up your progress"
              icon={<Lineicons icon={GoogleOutlined} size={18} color={t.textInverse} />}
              onPress={() => router.push(signInRoute)}
            />
          </Card>
        ) : null}
      </View>

      <View>
        <SectionHeader
          title="My Focus List"
          subtitle={focusListingsData.length > 1 ? 'Long-press an exam to drag it, or use the up and down buttons.' : undefined}
          actionLabel="Add more"
          onAction={() => router.push('/(tabs)/explore')}
        />
        <Card padded={false} style={{ paddingHorizontal: spacing.sm }}>
          {focusListingsData.length === 0 ? (
            <Text style={[textStyle('bodySm', t.textSecondary), { padding: spacing.md }]} maxFontSizeMultiplier={2}>
              No exams in focus yet. Tap Add more to pick one.
            </Text>
          ) : (
            focusListingsData.map((item, idx) => (
              <FocusListItem
                key={item.slug}
                item={item}
                index={idx}
                total={focusListingsData.length}
                onMoveUp={() => void moveListing(item.slug, 'up')}
                onMoveDown={() => void moveListing(item.slug, 'down')}
                onRemove={() => void removeListing(item.slug)}
                isDragging={draggingSlug === item.slug}
                onDragStart={() => setDraggingSlug(item.slug)}
              />
            ))
          )}
        </Card>
      </View>

      {/* Target Courses — editable; lets older-onboarding users add courses later */}
      <TargetCoursesCard />
    </View>
  )

  const secondary = (
    <View style={{ gap: spacing.xxl }}>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <ListRow
          title="Progress and analytics"
          subtitle="Readiness, accuracy, pace and mistakes"
          leading={rowIcon(TrendUp1Outlined, t.accentText)}
          onPress={() => router.push('/(tabs)/progress')}
        />
        <View style={divided(1)}>
          <ListRow
            title="Scholarship profile"
            subtitle={profile.scholarshipIncomplete ? 'Add income, GWA and province for better matches' : 'Complete. Powering your scholarship matches'}
            leading={rowIcon(GraduationCap1Outlined, profile.scholarshipIncomplete ? t.warningStrong : t.successStrong)}
            onPress={() => router.push('/profile/scholarship-info')}
          />
        </View>
      </Card>

      <View>
        <SectionHeader title="Your data" />
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow
            title="Export Data"
            subtitle="Save your preferences as a JSON file"
            leading={rowIcon(Download1Outlined, t.textSecondary)}
            onPress={handleExport}
          />
          <View style={divided(1)}>
            <ListRow
              title="Import Data"
              subtitle="Restore from a previously exported JSON file"
              leading={rowIcon(Upload1Outlined, t.textSecondary)}
              onPress={handleImport}
            />
          </View>
          <View style={divided(1)}>
            <ListRow
              title="Sign Out"
              subtitle="Sign out of your Google account on this device"
              leading={rowIcon(ExitOutlined, t.textSecondary)}
              onPress={handleSignOut}
            />
          </View>
          <View style={divided(1)}>
            <ListRow
              title={Platform.OS === 'web' ? 'Clear data & sign out' : 'Reset App Data'}
              subtitle={Platform.OS === 'web'
                ? 'Permanently delete all local data in this browser and start over'
                : 'Delete your study data on this device. Notes are kept'}
              leading={rowIcon(Trash3Outlined, t.danger)}
              onPress={handleResetAppData}
            />
          </View>
        </Card>
      </View>
    </View>
  )

  return (
    <Screen
      tabBarInset
      width={bp === 'expanded' ? 'wide' : 'reading'}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={t.accent}
          colors={[t.accent]}
          progressBackgroundColor={t.surface}
        />
      }
    >
      {/* Profile opens from the avatar (not a tab), so it carries its own Back. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
        <View style={{ marginLeft: -spacing.sm }}>
          <IconButton
            icon={ArrowLeftOutlined}
            label="Back"
            tone="primary"
            onPress={() => (router.canGoBack?.() ? router.back() : router.replace('/'))}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.4}>Profile</Text>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>Your account, focus list and data</Text>
        </View>
        <WebRefreshButton onRefresh={webRefresh} refreshing={refreshing} iconOnly={bp === 'compact'} />
        <IconButton icon={Gear1Outlined} label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <TwoColumn primary={primary} secondary={secondary} />
    </Screen>
  )
}
