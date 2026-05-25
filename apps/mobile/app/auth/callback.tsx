import * as WebBrowser from 'expo-web-browser'
import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../services/supabase'
import { pullUserData } from '../../services/sync'
import { useDb } from '../../hooks/useDb'
import { userSettings, focusListings } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { eq } from 'drizzle-orm'

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
          // Seed minimal local profile from Google's user_metadata so pullUserData
          // has a row to merge against. pullUserData will overwrite these with the
          // remote settings if a backup exists.
          await db.insert(userSettings)
            .values({
              id: 1,
              googleId: user.id,
              email: user.email ?? '',
              fullName: user.user_metadata?.full_name ?? '',
            })
            .onConflictDoUpdate({
              target: userSettings.id,
              set: {
                googleId: user.id,
                email: user.email ?? '',
                fullName: user.user_metadata?.full_name ?? '',
              },
            })

          await pullUserData(db)

          // Decide landing screen based on whether the user has prior data restored
          const [settingsRows, focusRows] = await Promise.all([
            db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
            db.select().from(focusListings).limit(1),
          ])
          const hasProfile = !!(settingsRows[0]?.fullName?.trim())
          const hasFocus = focusRows.length > 0

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
