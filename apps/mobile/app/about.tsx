import { useMemo } from 'react'
import { StyleSheet, View, Text, Pressable } from 'react-native'
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'
import { ScreenScroll } from '../components/ui/ScreenScroll'
import { WebTopSpacer } from '../components/ui/WebTopSpacer'
import { Card } from '../components/ui/Card'
import { SectionHeader } from '../components/ui/SectionHeader'

const version = Constants.expoConfig?.version ?? '1.0.0'

export default function AboutScreen() {
  const { theme: t, typo } = useTheme()

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: { flexDirection: 'row' as const, paddingHorizontal: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },
    backBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    heroWrap: { alignItems: 'center' as const, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
    heroIcon: { width: 80, height: 80, borderRadius: radius.lg, marginBottom: spacing.md },
    heroName: { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, letterSpacing: -0.4 },
    heroBadge: { marginTop: spacing.sm, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
    heroBadgeTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.xs, color: t.accentText },
    card: { marginBottom: spacing.md },
    cardBody: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: typo.sm * 1.6 },
    metaRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
    metaItem: { flex: 1 },
    metaLabel: { fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginBottom: 2 },
    metaValue: { fontFamily: 'Outfit_700Bold', fontSize: typo.sm, color: t.textPrimary },
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
        <View style={s.heroWrap}>
          <Image source={require('../assets/images/icon.png')} style={s.heroIcon} />
          <Text style={s.heroName}>Iskotify</Text>
          <View style={s.heroBadge}>
            <Text style={s.heroBadgeTxt}>v{version}</Text>
          </View>
        </View>

        <Card elevated style={s.card}>
          <SectionHeader title="About" />
          <Text style={s.cardBody}>
            Iskotify is your ultimate UPCAT and scholarship exam companion — built to help Filipino students study smarter, track their progress, and confidently pass their college entrance tests.
          </Text>
        </Card>

        <Card elevated style={s.card}>
          <SectionHeader title="Features" />
          <Text style={s.cardBody}>
            {'• Subject-by-subject practice questions\n• Spaced-repetition flashcard decks\n• Weak-area identification and coaching\n• Exam countdown and daily reminders\n• Offline-first — study without internet\n• AI-enhanced flashcards and study feedback'}
          </Text>
        </Card>

        <Card elevated style={s.card}>
          <SectionHeader title="Version Info" />
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
        </Card>

        <Card elevated style={s.card}>
          <SectionHeader title="Contact" />
          <Text style={s.cardBody}>
            For feedback, bug reports, or partnership inquiries, reach us at{'\n'}teamocsph@gmail.com
          </Text>
        </Card>
      </ScreenScroll>
    </SafeAreaView>
  )
}
