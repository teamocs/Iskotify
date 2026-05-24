import { useMemo } from 'react'
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'

const SECTIONS = [
  {
    title: 'Information We Collect',
    body: 'Iskotify stores your practice answers, flashcard progress, and app preferences locally on your device. If you sign in with Google, we sync this data to your account so you can restore it across devices. We do not sell or share your personal data with third parties.',
  },
  {
    title: 'How We Use Your Data',
    body: 'Your data is used solely to power the app features — tracking your progress, identifying weak areas, scheduling reminders, and personalizing the AI Coach. Analytics (if any) are anonymized and used only to improve the app.',
  },
  {
    title: 'Data Storage',
    body: 'All study data is stored locally on your device using an encrypted SQLite database. If cloud sync is enabled, data is stored securely in Supabase (hosted on AWS) with row-level security — only you can access your own data.',
  },
  {
    title: 'Notifications',
    body: 'Iskotify may send you local push notifications for daily practice reminders and exam countdowns. These are scheduled on-device and never sent through a third-party server. You can disable notifications at any time from the home screen or your device settings.',
  },
  {
    title: 'Third-Party Services',
    body: 'Iskotify uses Google Sign-In (OAuth 2.0) for optional account authentication. If you choose to sign in, Google\'s privacy policy also applies. We use Supabase for backend storage, and Expo for app delivery.',
  },
  {
    title: 'Children\'s Privacy',
    body: 'Iskotify is designed for students aged 15 and above preparing for college entrance exams. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently done so, please contact us.',
  },
  {
    title: 'Your Rights',
    body: 'You can delete your data at any time by uninstalling the app (removes local data) or by contacting us to delete your cloud account data. You can also use the Export Data feature in Settings to download a copy of your data.',
  },
  {
    title: 'Changes to This Policy',
    body: 'We may update this privacy policy from time to time. We will notify you of significant changes through an in-app notice. Continued use of the app after changes constitutes acceptance of the updated policy.',
  },
]

export default function PrivacyScreen() {
  const { theme: t, typo } = useTheme()

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: { flexDirection: 'row' as const, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
    backBtn: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    scroll: { paddingHorizontal: 20, paddingBottom: 48 },
    pageTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.xl + 2, color: t.textPrimary, letterSpacing: -0.4, marginBottom: 4, marginTop: 8 },
    pageSub: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginBottom: 20 },
    card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 14, marginBottom: 8 },
    cardTitle: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm, color: t.textPrimary, marginBottom: 6 },
    cardBody: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    contactCard: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.2)', borderRadius: 16, padding: 16, marginTop: 8 },
    contactTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: t.textPrimary, marginBottom: 4 },
    contactBody: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    contactEmail: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm, color: t.accentText, marginTop: 6 },
    effectiveDate: { fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginBottom: 20 },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <View style={s.backRow}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Privacy & Terms</Text>
        <Text style={s.effectiveDate}>Effective: May 2026</Text>

        {SECTIONS.map((sec, i) => (
          <View key={i} style={s.card}>
            <Text style={s.cardTitle}>{sec.title}</Text>
            <Text style={s.cardBody}>{sec.body}</Text>
          </View>
        ))}

        <View style={s.contactCard}>
          <Text style={s.contactTitle}>Questions?</Text>
          <Text style={s.contactBody}>
            For privacy-related requests or concerns, contact us at:
          </Text>
          <Text style={s.contactEmail}>teamocsph@gmail.com</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
