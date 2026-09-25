import { useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Pencil1Outlined, GraduationCap1Outlined, CalendarDaysOutlined, GoogleOutlined,
} from '@lineiconshq/free-icons'
import { supabase } from '../services/supabase'
import { pullUserData, pushUserData } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { invalidate } from '../services/queryCache'
import { userSettings, focusListings } from '../db/schema'
import { hasOnboardingFocus } from '../utils/onboardingStatus'
import { useTheme } from '../theme/ThemeContext'
import { radius, spacing, textStyle } from '../theme/tokens'
import { useBreakpoint, pagePadding } from '../hooks/useBreakpoint'
import { Button } from '../components/ui/Button'
import { BrandBlock } from '../components/auth/AuthLayout'
import { decorative } from '../components/ui/a11y'

type Icon = typeof Pencil1Outlined

// Three honest jobs the app does — no invented numbers, no retired AI claims.
const VALUE: { icon: Icon; title: string; body: string }[] = [
  { icon: Pencil1Outlined, title: 'Practice for the exam', body: 'Mock exams, flashcards and a quick daily sprint, even offline.' },
  { icon: GraduationCap1Outlined, title: 'Find schools and scholarships', body: 'Deadlines, requirements and the ones you can apply for.' },
  { icon: CalendarDaysOutlined, title: 'Know what to do today', body: 'A study plan paced to your exam date, one step at a time.' },
]

/**
 * Native first impression (web visitors land on /auth/sign-in). One screen:
 * the brand and tagline, what the app is for, and one next step. Google
 * sign-in is the single primary action; starting without an account is a
 * quieter, equally available path.
 */
export default function LandingScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleSignIn() {
    setSigningIn(true)
    setError(null)
    try {
      const redirectUrl = Linking.createURL('auth/callback')

      const { data, error: startError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      })

      if (startError || !data.url) {
        setError("Couldn't open Google sign-in. Check your connection and try again.")
        return
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

      // app/auth/callback.tsx is the PRIMARY handler (when Android routes the deep
      // link through Expo Router). This block is a FALLBACK for when
      // openAuthSessionAsync intercepts the redirect before Expo Router does.
      if (result.type === 'success') {
        try {
          const parsed = new URL(result.url)
          const code = parsed.searchParams.get('code')
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            // If error, callback.tsx may have already exchanged this code — check session
            const { data: { session } } = await supabase.auth.getSession()
            if (!exchangeError || session) {
              const { data: { user } } = await supabase.auth.getUser()
              if (user) {
                // Preserve a name typed during anonymous onboarding; only fall back to
                // the Google display name when there's no local name yet.
                const existing = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
                const localName = existing[0]?.fullName?.trim()
                const nameToUse = localName || (user.user_metadata?.full_name ?? '')
                await db.insert(userSettings)
                  .values({ id: 1, googleId: user.id, email: user.email ?? '', fullName: nameToUse, selectedListingSlug: '', lastSyncedAt: 0 })
                  .onConflictDoUpdate({
                    target: userSettings.id,
                    set: { googleId: user.id, email: user.email ?? '', fullName: nameToUse },
                  })
                invalidate('settings:')
                // Restore an existing cloud backup, or push this device's anonymous
                // onboarding data up on a first sign-in. Non-fatal.
                let hasCloudBackup = false
                try {
                  const { data: backup } = await supabase
                    .from('user_app_data').select('user_id').eq('user_id', user.id).limit(1).maybeSingle()
                  hasCloudBackup = !!backup
                } catch (e) {
                  console.warn('[landing] backup check failed (non-fatal):', e)
                }
                try {
                  if (hasCloudBackup) await pullUserData(db)
                  else await pushUserData(db)
                } catch (restoreErr) {
                  console.warn('[landing] sync failed (non-fatal):', restoreErr)
                }

                // Mirror callback.tsx logic: skip onboarding for returning users
                const [settingsRows, focusRows] = await Promise.all([
                  db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
                  db.select().from(focusListings).limit(1),
                ])
                const hasProfile = !!(settingsRows[0]?.fullName?.trim())
                const hasFocus = hasOnboardingFocus({
                  selectedListingSlug: settingsRows[0]?.selectedListingSlug,
                  focusCount: focusRows.length,
                  targetExams: settingsRows[0]?.targetExams,
                })

                if (hasProfile && hasFocus) {
                  router.replace('/(tabs)')
                  return
                }
              }
              router.replace('/onboarding')
            }
          }
          // No code in URL → app/auth/callback.tsx already handled the deep link
        } catch {
          // callback.tsx is handling navigation; swallow errors here
        }
      }
    } catch (e) {
      console.error('[landing] google sign-in error:', e)
      setError('Sign-in stopped partway. Please try again, or start without an account.')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View
          style={{
            flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
            paddingHorizontal: pagePadding(bp), paddingTop: spacing.xxxl, paddingBottom: spacing.xl,
            justifyContent: 'space-between', gap: spacing.xxxl,
          }}
        >
          <View style={{ gap: spacing.xxl }}>
            <BrandBlock align="start" />
            <Text style={textStyle('headline', t.textPrimary)} maxFontSizeMultiplier={1.8}>
              Free practice for UPCAT and other college entrance exams.
            </Text>
            <View style={{ gap: spacing.lg }}>
              {VALUE.map(v => (
                <View key={v.title} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                  <View
                    {...decorative}
                    style={{
                      width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous',
                      backgroundColor: t.accentSurface, alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Lineicons icon={v.icon} size={20} color={t.accentText} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{v.title}</Text>
                    <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{v.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            {error ? (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={textStyle('bodySm', t.danger)}>
                {error}
              </Text>
            ) : null}
            <Button
              label={signingIn ? 'Opening Google…' : 'Continue with Google'}
              accessibilityLabel="Continue with Google"
              onPress={() => void handleGoogleSignIn()}
              loading={signingIn}
              icon={<Lineicons icon={GoogleOutlined} size={18} color={t.textInverse} />}
              size="lg"
              fullWidth
            />
            <Button
              label="Start without an account"
              variant="ghost"
              onPress={() => router.replace('/onboarding')}
              accessibilityHint="You can sign in later from your profile"
              fullWidth
            />
            <Text style={[textStyle('caption', t.textSecondary), { textAlign: 'center', marginTop: spacing.xs }]} maxFontSizeMultiplier={2}>
              Signing in backs up your progress so you can switch phones without losing it.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
