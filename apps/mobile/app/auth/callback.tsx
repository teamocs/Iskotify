import * as WebBrowser from 'expo-web-browser'
import { useEffect } from 'react'
import { Platform, View, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../services/supabase'
import { pullUserData, pushUserData } from '../../services/sync'
import { useDb } from '../../hooks/useDb'
import { userSettings, focusListings } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { eq } from 'drizzle-orm'
import { hasOnboardingFocus } from '../../utils/onboardingStatus'
import { webEntryTarget } from '../../utils/webEntryTarget'
import { isEarlyAccessActivated, setEarlyAccessActivated } from '../../utils/earlyAccessActivation'
import { isRecoveryUrl } from '../../utils/recoveryUrl'

// Must be at module level — signals openAuthSessionAsync in landing.tsx to close
// the browser and return the redirect URL.
WebBrowser.maybeCompleteAuthSession()

// ── Password recovery detection (web) ────────────────────────────────────────
// A Supabase reset-password email lands on /auth/callback. Two independent
// signals identify it (belt and braces — neither alone covers every flow):
//  1. URL marker: sendPasswordReset() redirects to /auth/callback?type=recovery
//     (Supabase preserves the query and appends its ?code=); older implicit
//     links carry #...&type=recovery. Checked via isRecoveryUrl().
//  2. Event: with detectSessionInUrl:true, supabase-js auto-exchanges the
//     recovery code at client init and emits PASSWORD_RECOVERY. That can fire
//     before React effects run, so the flag is captured at MODULE level (this
//     module is evaluated synchronously when the route mounts, ahead of the
//     async token exchange). Web-only: the event never fires on native here.
let sawPasswordRecovery = false
if (Platform.OS === 'web') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') sawPasswordRecovery = true
  })
}

/** True when this page load is a password-recovery redirect (web only). */
function isPasswordRecovery(): boolean {
  if (Platform.OS !== 'web') return false
  if (sawPasswordRecovery) return true
  try {
    return typeof window !== 'undefined' && isRecoveryUrl(window.location.href)
  } catch {
    return false
  }
}

export default function AuthCallback() {
  const db = useDb()
  const { theme: t } = useTheme()
  const { code } = useLocalSearchParams<{ code?: string }>()

  // ── Password recovery (web): route to the set-new-password form ───────────
  // Runs independently of the `code` search param: hash-based recovery URLs
  // (#access_token=...&type=recovery) never hydrate `code`, so the main effect
  // below would spin forever for them. Also subscribes for a late
  // PASSWORD_RECOVERY event in case supabase-js finishes the code exchange
  // after this screen mounts. Purely additive — OAuth and native flows are
  // untouched (everything is web-gated).
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (isPasswordRecovery()) {
      router.replace('/auth/reset-password')
      return
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') router.replace('/auth/reset-password')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    // code is undefined on first render before params are hydrated
    if (code === undefined) return

    async function finish() {
      try {
        if (!code) {
          // No code in URL.
          // On web: supabase.auth.onAuthStateChange in _layout.tsx will handle
          // the session if detectSessionInUrl fires, but since we set it to false
          // we must exchange manually. If no code, the session may already be set
          // (e.g. a password-reset link that supabase exchanged via the hash).
          // Try getSession; if none, fall back to sign-in.
          if (Platform.OS === 'web') {
            const { data: { session } } = await supabase.auth.getSession()
            // Password-recovery link (getSession above awaited supabase-js init,
            // so a PASSWORD_RECOVERY emitted during the auto-exchange has been
            // captured by now) → set-new-password form, NOT the app.
            if (isPasswordRecovery()) {
              router.replace('/auth/reset-password')
              return
            }
            if (session) {
              // Session exists (e.g. from a hash-based flow) — route normally.
              // onAuthStateChange in _layout will also fire; routing here is a safety net.
              try { await pullUserData(db) } catch { /* non-fatal */ }
              const [rows, focusRows] = await Promise.all([
                db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
                db.select().from(focusListings).limit(1),
              ])
              const s = rows[0]
              const hasFocus = hasOnboardingFocus({
                selectedListingSlug: s?.selectedListingSlug,
                focusCount: focusRows.length,
                targetExams: s?.targetExams,
              })
              router.replace(webEntryTarget(true, s?.fullName, hasFocus))
              return
            }
            router.replace('/auth/sign-in')
            return
          }
          // Native: go back to landing
          router.replace('/landing')
          return
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          // On web, detectSessionInUrl:true makes supabase-js auto-exchange
          // the PKCE code before this callback runs, so exchangeCodeForSession
          // returns "code already used". That's fine — check for an existing
          // session and treat it as success. Also handles the case where
          // landing.tsx already did the exchange on native.
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) throw error
        }

        // ── Password recovery (web) ────────────────────────────────────────────
        // The reset-link redirect carries ?code= like OAuth does, so it reaches
        // this point too. By now the exchange has completed (either above or via
        // detectSessionInUrl), so the PASSWORD_RECOVERY flag/URL marker is
        // reliable → send the user to the set-new-password form instead of the
        // app. Additive: non-recovery OAuth logins skip this entirely.
        if (isPasswordRecovery()) {
          router.replace('/auth/reset-password')
          return
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // ── Native early-access gate ──────────────────────────────────────────────
          // callback.tsx is the PRIMARY native OAuth handler, so enforce approval here
          // too (mirrors /activate) — otherwise a fresh unapproved install could enter
          // via this path. Skip when already activated (grandfathered/previous activation).
          // Web is gated separately in _layout's onAuthStateChange.
          if (Platform.OS !== 'web' && !(await isEarlyAccessActivated())) {
            let approved = false
            try {
              const { data: eaStatus } = await supabase.rpc('early_access_status')
              approved = eaStatus === 'approved' || eaStatus === 'sent'
            } catch (eaErr) {
              console.warn('[auth/callback] early-access check failed (blocking):', eaErr)
            }
            if (!approved) {
              router.replace('/activate')   // do NOT write a profile or enter the app
              return
            }
            await setEarlyAccessActivated()
          }

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
        // On web, send to sign-in rather than landing (which doesn't exist on web).
        router.replace(Platform.OS === 'web' ? '/auth/sign-in' : '/landing')
      }
    }

    void finish()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, db])

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#831626" />
    </View>
  )
}
