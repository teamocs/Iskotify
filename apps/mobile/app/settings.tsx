import { useState, useEffect } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  User4Outlined,
  SparkOutlined,
  QuestionMarkCircleOutlined,
  Shield2Outlined,
  Download1Outlined,
  Brush2Outlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../hooks/useDb'
import { userSettings, listings } from '../db/schema'
import { exportUserData } from '../services/export'

const version = Constants.expoConfig?.version ?? '1.0.0'

function SettingsRow({
  icon, iconBg, iconColor, label, onPress, disabled,
}: {
  icon: typeof SparkOutlined
  iconBg: string
  iconColor: string
  label: string
  onPress?: () => void
  disabled?: boolean
}) {
  return (
    <TouchableOpacity
      style={[s.row, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={[s.rowIcon, { backgroundColor: iconBg }]}>
        <Lineicons icon={icon} size={13} color={iconColor} />
      </View>
      <Text style={[s.rowLabel, disabled && { color: 'rgba(255,255,255,0.38)' }]}>{label}</Text>
      <Text style={s.rowChevron}>›</Text>
    </TouchableOpacity>
  )
}

export default function SettingsScreen() {
  const db = useDb()
  const [listingTitle, setListingTitle] = useState('')

  useEffect(() => {
    async function load() {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const slug = rows[0]?.selectedListingSlug ?? ''
      if (!slug) return
      const lr = await db.select({ title: listings.title }).from(listings).where(eq(listings.slug, slug)).limit(1)
      setListingTitle(lr[0]?.title ?? slug)
    }
    void load()
  }, [db])

  async function handleExport() {
    try {
      await exportUserData(db)
    } catch {
      Alert.alert('Export Failed', 'Could not export data. Please try again.')
    }
  }

  return (
    <SafeAreaView style={s.root}>
      {/* Back button */}
      <View style={s.backRow}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Title + version badge */}
        <Text style={s.pageTitle}>Settings</Text>
        <View style={s.versionBadge}>
          <Text style={s.versionApp}>Iskotify</Text>
          <View style={s.versionDot} />
          <Text style={s.versionNum}>v{version}</Text>
        </View>

        {/* Profile card */}
        <TouchableOpacity style={s.profileCard} activeOpacity={0.8}>
          <View style={s.profileAvatar}>
            <Lineicons icon={User4Outlined} size={18} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.profileName} numberOfLines={1}>{listingTitle || 'Student'}</Text>
            <Text style={s.profileSub}>Class of 2027</Text>
          </View>
          <Text style={s.rowChevron}>›</Text>
        </TouchableOpacity>

        {/* App section */}
        <Text style={s.secLabel}>App</Text>
        <SettingsRow
          icon={SparkOutlined}
          iconBg="rgba(128,0,0,0.12)"
          iconColor="#fca5a5"
          label="About Iskotify"
          onPress={() => Alert.alert('Iskotify', `Version ${version}\n\nYour ultimate UPCAT & scholarship companion.`)}
        />
        <SettingsRow
          icon={QuestionMarkCircleOutlined}
          iconBg="rgba(96,165,250,0.12)"
          iconColor="#60a5fa"
          label="Help & Support"
          onPress={() => Alert.alert('Help', 'Support docs coming soon.')}
        />
        <SettingsRow
          icon={Shield2Outlined}
          iconBg="rgba(245,158,11,0.10)"
          iconColor="#fbbf24"
          label="Privacy & Terms"
          onPress={() => Alert.alert('Privacy', 'Privacy policy coming soon.')}
        />

        {/* Data section */}
        <Text style={s.secLabel}>Data</Text>
        <SettingsRow
          icon={Download1Outlined}
          iconBg="rgba(34,197,94,0.10)"
          iconColor="#4ade80"
          label="Export Data"
          onPress={handleExport}
        />

        {/* Appearance section */}
        <Text style={s.secLabel}>Appearance</Text>
        <View style={[s.row, { opacity: 0.5 }]}>
          <View style={[s.rowIcon, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
            <Lineicons icon={Brush2Outlined} size={13} color="rgba(255,255,255,0.4)" />
          </View>
          <Text style={[s.rowLabel, { color: 'rgba(255,255,255,0.38)' }]}>Theme</Text>
          <View style={s.soonChip}><Text style={s.soonTxt}>Coming soon</Text></View>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  backRow: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: 'rgba(255,255,255,0.62)', fontSize: 28, lineHeight: 32 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
  versionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 16 },
  versionApp: { fontSize: 9, fontWeight: '700', color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
  versionDot: { width: 3, height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99 },
  versionNum: { fontSize: 9, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  profileCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  profileAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#800000', alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  profileSub: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 1, fontFamily: 'Lexend_400Regular' },
  secLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 5, marginTop: 12, fontFamily: 'Lexend_600SemiBold' },
  row: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 4 },
  rowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 11, fontWeight: '500', color: '#fff', fontFamily: 'Lexend_500Medium' },
  rowChevron: { color: 'rgba(255,255,255,0.38)', fontSize: 18 },
  soonChip: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  soonTxt: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_600SemiBold' },
})
