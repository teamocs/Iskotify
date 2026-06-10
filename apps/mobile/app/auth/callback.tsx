import * as WebBrowser from 'expo-web-browser'
import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../services/supabase'
import { pullUserData, pushUserData } from '../../services/sync'
import { useDb } from '../../hooks/useDb'
import { userSettings, focusListings } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { eq } from 'drizzle-orm'
import { hasOnboardingFocus } from '../../utils/onboardingStatus'

// Must be at module level — signals openAuthSessionAsync in landing.tsx to close
// the browser and return the redirect URL.
WebBrowser.maybeCompleteAuthSession()

export default function AuthCallback() {
  const db = useDb()
  const { theme: t } = useTheme()
  const { code } = useLocalSearchParams<{ code?: string }>()

  useEffect(() => {
    // code is undefined on first render before params are hydrated
    if (code === undefined) return

    async function finish() {
      try {
        if (!code) {
          // No code in URL — go back to landing
          router.replace('/landing')
          return
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          // Code may already be exchanged by the fallback in landing.tsx.
          // If a session already exists, just proceed.
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) throw error
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Preserve a name the user typed during (anonymous) onboarding — only fall
          // back to the Google display name when there's no local name yet. Writing the
          // Google name unconditionally would clobber the onboarding name (or blank it
          // when Google has no full_name), which then re-triggers onboarding.
          const existing = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
          const localName = existing[0]?.fullName?.trim()
          const nameToUse = localName || (user.user_metadata?.full_name ?? '')
          await db.insert(userSettings)
            .values({ id: 1, googleId: user.id, email: user.email ?? '', fullName: nameToUse })
            .onConflictDoUpdate({
              target: userSettings.id,
              set: { googleId: user.id, email: user.email ?? '', fullName: nameToUse },
            })

          // Restore vs back up: if this account already has a cloud backup, this is a
          // returning login (possibly a new device) → restore it. If it has NO backup
          // yet, this is a first sign-in after anonymous onboarding → push the local
          // data up so it's preserved and available on other devices. Both non-fatal:
          // a sync failure must never bounce an otherwise-successful sign-in to /landing.
          let hasCloudBackup = false
          try {
            const { data: backup } = await supabase
              .from('user_app_data').select('user_id').eq('user_id', user.id).limit(1).maybeSingle()
            hasCloudBackup = !!backup
          } catch (e) {
            console.warn('[auth/callback] backup check failed (non-fatal):', e)
          }
          try {
            if (hasCloudBackup) await pullUserData(db)
            else await pushUserData(db)
          } catch (syncErr) {
            console.warn('[auth/callback] sync failed (non-fatal):', syncErr)
          }

          // Decide landing screen based on whether the user has prior data restored
          const [settingsRows, focusRows] = await Promise.all([
            db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
            db.select().from(focusListings).limit(1),
          ])
          const hasProfile = !!(settingsRows[0]?.fullName?.trim())
          // Treat any chosen exam/scholarship as onboarded (matches _layout.tsx). Using
          // targetExams too means a user whose exam has no authored content listing is
          // never wrongly looped back through onboarding.
          const hasFocus = hasOnboardingFocus({
            selectedListingSlug: settingsRows[0]?.selectedListingSlug,
            focusCount: focusRows.length,
            targetExams: settingsRows[0]?.targetExams,
          })

          if (hasProfile && hasFocus) {
            router.replace('/(tabs)')  // returning user with restored data
            return
          }
        }

        router.replace('/onboarding')  // new account or incomplete onboarding
      } catch (e) {
        console.error('[auth/callback] error:', e)
        router.replace('/landing')
      }
    }

    void finish()
  }, [code])

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#831626" />
    </View>
  )
}
