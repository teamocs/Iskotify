import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, Alert, ScrollView, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { User4Outlined, SparkOutlined, Gear1Outlined, Upload1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { useFocusListings } from '../../hooks/useFocusListings'
import { exportUserData, importUserData } from '../../services/export'
import { userSettings, listings } from '../../db/schema'

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

export default function ProfileScreen() {
  const db = useDb()
  const [profile, setProfile] = useState<ProfileData>(DEFAULT)
  const { focusListings: focusListingsData, moveListing, removeListing } = useFocusListings()
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    root:          { flex: 1, backgroundColor: t.bg },
    inner:         { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
    title:         { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 16 },
    identityCard:  { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 12 },
    avatarRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar:        { width: 52, height: 52, borderRadius: 26, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
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
    signedInText:  { fontSize: typo.xs, fontWeight: '600', color: '#4ade80', fontFamily: 'Lexend_600SemiBold' },
    card:          { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 10 },
    cardTitle:     { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    cardSub:       { fontSize: typo.sm, color: t.textSecondary, marginTop: 3, fontFamily: 'Lexend_400Regular' },
    focusSection:  { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 10 },
    secTitle:      { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    focusItem:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.surfaceSubtle },
    focusPriorityBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(128,0,0,0.82)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    focusPriorityTxt: { fontSize: typo.sm, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    focusItemTitle: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
  }), [t, typo])

  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  const loadProfile = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const s = rows[0]
      if (!s) return

      let listingTitle = 'No exam selected'
      if (s.selectedListingSlug) {
        const lr = await db
          .select({ title: listings.title })
          .from(listings)
          .where(eq(listings.slug, s.selectedListingSlug))
          .limit(1)
        listingTitle = lr[0]?.title ?? 'No exam selected'
      }

      if (isMountedRef.current) {
        setProfile({
          fullName: s.fullName || 'Student',
          school: s.school || '—',
          gradeLevel: s.gradeLevel ?? null,
          googleId: s.googleId ?? '',
          email: s.email ?? '',
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
      // status === 'cancelled' — user backed out of the picker, no alert
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

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12 }}
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={[s.title, { marginBottom: 0 }]}>Profile</Text>
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
                <Lineicons icon={SparkOutlined} size={12} color="#fca5a5" />
                <Text style={s.listingTitle} numberOfLines={1}>{profile.listingTitle}</Text>
              </View>
            </View>
          </View>

          {/* Google account row — only shown when signed in */}
          {profile.googleId ? (
            <View style={s.googleRow}>
              <View style={s.googleBadge}>
                <Text style={s.googleBadgeText}>G</Text>
              </View>
              <Text style={s.googleEmail} numberOfLines={1}>{profile.email}</Text>
              <View style={s.signedInBadge}>
                <Text style={s.signedInText}>Signed in with Google</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* My Focus List */}
        <View style={s.focusSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={s.secTitle}>My Focus List</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/listings')}>
              <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(128,0,0,0.80)' }}>+ Add More</Text>
            </TouchableOpacity>
          </View>
          {focusListingsData.length === 0 ? (
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginBottom: 4 }}>
              No exams in focus. Tap "+ Add More" to get started.
            </Text>
          ) : (
            focusListingsData.map(item => (
              <View key={item.slug} style={s.focusItem}>
                <View style={s.focusPriorityBadge}>
                  <Text style={s.focusPriorityTxt}>#{item.priority}</Text>
                </View>
                <Text style={s.focusItemTitle} numberOfLines={1}>{item.title}</Text>
                <TouchableOpacity
                  onPress={() => moveListing(item.slug, 'up')}
                  disabled={item.priority === 1}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={{ fontSize: 16, color: item.priority === 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)' }}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveListing(item.slug, 'down')}
                  disabled={item.priority === focusListingsData.length}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={{ fontSize: 16, color: item.priority === focusListingsData.length ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)' }}>↓</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeListing(item.slug)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                  <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.30)' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Action cards */}
        <TouchableOpacity onPress={handleExport} style={s.card} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.10)', alignItems: 'center', justifyContent: 'center' }}>
              <Lineicons icon={Upload1Outlined} size={14} color="#4ade80" style={{ transform: [{ rotate: '180deg' }] }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Export Data</Text>
              <Text style={s.cardSub}>Save your preferences as a JSON file</Text>
            </View>
            <Text style={{ color: t.textTertiary, fontSize: 18 }}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleImport} style={[s.card, { marginBottom: 32 }]} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(96,165,250,0.10)', alignItems: 'center', justifyContent: 'center' }}>
              <Lineicons icon={Upload1Outlined} size={14} color="#60a5fa" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Import Data</Text>
              <Text style={s.cardSub}>Restore from a previously exported JSON file</Text>
            </View>
            <Text style={{ color: t.textTertiary, fontSize: 18 }}>›</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
