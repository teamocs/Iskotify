import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { StyleSheet, View, Text, Pressable, Alert, RefreshControl, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  User4Outlined,
  SparkOutlined,
  Gear1Outlined,
  Upload1Outlined,
  ChevronUpOutlined,
  ChevronDownOutlined,
  XmarkOutlined,
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
import { useFocusListings, type FocusListing } from '../../hooks/useFocusListings'
import { exportUserData, importUserData } from '../../services/export'
import { scholarshipProfileIncomplete, type IncomeBracket } from '../../utils/scholarshipMatch'
import { supabase } from '../../services/supabase'
import { clearWebData } from '../../services/webReset'
import { userSettings, listings, userProgress, practiceSessions, focusListings, savedDecks, userRequirements, coachPhrases } from '../../db/schema'
import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard'
import { TargetCoursesCard } from '../../components/TargetCoursesCard'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { ListCard } from '../../components/ui/ListCard'
import { spacing, radius, typography } from '../../theme/tokens'

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

// ── Drag-to-reorder focus item ───────────────────────────────────────────────

function DragHandle({ color }: { color: string }) {
  // 6-dot grip handle — instantly recognizable to all users
  return (
    <View style={{ width: 20, alignItems: 'center', gap: 3, paddingVertical: 2 }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
      </View>
    </View>
  )
}

function FocusListItem({
  item,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
  isDragging,
  onDragStart,
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
  const { theme: t, typo } = useTheme()
  const scale = useSharedValue(1)
  const bg = useSharedValue(0)

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: bg.value > 0.5
      ? (Platform.OS === 'ios' ? 'rgba(128,0,0,0.08)' : 'rgba(128,0,0,0.06)')
      : 'transparent',
    borderRadius: 12,
    zIndex: isDragging ? 10 : 1,
  }))

  // Long press to activate drag cue (visual feedback)
  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
      scale.value = withSpring(1.02, { damping: 12, stiffness: 300 })
      bg.value = withSpring(1, { damping: 12, stiffness: 300 })
      runOnJS(onDragStart)()
    })
    .onEnd(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 })
      bg.value = withSpring(0, { damping: 12, stiffness: 300 })
    })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 })
      bg.value = withSpring(0, { damping: 12, stiffness: 300 })
    })

  const isFirst = index === 0
  const isLast = index === total - 1

  return (
    <GestureDetector gesture={longPressGesture}>
      <Animated.View
        style={[
          animStyle,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 6,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: t.surfaceSubtle,
          },
        ]}
      >
        {/* Drag handle — 6-dot grip */}
        <Pressable
          onPress={() => Alert.alert('Reorder', 'Long-press this item to drag it up or down, or use the ↑↓ arrows.')}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Drag handle"
          accessibilityHint="Long-press to drag and reorder"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <DragHandle color={t.textTertiary} />
        </Pressable>

        {/* Priority badge */}
        <View style={{
          width: 28, height: 28, borderRadius: radius.pill,
          backgroundColor: t.accentStrong,
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Text style={{ fontSize: typo.sm, fontWeight: '700', color: t.textInverse, fontFamily: 'Outfit_700Bold' }}>
            #{item.priority}
          </Text>
        </View>

        {/* Title */}
        <Text
          style={{ flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' }}
          numberOfLines={1}
        >
          {item.title}
        </Text>

        {/* Up arrow */}
        <Pressable
          onPress={onMoveUp}
          disabled={isFirst}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Move up"
          style={({ pressed }) => [{ padding: spacing.xs, opacity: isFirst ? 0.25 : 1 }, pressed && !isFirst ? { opacity: 0.7 } : null]}
        >
          <Lineicons icon={ChevronUpOutlined} size={16} color={t.textSecondary} />
        </Pressable>

        {/* Down arrow */}
        <Pressable
          onPress={onMoveDown}
          disabled={isLast}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Move down"
          style={({ pressed }) => [{ padding: spacing.xs, opacity: isLast ? 0.25 : 1 }, pressed && !isLast ? { opacity: 0.7 } : null]}
        >
          <Lineicons icon={ChevronDownOutlined} size={16} color={t.textSecondary} />
        </Pressable>

        {/* Remove */}
        <Pressable
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Remove from focus list"
          style={({ pressed }) => [{ padding: spacing.xs }, pressed ? { opacity: 0.7 } : null]}
        >
          <Lineicons icon={XmarkOutlined} size={16} color={t.textTertiary} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const db = useDb()
  const [profile, setProfile] = useState<ProfileData>(DEFAULT)
  const { focusListings: focusListingsData, moveListing, removeListing } = useFocusListings()
  const { theme: t, typo } = useTheme()
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  const s = useMemo(() => StyleSheet.create({
    root:          { flex: 1, backgroundColor: t.bg },
    title:         { fontSize: typography.h2, color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
    subtitle:      { fontSize: typography.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: spacing.xs },
    avatarRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar:        { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    name:          { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 3 },
    schoolRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
    school:        { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    gradeChip:     { backgroundColor: t.accentStrong, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
    gradeText:     { fontSize: typo.xs, fontWeight: '700', color: t.textInverse, fontFamily: 'Outfit_700Bold' },
    listingRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
    listingTitle:  { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', flex: 1 },
    googleRow:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: t.divider },
    googleBadge:   { backgroundColor: t.textPrimary, borderRadius: radius.sm, paddingHorizontal: 4, paddingVertical: 1 },
    googleBadgeText: { fontSize: typo.sm, fontWeight: '700', color: t.bg, fontFamily: 'Outfit_700Bold' },
    googleEmail:   { flex: 1, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    signedInBadge: { backgroundColor: t.successSurface, borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2 },
    signedInText:  { fontSize: typo.xs, fontWeight: '600', color: t.success, fontFamily: 'Lexend_600SemiBold' },
    secTitle:      { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    dragHint:      { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: spacing.xs, marginBottom: 2 },
    analyticsHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    analyticsBody:    { marginTop: spacing.md },
    analyticsChevron: { fontSize: typography.sm, color: t.textTertiary, marginLeft: spacing.xs },
    signInCard:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
    signInBadge:   { width: 44, height: 44, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: t.textInverse, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    signInBadgeText: { fontSize: typo.xl, fontWeight: '700', color: t.accentStrong, fontFamily: 'Outfit_700Bold' },
    signInTitle:   { fontSize: typo.base, fontWeight: '700', color: t.textInverse, fontFamily: 'Outfit_700Bold' },
    signInSubtitle:{ fontSize: typo.sm, color: t.textInverse, opacity: 0.85, fontFamily: 'Lexend_400Regular', marginTop: 2 },
    signInChevron: { fontSize: 22, color: t.textInverse, opacity: 0.9 },
  }), [t, typo])

  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  const loadProfile = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const row = rows[0]
      if (!row) return

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
      }
    } catch (e) {
      console.warn('[profile] load error:', e)
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

  function handleChangeExam() {
    Alert.alert(
      'Change Exam',
      'This will clear your current selection and restart onboarding.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.update(userSettings)
                .set({ selectedListingSlug: '', lastSyncedAt: 0 })
                .where(eq(userSettings.id, 1))
              router.replace('/onboarding')
            } catch {
              Alert.alert('Error', 'Could not reset your selection. Please try again.')
            }
          },
        },
      ]
    )
  }

  async function handleExport() {
    try {
      const result = await exportUserData(db)
      if (result.status === 'saved') {
        Alert.alert('Export Complete', `Saved as ${result.filename}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not export data. Please try again.'
      Alert.alert('Export Failed', msg)
    }
  }

  async function handleImport() {
    try {
      await importUserData(db)
      Alert.alert('Import Successful', 'Your data has been restored.', [
        { text: 'OK', onPress: () => void loadProfile() },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not import data.'
      Alert.alert('Import Failed', msg)
    }
  }

  // On web, sign-out routes to /auth/sign-in (the web login screen).
  // On native, it routes to /landing (the native welcome/Google sign-in screen).
  const postSignOutRoute = Platform.OS === 'web' ? '/auth/sign-in' : '/landing'

  // Sign-IN entry (for users who skipped auth at startup) reuses the existing
  // auth flow — no duplicated OAuth code. Same route map as sign-out.
  const signInRoute = postSignOutRoute

  // Confirm helper — react-native-web's Alert.alert is a NO-OP (buttons never
  // render, onPress never fires), so destructive actions silently did nothing on
  // web. On web we use the synchronous window.confirm(); on native we keep the
  // existing two-button Alert.alert flow. The destructive action runs only after
  // a TRUE confirm on BOTH platforms. (Native behavior unchanged.)
  function confirmDestructive(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
    if (Platform.OS === 'web') {
      // typeof guard so this can never throw if window is unavailable.
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

  // Web reset is a FULL wipe: clearing Drizzle tables alone doesn't reset a web
  // user because the sql.js DB is persisted in IndexedDB and the Supabase session
  // lives in localStorage. On web, clearWebData() deletes IndexedDB('iskotify') +
  // sb-* localStorage keys, signs out, and hard-reloads to /auth/sign-in.
  // Native keeps the original db.transaction wipe + signOut + route.
  const resetTitle = Platform.OS === 'web' ? 'Clear data & start over?' : 'Reset App Data?'
  const resetMessage = Platform.OS === 'web'
    ? 'This will permanently delete ALL local data in this browser (progress, focus listings, settings) and sign you out. Your cloud backup (if you signed in) is unaffected.'
    : 'This will permanently delete ALL local data on this device (progress, focus listings, settings) and sign you out. Your cloud backup (if you signed in) is unaffected.'

  function handleResetAppData() {
    confirmDestructive(
      resetTitle,
      resetMessage,
      Platform.OS === 'web' ? 'Clear & start over' : 'Reset Everything',
      async () => {
        if (Platform.OS === 'web') {
          // Full web wipe (IndexedDB + localStorage + signOut + hard reload).
          // clearWebData() performs window.location.replace itself, so no
          // router.replace here.
          try {
            await clearWebData()
          } catch (err) {
            console.warn('[profile] web reset failed:', err)
          }
          return
        }
        try {
          await db.transaction((tx) => {
            tx.delete(userProgress).run()
            tx.delete(practiceSessions).run()
            tx.delete(focusListings).run()
            tx.delete(savedDecks).run()
            tx.delete(userSettings).run()
            tx.delete(userRequirements).run()
            tx.delete(coachPhrases).run()
          })
          await supabase.auth.signOut()
        } catch (err) {
          console.warn('[profile] reset failed:', err)
        }
        router.replace(postSignOutRoute)
      },
    )
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScreenScroll
        tabBarInset
        padded
        contentContainerStyle={{ paddingTop: spacing.md, gap: spacing.md }}
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
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.title}>Profile</Text>
            <Text style={s.subtitle}>Your account, focus list, and data</Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            style={({ pressed }) => [
              { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, alignItems: 'center', justifyContent: 'center' },
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <Lineicons icon={Gear1Outlined} size={16} color={t.textSecondary} />
          </Pressable>
        </View>

        {/* Identity card */}
        <Card elevated>
          <View style={s.avatarRow}>
            <View style={s.avatar}>
              <Lineicons icon={User4Outlined} size={22} color={t.textInverse} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={1}>{profile.fullName}</Text>
              <View style={s.schoolRow}>
                <Text style={s.school} numberOfLines={1}>{profile.school}</Text>
                {profile.gradeLevel ? (
                  <View style={s.gradeChip}>
                    <Text style={s.gradeText}>G{profile.gradeLevel}</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.listingRow}>
                <Lineicons icon={SparkOutlined} size={12} color={t.accentText} />
                <Text style={s.listingTitle} numberOfLines={1}>{profile.listingTitle}</Text>
              </View>
            </View>
          </View>

          {/* Google account row */}
          {profile.googleId ? (
            <View style={s.googleRow}>
              <View style={s.googleBadge}>
                <Text style={s.googleBadgeText}>G</Text>
              </View>
              <Text style={s.googleEmail} numberOfLines={1}>{profile.email}</Text>
              <View style={s.signedInBadge}>
                <Text style={s.signedInText}>Signed in</Text>
              </View>
            </View>
          ) : null}
        </Card>

        {/* Sign-in entry — only for users who skipped auth at startup (no googleId).
            Routes to the EXISTING auth flow; no duplicated OAuth code. */}
        {!profile.googleId ? (
          <Pressable
            onPress={() => router.push(signInRoute)}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google to back up your progress"
            style={({ pressed }) => [
              {
                backgroundColor: t.accentStrong,
                borderRadius: radius.xl,
                borderCurve: 'continuous',
                padding: spacing.lg,
                minHeight: 44,
              },
              pressed ? { opacity: 0.85 } : null,
            ]}
          >
            <View style={s.signInCard}>
              <View style={s.signInBadge}>
                <Text style={s.signInBadgeText} maxFontSizeMultiplier={1.4}>G</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.signInTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                  Sign in with Google
                </Text>
                <Text style={s.signInSubtitle} numberOfLines={2} maxFontSizeMultiplier={1.4}>
                  Save your data and restore it on any device
                </Text>
              </View>
              <Text style={s.signInChevron} maxFontSizeMultiplier={1.4}>›</Text>
            </View>
          </Pressable>
        ) : null}

        {/* My Focus List */}
        <Card elevated>
          <SectionHeader
            title="My Focus List"
            actionLabel="+ Add More"
            onAction={() => router.push('/(tabs)/listings')}
          />

          {focusListingsData.length > 1 ? (
            <Text style={s.dragHint}>Long-press the ⠿ handle to drag and reorder</Text>
          ) : null}

          {focusListingsData.length === 0 ? (
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginTop: spacing.sm }}>
              No exams in focus. Tap &quot;+ Add More&quot; to get started.
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

        {/* Target Courses — editable; lets older-onboarding users add courses later */}
        <TargetCoursesCard />

        {/* Scholarship matching profile — editable income / GWA / province (matcher fields) */}
        <ListCard
          icon={<Text style={{ fontSize: 18 }}>🎓</Text>}
          iconBg={profile.scholarshipIncomplete ? 'rgba(245,158,11,0.14)' : 'rgba(34,197,94,0.12)'}
          title="Scholarship Profile"
          subtitle={profile.scholarshipIncomplete ? 'Add income, GWA & province for better matches' : 'Complete — powering your scholarship matches'}
          onPress={() => router.push('/profile/scholarship-info')}
        />

        {/* Analytics section */}
        <Card elevated>
          <Pressable
            style={({ pressed }) => [s.analyticsHeader, pressed ? { opacity: 0.7 } : null]}
            onPress={() => setAnalyticsOpen(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel={analyticsOpen ? 'Collapse analytics' : 'Expand analytics'}
          >
            <Text style={s.secTitle}>Analytics</Text>
            <Text style={s.analyticsChevron}>{analyticsOpen ? '▲' : '▼'}</Text>
          </Pressable>
          {analyticsOpen ? (
            <View style={s.analyticsBody}>
              <AnalyticsDashboard scrollable={false} />
            </View>
          ) : null}
        </Card>

        {/* Action cards */}
        <ListCard
          icon={<Lineicons icon={Upload1Outlined} size={16} color={t.success} style={{ transform: [{ rotate: '180deg' }] }} />}
          iconBg="rgba(34,197,94,0.12)"
          title="Export Data"
          subtitle="Save your preferences as a JSON file"
          onPress={handleExport}
        />
        <ListCard
          icon={<Lineicons icon={Upload1Outlined} size={16} color="#3b82f6" />}
          iconBg="rgba(96,165,250,0.12)"
          title="Import Data"
          subtitle="Restore from a previously exported JSON file"
          onPress={handleImport}
        />
        <ListCard
          icon={<Text style={{ fontSize: typo.base, color: t.textSecondary }}>↪</Text>}
          iconBg="rgba(148,163,184,0.12)"
          title="Sign Out"
          subtitle="Sign out of your Google account on this device"
          onPress={handleSignOut}
        />
        <ListCard
          icon={<Text style={{ fontSize: typo.base, color: t.danger }}>⚠</Text>}
          iconBg="rgba(239,68,68,0.10)"
          title={Platform.OS === 'web' ? 'Clear data & sign out' : 'Reset App Data'}
          titleColor={t.danger}
          subtitle={Platform.OS === 'web'
            ? 'Permanently delete all local data in this browser and start over'
            : 'Permanently delete all local data on this device'}
          onPress={handleResetAppData}
        />
      </ScreenScroll>
    </SafeAreaView>
  )
}
