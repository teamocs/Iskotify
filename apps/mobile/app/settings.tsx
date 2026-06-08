import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, BackHandler } from 'react-native'
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
  ExitOutlined,
  Brush2Outlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'
import { useTheme } from '../theme/ThemeContext'

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
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    row: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, marginBottom: 4 },
    rowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
    rowLabel: { flex: 1, fontSize: typo.sm, fontWeight: '500' as const, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    rowChevron: { color: t.textTertiary, fontSize: 18 },
  }), [t, typo])

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
      <Text style={[s.rowLabel, disabled && { color: t.textTertiary }]}>{label}</Text>
      <Text style={s.rowChevron}>›</Text>
    </TouchableOpacity>
  )
}

export default function SettingsScreen() {
  const db = useDb()
  const { theme: t, typo, themePref, setTheme } = useTheme()
  const [profileName, setProfileName] = useState('Student')
  const [profileEmail, setProfileEmail] = useState('')

  useEffect(() => {
    async function load() {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const row = rows[0]
      if (!row) return
      setProfileName(row.fullName || 'Student')
      setProfileEmail(row.email ?? '')
    }
    void load()
  }, [db])

  function handleExitApp() {
    Alert.alert(
      'Exit Iskotify',
      'Are you sure you want to exit?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ]
    )
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: { flexDirection: 'row' as const, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
    backBtn: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    scroll: { paddingHorizontal: 16, paddingBottom: 40 },
    pageTitle: { fontSize: typo.xl, fontWeight: '700' as const, color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
    versionBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, alignSelf: 'flex-start' as const, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 16 },
    versionApp: { fontSize: typo.xs, fontWeight: '700' as const, color: t.accentText, fontFamily: 'Outfit_700Bold' },
    versionDot: { width: 3, height: 3, backgroundColor: t.textTertiary, borderRadius: 99 },
    versionNum: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    profileCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 12, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 16 },
    profileAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: t.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
    profileName: { fontSize: typo.sm, fontWeight: '700' as const, color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    profileSub: { fontSize: typo.xs, color: t.textTertiary, marginTop: 1, fontFamily: 'Lexend_400Regular' },
    rowChevron: { color: t.textTertiary, fontSize: 18 },
    secLabel: { fontSize: typo.xs, fontWeight: '600' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const, color: t.textTertiary, marginBottom: 5, marginTop: 12, fontFamily: 'Lexend_600SemiBold' },
    appearRow: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, marginBottom: 4 },
    appearIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface },
    appearLabel: { fontSize: typo.sm, fontWeight: '500' as const, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    segWrap: { flexDirection: 'row' as const, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 3, gap: 2, marginLeft: 'auto' as const },
    segBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, alignItems: 'center' as const },
    segBtnOn: { backgroundColor: t.accent },
    segTxt: { fontSize: typo.xs, fontWeight: '600' as const, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    segTxtOn: { color: '#fff' },
  }), [t, typo])

  const THEME_OPTIONS: { label: string; value: 'system' | 'light' | 'dark' }[] = [
    { label: 'Auto', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ]

  return (
    <SafeAreaView style={s.root}>
      <View style={s.backRow}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Settings</Text>
        <View style={s.versionBadge}>
          <Text style={s.versionApp}>Iskotify</Text>
          <View style={s.versionDot} />
          <Text style={s.versionNum}>v{version}</Text>
        </View>

        <TouchableOpacity style={s.profileCard} onPress={() => router.push('/(tabs)/profile')} activeOpacity={0.8}>
          <View style={s.profileAvatar}>
            <Lineicons icon={User4Outlined} size={18} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.profileName} numberOfLines={1}>{profileName}</Text>
            {profileEmail ? (
              <Text style={s.profileSub} numberOfLines={1}>{profileEmail}</Text>
            ) : (
              <Text style={s.profileSub}>View Profile</Text>
            )}
          </View>
          <Text style={s.rowChevron}>›</Text>
        </TouchableOpacity>

        <Text style={s.secLabel}>App</Text>
        <SettingsRow icon={SparkOutlined} iconBg={t.accentSurface} iconColor={t.accentText} label="About Iskotify"
          onPress={() => router.push('/about')} />
        <SettingsRow icon={QuestionMarkCircleOutlined} iconBg="rgba(96,165,250,0.12)" iconColor="#60a5fa" label="Help & Support"
          onPress={() => router.push('/help')} />
        <SettingsRow icon={Shield2Outlined} iconBg="rgba(245,158,11,0.10)" iconColor="#fbbf24" label="Privacy & Terms"
          onPress={() => router.push('/privacy')} />

        <Text style={s.secLabel}>Session</Text>
        <SettingsRow icon={ExitOutlined} iconBg="rgba(239,68,68,0.10)" iconColor="#f87171" label="Exit App" onPress={handleExitApp} />

        <Text style={s.secLabel}>Appearance</Text>
        <View style={s.appearRow}>
          <View style={s.appearIcon}>
            <Lineicons icon={Brush2Outlined} size={13} color={t.textSecondary} />
          </View>
          <Text style={s.appearLabel}>Theme</Text>
          <View style={s.segWrap}>
            {THEME_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.segBtn, themePref === opt.value && s.segBtnOn]}
                onPress={() => void setTheme(opt.value)}
                activeOpacity={0.8}
              >
                <Text style={[s.segTxt, themePref === opt.value && s.segTxtOn]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
