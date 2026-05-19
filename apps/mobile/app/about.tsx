import { useMemo } from 'react'
import { StyleSheet, View, Text, ScrollView, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { useTheme } from '../theme/ThemeContext'

const version = Constants.expoConfig?.version ?? '1.0.0'

export default function AboutScreen() {
  const { theme: t, typo } = useTheme()

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: { flexDirection: 'row' as const, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
    backBtn: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    scroll: { paddingHorizontal: 20, paddingBottom: 48 },
    heroWrap: { alignItems: 'center' as const, paddingTop: 24, paddingBottom: 28 },
    heroIcon: { width: 80, height: 80, borderRadius: 20, marginBottom: 14 },
    heroName: { fontFamily: 'Outfit_700Bold', fontSize: typo.xl + 2, color: t.textPrimary, letterSpacing: -0.4 },
    heroBadge: { marginTop: 6, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
    heroBadgeTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.xs, color: '#fca5a5' },
    card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 16, marginBottom: 12 },
    cardTitle: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.textTertiary, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 },
    cardBody: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    metaRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
    metaItem: { flex: 1 },
    metaLabel: { fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginBottom: 2 },
    metaValue: { fontFamily: 'Outfit_700Bold', fontSize: typo.sm, color: t.textPrimary },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <View style={s.backRow}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.heroWrap}>
          <Image source={require('../assets/images/icon.png')} style={s.heroIcon} />
          <Text style={s.heroName}>Iskotify</Text>
          <View style={s.heroBadge}>
            <Text style={s.heroBadgeTxt}>v{version}</Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>About</Text>
          <Text style={s.cardBody}>
            Iskotify is your ultimate UPCAT and scholarship exam companion — built to help Filipino students study smarter, track their progress, and confidently pass their college entrance tests.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Features</Text>
          <Text style={s.cardBody}>
            {'• Subject-by-subject practice questions\n• Spaced-repetition flashcard decks\n• Weak-area identification and coaching\n• Exam countdown and daily reminders\n• Offline-first — study without internet\n• AI Coach powered by Kuya Baw'}
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Version Info</Text>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>App Version</Text>
              <Text style={s.metaValue}>v{version}</Text>
            </View>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Platform</Text>
              <Text style={s.metaValue}>Android / iOS</Text>
            </View>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Made by</Text>
              <Text style={s.metaValue}>Team OCSPH</Text>
            </View>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Contact</Text>
          <Text style={s.cardBody}>
            For feedback, bug reports, or partnership inquiries, reach us at{'\n'}teamocsph@gmail.com
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
