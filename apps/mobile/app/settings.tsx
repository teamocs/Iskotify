import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, Pressable, Alert, BackHandler, Switch } from 'react-native'
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
  Bug1Outlined,
  Comment1Outlined,
  Download1Outlined,
  Bell1Outlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'
import { ScreenScroll } from '../components/ui/ScreenScroll'
import { WebTopSpacer } from '../components/ui/WebTopSpacer'
import { Card } from '../components/ui/Card'
import { SectionHeader } from '../components/ui/SectionHeader'
import { AiModelDownloadSheet } from '../components/AiModelDownloadSheet'
import { useNotifications } from '../hooks/useNotifications'
import { useHomeStats } from '../hooks/useHomeStats'

function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${h12}:00 ${suffix}`
}

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
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.md },
    rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center' as const, justifyContent: 'center' as const, borderCurve: 'continuous' as const },
    rowLabel: { flex: 1, fontSize: typo.base, fontWeight: '500' as const, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    rowChevron: { color: t.textTertiary, fontSize: 18 },
  }), [t, typo])

  return (
    <Pressable
      style={({ pressed }) => [s.row, disabled && { opacity: 0.5 }, pressed && !disabled && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <View style={[s.rowIcon, { backgroundColor: iconBg }]}>
        <Lineicons icon={icon} size={15} color={iconColor} />
      </View>
      <Text style={[s.rowLabel, disabled && { color: t.textTertiary }]}>{label}</Text>
      <Text style={s.rowChevron}>›</Text>
    </Pressable>
  )
}

export default function SettingsScreen() {
  const db = useDb()
  const { theme: t, typo, themePref, setTheme } = useTheme()
  const [profileName, setProfileName] = useState('Student')
  const [profileEmail, setProfileEmail] = useState('')
  const [modelDownloadVisible, setModelDownloadVisible] = useState(false)
  const { focusedListings } = useHomeStats()
  const {
    enabled: notifEnabled, toggle: toggleNotifs,
    dailyReminderHour, weeklySummaryEnabled, setReminderHour, toggleWeeklySummary,
  } = useNotifications()

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
    backRow: { flexDirection: 'row' as const, paddingHorizontal: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },
    backBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    pageTitle: { fontSize: typo.h2, fontWeight: '700' as const, color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
    versionBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, alignSelf: 'flex-start' as const, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginBottom: spacing.xl, borderCurve: 'continuous' as const },
    versionApp: { fontSize: typo.xs, fontWeight: '700' as const, color: t.accentText, fontFamily: 'Outfit_700Bold' },
    versionDot: { width: 3, height: 3, backgroundColor: t.textTertiary, borderRadius: 99 },
    versionNum: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    profileCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
    profileAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: t.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
    profileName: { fontSize: typo.base, fontWeight: '700' as const, color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    profileSub: { fontSize: typo.sm, color: t.textTertiary, marginTop: 1, fontFamily: 'Lexend_400Regular' },
    rowChevron: { color: t.textTertiary, fontSize: 18 },
    divider: { height: 1, backgroundColor: t.divider },
    section: { gap: spacing.md },
    appearRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.md },
    appearIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface2, borderCurve: 'continuous' as const },
    appearLabel: { fontSize: typo.base, fontWeight: '500' as const, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    segWrap: { flexDirection: 'row' as const, backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border, borderRadius: radius.sm, padding: 3, gap: 2, marginLeft: 'auto' as const, borderCurve: 'continuous' as const },
    segBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7, alignItems: 'center' as const },
    segBtnOn: { backgroundColor: t.accent },
    segTxt: { fontSize: typo.xs, fontWeight: '600' as const, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    segTxtOn: { color: '#fff' },
    notifRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.md },
    notifLabel: { fontSize: typo.base, fontWeight: '500' as const, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    notifSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 1 },
    notifRowDisabled: { opacity: 0.45 },
    stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
    stepperBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border },
    stepperBtnTxt: { fontSize: 16, fontWeight: '700' as const, color: t.textPrimary },
    stepperValue: { fontSize: typo.sm, fontWeight: '700' as const, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold', minWidth: 68, textAlign: 'center' as const },
  }), [t, typo])

  const THEME_OPTIONS: { label: string; value: 'system' | 'light' | 'dark' }[] = [
    { label: 'Auto', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ]

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.backRow}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
      </View>

      <ScreenScroll tabBarInset={false} padded>
        <Text style={s.pageTitle}>Settings</Text>
        <View style={s.versionBadge}>
          <Text style={s.versionApp}>Iskotify</Text>
          <View style={s.versionDot} />
          <Text style={s.versionNum}>v{version}</Text>
        </View>

        <View style={s.section}>
          <Card elevated>
            <Pressable
              style={({ pressed }) => [s.profileCard, pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/(tabs)/profile')}
              accessibilityRole="button"
            >
              <View style={s.profileAvatar}>
                <Lineicons icon={User4Outlined} size={22} color="#fff" />
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
            </Pressable>
          </Card>

          <SectionHeader title="App" />
          <Card elevated padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <SettingsRow icon={SparkOutlined} iconBg={t.accentSurface} iconColor={t.accentText} label="About Iskotify"
              onPress={() => router.push('/about')} />
            <View style={s.divider} />
            <SettingsRow icon={QuestionMarkCircleOutlined} iconBg="rgba(96,165,250,0.12)" iconColor="#60a5fa" label="Help & Support"
              onPress={() => router.push('/help')} />
            <View style={s.divider} />
            <SettingsRow icon={Shield2Outlined} iconBg="rgba(245,158,11,0.10)" iconColor="#fbbf24" label="Privacy & Terms"
              onPress={() => router.push('/privacy')} />
          </Card>

          <SectionHeader title="AI Features" />
          <Card elevated padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <SettingsRow
              icon={Download1Outlined}
              iconBg="rgba(74,222,128,0.12)"
              iconColor="#4ade80"
              label="On-device AI model"
              onPress={() => setModelDownloadVisible(true)}
            />
          </Card>

          <SectionHeader title="Feedback" />
          <Card elevated padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <SettingsRow icon={Bug1Outlined} iconBg="rgba(248,113,113,0.12)" iconColor="#f87171" label="Report a Bug"
              onPress={() => router.push('/settings/report-bug')} />
            <View style={s.divider} />
            <SettingsRow icon={Comment1Outlined} iconBg="rgba(96,165,250,0.12)" iconColor="#60a5fa" label="Leave Feedback"
              onPress={() => router.push('/settings/leave-feedback')} />
          </Card>

          <SectionHeader title="Notifications" subtitle="Daily nudges, reminders, and your weekly summary" />
          <Card elevated padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <View style={s.notifRow}>
              <View style={s.appearIcon}>
                <Lineicons icon={Bell1Outlined} size={15} color={t.textSecondary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.notifLabel}>Push Notifications</Text>
                <Text style={s.notifSub}>{notifEnabled ? 'On' : 'Off'} — daily nudge, weekly summary, exam countdowns</Text>
              </View>
              <Switch
                value={notifEnabled}
                onValueChange={() => void toggleNotifs(focusedListings)}
                trackColor={{ false: t.border, true: 'rgba(252,165,165,0.55)' }}
                thumbColor={notifEnabled ? t.accentText : t.textTertiary}
                ios_backgroundColor={t.border}
              />
            </View>
            <View style={s.divider} />
            <View style={[s.notifRow, !notifEnabled && s.notifRowDisabled]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.notifLabel}>Daily reminder time</Text>
                <Text style={s.notifSub}>When your daily practice nudge fires</Text>
              </View>
              <View style={s.stepper}>
                <Pressable
                  style={({ pressed }) => [s.stepperBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => void setReminderHour((dailyReminderHour + 23) % 24, focusedListings)}
                  disabled={!notifEnabled}
                  accessibilityRole="button"
                  accessibilityLabel="Earlier"
                >
                  <Text style={s.stepperBtnTxt}>‹</Text>
                </Pressable>
                <Text style={s.stepperValue}>{formatHour(dailyReminderHour)}</Text>
                <Pressable
                  style={({ pressed }) => [s.stepperBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => void setReminderHour((dailyReminderHour + 1) % 24, focusedListings)}
                  disabled={!notifEnabled}
                  accessibilityRole="button"
                  accessibilityLabel="Later"
                >
                  <Text style={s.stepperBtnTxt}>›</Text>
                </Pressable>
              </View>
            </View>
            <View style={s.divider} />
            <View style={[s.notifRow, !notifEnabled && s.notifRowDisabled]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.notifLabel}>Weekly summary</Text>
                <Text style={s.notifSub}>Sunday nudge to review your weak areas</Text>
              </View>
              <Switch
                value={weeklySummaryEnabled}
                onValueChange={() => void toggleWeeklySummary(focusedListings)}
                disabled={!notifEnabled}
                trackColor={{ false: t.border, true: 'rgba(252,165,165,0.55)' }}
                thumbColor={weeklySummaryEnabled ? t.accentText : t.textTertiary}
                ios_backgroundColor={t.border}
              />
            </View>
          </Card>

          <SectionHeader title="Session" />
          <Card elevated padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <SettingsRow icon={ExitOutlined} iconBg="rgba(239,68,68,0.10)" iconColor="#f87171" label="Exit App" onPress={handleExitApp} />
          </Card>

          <SectionHeader title="Appearance" />
          <Card elevated padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <View style={s.appearRow}>
              <View style={s.appearIcon}>
                <Lineicons icon={Brush2Outlined} size={15} color={t.textSecondary} />
              </View>
              <Text style={s.appearLabel}>Theme</Text>
              <View style={s.segWrap}>
                {THEME_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [s.segBtn, themePref === opt.value && s.segBtnOn, pressed && { opacity: 0.7 }]}
                    onPress={() => void setTheme(opt.value)}
                    accessibilityRole="button"
                  >
                    <Text style={[s.segTxt, themePref === opt.value && s.segTxtOn]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Card>
        </View>
      </ScreenScroll>

      <AiModelDownloadSheet
        visible={modelDownloadVisible}
        onClose={() => setModelDownloadVisible(false)}
        onReady={() => setModelDownloadVisible(false)}
      />
    </SafeAreaView>
  )
}
