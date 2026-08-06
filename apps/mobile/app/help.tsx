import { useMemo } from 'react'
import { StyleSheet, View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'
import { ScreenScroll } from '../components/ui/ScreenScroll'
import { WebTopSpacer } from '../components/ui/WebTopSpacer'
import { Card } from '../components/ui/Card'
import { SectionHeader } from '../components/ui/SectionHeader'

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I choose my focus exam?',
    a: 'Go to your Profile and tap "Change Focus". You can pick from UPCAT, DOST, AdNU, and more upcoming exams. You can now select multiple focus listings!',
  },
  {
    q: 'How does AI Study Feedback work?',
    a: 'Iskotify analyzes your practice history to identify your weakest subjects and gives you personalized tips. The more you practice, the smarter the feedback gets.',
  },
  {
    q: 'Can I use Iskotify offline?',
    a: 'Yes! All practice questions, flashcards, and your progress are stored locally on your device. No internet needed to study.',
  },
  {
    q: 'How do flashcard decks work?',
    a: 'You can save decks from the Listings screen and practice them anytime. Your answers are tracked so you\'ll see cards you got wrong more often.',
  },
  {
    q: 'How do I back up my progress?',
    a: 'Sign in with your Google account on the Profile screen to sync your data to the cloud. You can restore it on any device.',
  },
  {
    q: 'How do I export my data?',
    a: 'Go to Settings → Export Data. A JSON file with your progress and settings will be saved to your device\'s Downloads folder.',
  },
  {
    q: 'Why aren\'t notifications showing up?',
    a: 'Make sure notifications are enabled for Iskotify in your phone\'s Settings app. Then tap the bell icon on the home screen to re-enable them.',
  },
]

export default function HelpScreen() {
  const { theme: t, typo } = useTheme()

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: { flexDirection: 'row' as const, paddingHorizontal: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },
    backBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    pageTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, letterSpacing: -0.4, marginBottom: spacing.xs, marginTop: spacing.sm },
    pageSub: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginBottom: spacing.xl },
    card: { marginBottom: spacing.md },
    q: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.base, color: t.textPrimary, marginBottom: spacing.sm },
    a: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    contactCard: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.2)', marginTop: spacing.md },
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
        <Text style={s.pageTitle}>Help & Support</Text>
        <Text style={s.pageSub}>Frequently asked questions</Text>

        <SectionHeader title="FAQ" />
        {FAQ.map((item) => (
          <Card key={item.q} elevated style={s.card}>
            <Text style={s.q}>{item.q}</Text>
            <Text style={s.a}>{item.a}</Text>
          </Card>
        ))}

        <Card style={s.contactCard}>
          <Text style={s.contactTitle}>Still need help?</Text>
          <Text style={s.contactBody}>
            Reach out to us directly and we'll get back to you as soon as possible.
          </Text>
          <Text style={s.contactEmail}>teamocsph@gmail.com</Text>
        </Card>
      </ScreenScroll>
    </SafeAreaView>
  )
}
