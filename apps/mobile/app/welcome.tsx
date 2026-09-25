import { View, Text, ScrollView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { useTheme } from '../theme/ThemeContext'
import { radius, spacing, textStyle } from '../theme/tokens'
import { useBreakpoint, pagePadding } from '../hooks/useBreakpoint'
import { Button } from '../components/ui/Button'
import { decorative, heading } from '../components/ui/a11y'
import { TAB_DESTINATIONS, type TabName } from '../components/navigation/destinations'
import { TAGLINE } from '../components/auth/AuthLayout'

// What each destination is for, in the student's words (mirrors destinations.ts).
const WHAT_IT_HOLDS: Record<TabName, string> = {
  index: 'Your plan for the day, your exam countdown, and the one thing to do next.',
  practice: 'Mock exams, subject drills, flashcards due today, and your Estimated Admission Score.',
  explore: 'Entrance exams, scholarships, schools and courses, with every date and deadline.',
  progress: 'How ready you are per subject, and what is getting better.',
}

/**
 * welcome — shown once, straight after onboarding (reached only via
 * router.replace('/welcome') from app/onboarding.tsx, so returning users never
 * see it). One calm screen, not a carousel: the four destinations the student
 * will use, the approved tagline, and one next step into Today.
 */
export default function WelcomeScreen() {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      {Platform.OS === 'web' ? <View style={{ height: spacing.md }} /> : null}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View
          style={{
            flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center',
            paddingHorizontal: pagePadding(bp), paddingTop: spacing.xxxl, paddingBottom: spacing.xl,
            // Phones: the button sits at the bottom, in thumb reach. Wide
            // windows: one centred group, so the button isn't stranded far below.
            gap: spacing.xxl, justifyContent: bp === 'compact' ? 'space-between' : 'center',
          }}
        >
          <View style={{ gap: spacing.xxl }}>
            <View style={{ gap: spacing.sm }}>
              <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={1.6}>{TAGLINE}</Text>
              <Text {...heading(1)} style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.6}>
                {"You're all set. Here's your app."}
              </Text>
              <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>
                Four places, one job each. Today always tells you what to do next.
              </Text>
            </View>

            <View
              style={{
                backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
                borderRadius: radius.xl, borderCurve: 'continuous', overflow: 'hidden',
              }}
            >
              {TAB_DESTINATIONS.map((d, i) => (
                <View
                  key={d.name}
                  style={{
                    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
                    padding: spacing.lg,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
                  }}
                >
                  <View
                    {...decorative}
                    style={{
                      width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous',
                      backgroundColor: i === 0 ? t.accentSurface : t.surface2,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Lineicons icon={d.icon} size={20} color={i === 0 ? t.accentText : t.textSecondary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{d.label}</Text>
                    <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{WHAT_IT_HOLDS[d.name]}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <Button label="Start studying" onPress={() => router.replace('/(tabs)')} size="lg" fullWidth />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
