import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, Alert, ScrollView, RefreshControl, Platform } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
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
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { useFocusListings, type FocusListing } from '../../hooks/useFocusListings'
import { exportUserData, importUserData } from '../../services/export'
import { supabase } from '../../services/supabase'
import { userSettings, listings, userProgress, practiceSessions, focusListings, savedListings, savedDecks, userRequirements, coachPhrases } from '../../db/schema'
import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard'
import { TargetCoursesCard } from '../../components/TargetCoursesCard'

interface ProfileData {
  fullName: string
  school: string
  gradeLevel: number | null
  googleId: string
  email: string
  listingTitle: string
}

const DEFAULT: ProfileData = {
  fullName: 'Student',
  school: '—',
  gradeLevel: null,
  googleId: '',
  email: '',
  listingTitle: 'No exam selected',
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
        <TouchableOpacity
          onPress={() => Alert.alert('Reorder', 'Long-press this item to drag it up or down, or use the ↑↓ arrows.')}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          accessibilityLabel="Drag handle"
          accessibilityHint="Long-press to drag and reorder"
        >
          <DragHandle color={t.textTertiary} />
        </TouchableOpacity>

        {/* Priority badge */}
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: 'rgba(128,0,0,0.82)',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Text style={{ fontSize: typo.sm, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' }}>
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
        <TouchableOpacity
          onPress={onMoveUp}
          disabled={isFirst}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={{ padding: 4, opacity: isFirst ? 0.25 : 1 }}
          accessibilityLabel="Move up"
        >
          <Lineicons icon={ChevronUpOutlined} size={16} color={t.textSecondary} />
        </TouchableOpacity>

        {/* Down arrow */}
        <TouchableOpacity
          onPress={onMoveDown}
          disabled={isLast}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={{ padding: 4, opacity: isLast ? 0.25 : 1 }}
          accessibilityLabel="Move down"
        >
          <Lineicons icon={ChevronDownOutlined} size={16} color={t.textSecondary} />
        </TouchableOpacity>

        {/* Remove */}
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={{ padding: 4 }}
          accessibilityLabel="Remove from focus list"
        >
          <Lineicons icon={XmarkOutlined} size={16} color={t.textTertiary} />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const db = useDb()
  const insets = useSafeAreaInsets()
  const [profile, setProfile] = useState<ProfileData>(DEFAULT)
  const { focusListings: focusListingsData, moveListing, removeListing } = useFocusListings()
  const { theme: t, typo } = useTheme()
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  const s = useMemo(() => StyleSheet.create({
    root:          { flex: 1, backgroundColor: t.bg },
    title:         { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 0 },
    identityCard:  { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 12 },
    avatarRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar:        { width: 52, height: 52, borderRadius: 26, backgroundColor: '#800000', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    name:          { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 3 },
    schoolRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    school:        { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    gradeChip:     { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 980, paddingHorizontal: 6, paddingVertical: 2 },
    gradeText:     { fontSize: typo.xs, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    listingRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
    listingTitle:  { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', flex: 1 },
    googleRow:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.divider },
    googleBadge:   { backgroundColor: t.textPrimary, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
    googleBadgeText: { fontSize: typo.sm, fontWeight: '700', color: t.bg, fontFamily: 'Outfit_700Bold' },
    googleEmail:   { flex: 1, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    signedInBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    signedInText:  { fontSize: typo.xs, fontWeight: '600', color: '#16a34a', fontFamily: 'Lexend_600SemiBold' },
    card:          { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 10 },
    cardTitle:     { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    cardSub:       { fontSize: typo.sm, color: t.textSecondary, marginTop: 3, fontFamily: 'Lexend_400Regular' },
    focusSection:  { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 10 },
    secTitle:      { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    dragHint:      { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 4, marginBottom: 2 },
    analyticsSection: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, marginBottom: 10, overflow: 'hidden' },
    analyticsHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    analyticsBody:    { paddingHorizontal: 16, paddingBottom: 16 },
    analyticsChevron: { fontSize: 13, color: t.textTertiary, marginLeft: 4 },
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

  function handleSignOut() {
    Alert.alert(
      'Sign Out?',
      'Your local progress stays on this device. Your cloud backup is safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut()
            } catch (err) {
              console.warn('[profile] signOut failed:', err)
            }
            router.replace('/landing')
          },
        },
      ],
    )
  }

  function handleResetAppData() {
    Alert.alert(
      'Reset App Data?',
      'This will permanently delete ALL local data on this device (progress, focus listings, settings) and sign you out. Your cloud backup (if you signed in) is unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.transaction((tx) => {
                tx.delete(userProgress).run()
                tx.delete(practiceSessions).run()
                tx.delete(focusListings).run()
                tx.delete(savedListings).run()
                tx.delete(savedDecks).run()
                tx.delete(userSettings).run()
                tx.delete(userRequirements).run()
                tx.delete(coachPhrases).run()
              })
              await supabase.auth.signOut()
            } catch (err) {
              console.warn('[profile] reset failed:', err)
            }
            router.replace('/landing')
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={s.title}>Profile</Text>
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, alignItems: 'center', justifyContent: 'center' }}
          >
            <Lineicons icon={Gear1Outlined} size={16} color={t.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Identity card */}
        <View style={s.identityCard}>
          <View style={s.avatarRow}>
            <View style={s.avatar}>
              <Lineicons icon={User4Outlined} size={22} color="#fff" />
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
        </View>

        {/* My Focus List */}
        <View style={s.focusSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={s.secTitle}>My Focus List</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/listings')}>
              <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: 12, color: t.accentText }}>+ Add More</Text>
            </TouchableOpacity>
          </View>

          {focusListingsData.length > 1 && (
            <Text style={s.dragHint}>Long-press the ⠿ handle to drag and reorder</Text>
          )}

          {focusListingsData.length === 0 ? (
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginTop: 8 }}>
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
        </View>

        {/* Target Courses — editable; lets older-onboarding users add courses later */}
        <TargetCoursesCard />

        {/* Analytics section */}
        <View style={s.analyticsSection}>
          <TouchableOpacity
            style={s.analyticsHeader}
            activeOpacity={0.8}
            onPress={() => setAnalyticsOpen(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel={analyticsOpen ? 'Collapse analytics' : 'Expand analytics'}
          >
            <Text style={s.secTitle}>Analytics</Text>
            <Text style={s.analyticsChevron}>{analyticsOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {analyticsOpen && (
            <View style={s.analyticsBody}>
              <AnalyticsDashboard scrollable={false} />
            </View>
          )}
        </View>

        {/* Action cards */}
        <TouchableOpacity onPress={handleExport} style={s.card} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Lineicons icon={Upload1Outlined} size={14} color="#16a34a" style={{ transform: [{ rotate: '180deg' }] }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Export Data</Text>
              <Text style={s.cardSub}>Save your preferences as a JSON file</Text>
            </View>
            <Text style={{ color: t.textTertiary, fontSize: 18 }}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleImport} style={s.card} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(96,165,250,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Lineicons icon={Upload1Outlined} size={14} color="#3b82f6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Import Data</Text>
              <Text style={s.cardSub}>Restore from a previously exported JSON file</Text>
            </View>
            <Text style={{ color: t.textTertiary, fontSize: 18 }}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSignOut} style={s.card} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(148,163,184,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: t.textSecondary }}>↪</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Sign Out</Text>
              <Text style={s.cardSub}>Sign out of your Google account on this device</Text>
            </View>
            <Text style={{ color: t.textTertiary, fontSize: 18 }}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResetAppData} style={[s.card, { marginBottom: 32 }]} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.10)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#dc2626' }}>⚠</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: '#dc2626' }]}>Reset App Data</Text>
              <Text style={s.cardSub}>Permanently delete all local data on this device</Text>
            </View>
            <Text style={{ color: t.textTertiary, fontSize: 18 }}>›</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
