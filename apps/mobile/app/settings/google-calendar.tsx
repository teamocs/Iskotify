import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'

export default function GoogleCalendarSettings() {
  const { theme: t, typo } = useTheme()
  const { connected, busy, connect, disconnect } = useGoogleCalendar()

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
    back: { fontSize: 22, color: t.textSecondary },
    title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    body: { padding: 16, gap: 16 },
    card: { backgroundColor: t.surface2, borderColor: t.divider, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
    status: { fontSize: typo.md, fontWeight: '700', color: connected ? '#16a34a' : t.textSecondary },
    desc: { fontSize: typo.sm, color: t.textTertiary, lineHeight: 20 },
    btn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    btnConnect: { backgroundColor: t.accent },
    btnDisconnect: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.divider },
    btnConnectTxt: { color: '#fff', fontWeight: '700', fontSize: typo.md },
    btnDisconnectTxt: { color: t.accentText, fontWeight: '700', fontSize: typo.md },
  }), [t, typo, connected])

  async function handleConnect() {
    const ok = await connect()
    if (!ok) Alert.alert('Connection failed', 'Could not connect Google Calendar. Please try again.')
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back"><Text style={s.back}>‹</Text></Pressable>
        <Text style={s.title}>Google Calendar</Text>
      </View>
      <View style={s.body}>
        <View style={s.card}>
          <Text style={s.status}>{connected ? '✓ Connected' : 'Not connected'}</Text>
          <Text style={s.desc}>
            {connected
              ? 'Your reminders are mirrored to your Google Calendar. New, edited, and deleted reminders sync automatically while the app is open.'
              : 'Connect your Google account to automatically add every reminder you create to your Google Calendar.'}
          </Text>
          {busy ? (
            <ActivityIndicator color={t.accent} style={{ marginTop: 8 }} />
          ) : connected ? (
            <Pressable style={[s.btn, s.btnDisconnect]} onPress={disconnect}>
              <Text style={s.btnDisconnectTxt}>Disconnect</Text>
            </Pressable>
          ) : (
            <Pressable style={[s.btn, s.btnConnect]} onPress={handleConnect}>
              <Text style={s.btnConnectTxt}>Connect Google Calendar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}
