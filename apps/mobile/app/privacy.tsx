import { useMemo } from 'react'
import { StyleSheet, View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { spacing } from '../theme/tokens'
import { ScreenScroll } from '../components/ui/ScreenScroll'
import { WebTopSpacer } from '../components/ui/WebTopSpacer'
import { Card } from '../components/ui/Card'
import { SectionHeader } from '../components/ui/SectionHeader'

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
    backRow: { flexDirection: 'row' as const, paddingHorizontal: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },
    backBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    pageTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, letterSpacing: -0.4, marginTop: spacing.sm },
    effectiveDate: { fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginTop: spacing.xs, marginBottom: spacing.xl },
    card: { marginBottom: spacing.md },
    cardBody: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    contactCard: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.2)', marginTop: spacing.xs, marginBottom: spacing.md },
    contactTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: t.textPrimary, marginBottom: spacing.xs },
    contactBody: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    contactEmail: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm, color: t.accentText, marginTop: spacing.sm },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.backRow}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed ? { opacity: 0.6 } : null]}
          onPress={() => router.back()}
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
      </View>

      <ScreenScroll tabBarInset={false} padded>
        <Text style={s.pageTitle}>Privacy & Terms</Text>
        <Text style={s.effectiveDate}>Effective: May 2026</Text>

        {SECTIONS.map((sec) => (
          <Card elevated key={sec.title} style={s.card}>
            <SectionHeader title={sec.title} />
            <Text style={s.cardBody}>{sec.body}</Text>
          </Card>
        ))}

        <Card elevated style={s.contactCard}>
          <Text style={s.contactTitle}>Questions?</Text>
          <Text style={s.contactBody}>
            For privacy-related requests or concerns, contact us at:
          </Text>
          <Text style={s.contactEmail}>teamocsph@gmail.com</Text>
        </Card>
      </ScreenScroll>
    </SafeAreaView>
  )
}
