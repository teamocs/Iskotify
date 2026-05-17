import { useState, useCallback } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { User4Outlined, SparkOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { exportUserData } from '../../services/export'
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

  const load = useCallback(async () => {
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

      setProfile({
        fullName: s.fullName || 'Student',
        school: s.school || '—',
        gradeLevel: s.gradeLevel ?? null,
        googleId: s.googleId ?? '',
        email: s.email ?? '',
        listingTitle,
      })
    } catch (e) {
      console.warn('[profile] load error:', e)
    }
  }, [db])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

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
      await exportUserData(db)
    } catch {
      Alert.alert('Export Failed', 'Could not export data. Please try again.')
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.inner}>
        <Text style={s.title}>Profile</Text>

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

        {/* Action cards */}
        <TouchableOpacity onPress={handleChangeExam} style={s.card} activeOpacity={0.8}>
          <Text style={s.cardTitle}>Change Exam</Text>
          <Text style={s.cardSub}>Select a different exam to study for</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleExport} style={s.card} activeOpacity={0.8}>
          <Text style={s.cardTitle}>Export Data</Text>
          <Text style={s.cardSub}>Save your preferences as a JSON file</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#1a1a2e' },
  inner:         { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  title:         { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 16 },
  identityCard:  { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 16, marginBottom: 12 },
  avatarRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:        { width: 52, height: 52, borderRadius: 26, backgroundColor: '#800000', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:          { fontSize: 18, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', marginBottom: 3 },
  schoolRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  school:        { fontSize: 11, color: 'rgba(255,255,255,0.50)', fontFamily: 'Lexend_400Regular' },
  gradeChip:     { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 980, paddingHorizontal: 6, paddingVertical: 2 },
  gradeText:     { fontSize: 9, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  listingRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  listingTitle:  { fontSize: 11, color: 'rgba(255,255,255,0.60)', fontFamily: 'Lexend_400Regular', flex: 1 },
  googleRow:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' },
  googleBadge:   { backgroundColor: '#fff', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  googleBadgeText: { fontSize: 10, fontWeight: '700', color: '#1a1a2e', fontFamily: 'Outfit_700Bold' },
  googleEmail:   { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.60)', fontFamily: 'Lexend_400Regular' },
  signedInBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  signedInText:  { fontSize: 9, fontWeight: '600', color: '#4ade80', fontFamily: 'Lexend_600SemiBold' },
  card:          { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 16, marginBottom: 10 },
  cardTitle:     { fontSize: 13, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold' },
  cardSub:       { fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 3, fontFamily: 'Lexend_400Regular' },
})
