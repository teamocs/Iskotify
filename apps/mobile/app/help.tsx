import { useMemo } from 'react'
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I choose my focus exam?',
    a: 'Go to your Profile and tap "Change Focus". You can pick from UPCAT, DOST, AdNU, and more upcoming exams. You can now select multiple focus listings!',
  },
  {
    q: 'How does the AI Coach work?',
    a: 'Kuya Baw analyzes your practice history to identify your weakest subjects and gives you personalized tips. The more you practice, the smarter the coaching gets.',
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
    backRow: { flexDirection: 'row' as const, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
    backBtn: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    scroll: { paddingHorizontal: 20, paddingBottom: 48 },
    pageTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.xl + 2, color: t.textPrimary, letterSpacing: -0.4, marginBottom: 4, marginTop: 8 },
    pageSub: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, marginBottom: 20 },
    sectionLabel: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.textTertiary, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
    card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 14, marginBottom: 8 },
    q: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm, color: t.textPrimary, marginBottom: 6 },
    a: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    contactCard: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.2)', borderRadius: 16, padding: 16, marginTop: 8 },
    contactTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: t.textPrimary, marginBottom: 4 },
    contactBody: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    contactEmail: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm, color: '#fca5a5', marginTop: 6 },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <View style={s.backRow}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Help & Support</Text>
        <Text style={s.pageSub}>Frequently asked questions</Text>

        <Text style={s.sectionLabel}>FAQ</Text>
        {FAQ.map((item, i) => (
          <View key={i} style={s.card}>
            <Text style={s.q}>{item.q}</Text>
            <Text style={s.a}>{item.a}</Text>
          </View>
        ))}

        <View style={s.contactCard}>
          <Text style={s.contactTitle}>Still need help?</Text>
          <Text style={s.contactBody}>
            Reach out to us directly and we'll get back to you as soon as possible.
          </Text>
          <Text style={s.contactEmail}>teamocsph@gmail.com</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
