import { useEffect, useState, useCallback } from 'react'
import { Platform, View, Image, InteractionManager } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, router, type Href } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Updates from 'expo-updates'
import { SQLiteProvider } from 'expo-sqlite'
import { useFonts } from 'expo-font'
import {
  Outfit_400Regular,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit'
import {
  Lexend_400Regular,
  Lexend_500Medium,
  Lexend_600SemiBold,
} from '@expo-google-fonts/lexend'
import { DrizzleProvider } from '../db'
import { ThemeProvider } from '../theme/ThemeContext'
import { lightTheme, radius } from '../theme/tokens'
import { useDb } from '../hooks/useDb'
import { RouteFade } from '../components/web/RouteFade'
import { syncOnLaunch } from '../services/sync'
import { pullUserData } from '../services/sync'
import { installPushFlushListeners } from '../services/pushFlushListeners'
import { WebSetupOverlay } from '../components/WebSetupOverlay'
import { markFirstSyncDone } from '../services/syncStatus'
import { pruneOldTrashedNotesDb } from '../hooks/useNotes'
import { notes as notesTable, userSettings, focusListings as focusListingsTable } from '../db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { hasOnboardingFocus } from '../utils/onboardingStatus'
import { webEntryTarget } from '../utils/webEntryTarget'
import { runWebEntryGate } from '../components/auth/webEntryGate'
import { WebGuestRouteGuard } from '../components/auth/WebGuestRouteGuard'
import { supabase } from '../services/supabase'
import { requestNotificationPermissions, scheduleNoteReminder } from '../services/notifications'
import { identifyUser, resetAnalytics } from '../lib/analytics'
import { applyAnalyticsConsent, identifyAfterConsent } from '../services/analyticsConsent'
import { AnalyticsScreenTracker } from '../components/AnalyticsScreenTracker'
import { ConsentGate } from '../components/consent/ConsentGate'
import { initPremium } from '../services/premiumState'

// KeyboardProvider is native-only (react-native-keyboard-controller).
// On web, render children directly — the provider import itself is safe to
// include in the bundle but its runtime code is no-op on web. We gate the
// wrapper to avoid any potential side effects.
let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> | null = null
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-only module; a static import would pull it into the web bundle
  KeyboardProvider = require('react-native-keyboard-controller').KeyboardProvider
}

function KeyboardProviderCompat({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web' || !KeyboardProvider) {
    return <>{children}</>
  }
  return <KeyboardProvider>{children}</KeyboardProvider>
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
  })
  const [appReady, setAppReady] = useState(false)
  const fontsReady = fontsLoaded || !!fontError
  // The splash sits outside ThemeProvider; it uses the one (light) palette's ground.
  const splashBg = lightTheme.bg

  // Stable callback — never changes, safe as useCallback dep
  const handleReady = useCallback(() => setAppReady(true), [])

  // Send any debounced backup edit as soon as the page is hidden / the app is
  // backgrounded, so a pull on the next launch cannot revert it.
  useEffect(() => installPushFlushListeners(), [])

  // ── Web: no SQLiteProvider (sql.js used instead via WebDrizzleProvider) ──
  if (Platform.OS === 'web') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProviderCompat>
          <DrizzleProvider>
            <ThemeProvider>
              <AppInit onReady={handleReady} ready={appReady} />
              <WebSetupOverlay />
            </ThemeProvider>
          </DrizzleProvider>
          {(!appReady || !fontsReady) && (
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: splashBg, alignItems: 'center', justifyContent: 'center',
            }}>
              <Image
                source={require('../assets/images/icon.png')}
                style={{ width: 80, height: 80, borderRadius: radius.xl }}
              />
            </View>
          )}
        </KeyboardProviderCompat>
      </GestureHandlerRootView>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProviderCompat>
        {/* DB + navigation tree — children only render once SQLite is open */}
        <SQLiteProvider databaseName="iskotify.db" options={{ enableChangeListener: true }}>
          <DrizzleProvider>
            <ThemeProvider>
              <AppInit onReady={handleReady} ready={appReady} />
            </ThemeProvider>
          </DrizzleProvider>
        </SQLiteProvider>

        {/*
          Loading overlay lives OUTSIDE SQLiteProvider so it shows on the very
          first frame — before the DB has opened and before AppInit mounts.
          Hides once AppInit signals ready AND fonts are loaded.
        */}
        {(!appReady || !fontsReady) && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: splashBg, alignItems: 'center', justifyContent: 'center',
          }}>
            <Image
              source={require('../assets/images/icon.png')}
              style={{ width: 80, height: 80, borderRadius: radius.xl }}
            />
          </View>
        )}
      </KeyboardProviderCompat>
    </GestureHandlerRootView>
  )
}

function AppInit({ onReady, ready }: { onReady: () => void; ready: boolean }) {
  const db = useDb()

  // Iskotify Full Access (P3): the cached state at once, then the server's, kept
  // fresh on foreground and auth changes. A no-op with the paywall flag off.
  useEffect(() => {
    let cleanup: (() => void) | undefined
    let disposed = false
    initPremium(db)
      .then(fn => { if (disposed) fn(); else cleanup = fn })
      .catch(e => console.warn('[layout] premium init failed (non-fatal):', e))
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [db])

  const initialize = useCallback(async () => {
    // Analytics — env-gated no-op until EXPO_PUBLIC_POSTHOG_KEY is set, and
    // consent-gated: it starts only if the student's stored consent allows it
    // (never on a fresh install, off for minors until they opt in). Identify an
    // existing session by account ID only (never email or name) so events tie to
    // the user; the id is held until analytics is allowed. Web identifies after
    // its backup pull instead (resolveTarget below): this browser's database may
    // still hold a previous account's consent until that pull reconciles it,
    // so web applies it there too (identifyAfterConsent), and a signed-out web
    // visitor (a guest trying the diagnostic) never runs on someone else's choice.
    if (Platform.OS !== 'web') {
      await applyAnalyticsConsent(db)
      supabase.auth.getSession()
        .then(({ data }) => {
          const u = data.session?.user
          if (u) identifyUser(u.id)
        })
        .catch(() => { /* non-fatal */ })
    }

    // ── Web: auth-first entry gate ─────────────────────────────────────────
    // On web, session is the source of truth for routing. We check it first,
    // before the local DB, so an unauthenticated visitor always lands on the
    // sign-in screen. Native keeps its original local-DB-first flow below.
    if (Platform.OS === 'web') {
      // Pull the student's backup, then decide where a signed-in student
      // belongs. Also kicks off the catalog sync (listings/flashcards/subjects/
      // upcat/career/university) the SAME way native does, non-blocking:
      // syncOnLaunch invalidates the queryCache so screens re-render when the
      // data lands. Only an onboarded student landing in the tabs with an empty
      // local DB (a fresh browser) keeps the "Setting up your data" overlay;
      // everyone else has it pre-dismissed via markFirstSyncDone.
      const resolveTarget = async () => {
        try { await pullUserData(db) } catch (e) { console.warn('[layout] web pullUserData (non-fatal):', e) }
        // Only now: the pull has reset analytics on an account switch and restored
        // this student's own choice, so another person's consent never covers this id.
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) await identifyAfterConsent(db, session.user.id)
        } catch { /* analytics is non-fatal */ }
        const [rows, focusRows] = await Promise.all([
          db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
          db.select().from(focusListingsTable).limit(1),
        ])
        const settings = rows[0]
        const hasFocus = hasOnboardingFocus({
          selectedListingSlug: settings?.selectedListingSlug,
          focusCount: focusRows.length,
          targetExams: settings?.targetExams,
        })
        const target = webEntryTarget(true, settings?.fullName, hasFocus)
        const freshTabsEntry = target === '/(tabs)' && Number(settings?.lastSyncedAt ?? 0) === 0
        if (!freshTabsEntry) markFirstSyncDone()
        void syncOnLaunch(db)
          .catch(e => console.warn('[layout] web bg sync:', e))
        return target
      }

      // The gate always subscribes to auth changes — including for a visitor
      // who arrives signed out, so signing in on the form routes them on — and
      // leaves auth pages that explain themselves (?error=link, an expired
      // reset link) where they are. See components/auth/webEntryGate.ts.
      return runWebEntryGate({
        hasSession: async () => !!(await supabase.auth.getSession()).data.session,
        resolveTarget,
        subscribe: (listener) => {
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => listener(event, !!session),
          )
          return () => subscription.unsubscribe()
        },
        currentPath: () => (typeof window !== 'undefined' ? window.location.pathname : '/'),
        replace: (href) => router.replace(href as Href),
        onReady,
        onSignedOut: () => resetAnalytics(),
      })
    }

    // ── Native: original local-DB-first routing ────────────────────────────
    // Proactively pull + apply any pending OTA update so users actually receive
    // fixes on this launch, instead of only after a second manual relaunch. Bounded
    // to ~5s so a slow network can't block startup; reloadAsync restarts the app.
    if (Updates.isEnabled) {
      try {
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
        const check = await Promise.race([Updates.checkForUpdateAsync(), timeout])
        if (check && check.isAvailable) {
          await Updates.fetchUpdateAsync()
          await Updates.reloadAsync()
          return  // app restarts with the new bundle; nothing below runs
        }
      } catch (e) {
        console.warn('[layout] OTA check failed (non-fatal):', e)
      }
    }

    // Navigate based on local DB — instant, no network required
    try {
      const [rows, focusRows] = await Promise.all([
        db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
        db.select().from(focusListingsTable).limit(1),
      ])
      const settings = rows[0]

      if (!settings?.fullName) {
        router.replace('/landing')
      } else if (!hasOnboardingFocus({
        selectedListingSlug: settings.selectedListingSlug,
        focusCount: focusRows.length,
        targetExams: settings.targetExams,
      })) {
        // No exam/scholarship chosen yet — send to onboarding step 2
        router.replace('/onboarding')
      }
      // else: returning user — Stack shows tabs automatically
    } catch (e) {
      console.error('[layout] init error:', e)
      router.replace('/landing')
    } finally {
      onReady()  // hide the loading overlay
    }

    // Prune notes older than 7 days in trash — fire and forget
    pruneOldTrashedNotesDb(db).catch(e => console.warn('[layout] prune trash:', e))

    // Re-schedule any note reminders lost after a device reboot — fire and forget
    ;(async () => {
      try {
        const rows = await db.select({
          id: notesTable.id,
          title: notesTable.title,
          reminderAt: notesTable.reminderAt,
        }).from(notesTable).where(and(
          eq(notesTable.isArchived, false),
          eq(notesTable.isTrashed, false),
          gt(notesTable.reminderAt, Date.now()),
        ))
        for (const row of rows) {
          if (row.reminderAt) {
            await scheduleNoteReminder(row.id, row.title, new Date(row.reminderAt))
          }
        }
      } catch (e) {
        console.warn('[layout] reschedule note reminders:', e)
      }
    })()

    // Background sync — deferred until after all interactions/animations finish so
    // the initial navigation render is not jank-blocked by I/O.
    InteractionManager.runAfterInteractions(() => {
      void syncOnLaunch(db)
        .catch(e => console.warn('[layout] bg sync:', e))
    })

    // Request notification permission on startup (non-blocking)
    requestNotificationPermissions().catch(e => console.warn('[layout] notif permission:', e))
  }, [db, onReady])

  useEffect(() => {
    // initialize() may return a cleanup fn on web (supabase subscription).
    // Guard against the case where the component unmounts before initialize()
    // resolves: set disposed=true in cleanup, then if the promise resolves
    // after that, call fn() immediately so the subscription never leaks.
    let cleanup: (() => void) | undefined
    let disposed = false
    initialize()
      .then(fn => {
        if (disposed) {
          // Already unmounted — call the cleanup immediately so the
          // subscription (created inside initialize) is unsubscribed.
          fn?.()
        } else {
          cleanup = fn
        }
      })
      .catch(() => { /* errors logged inside */ })
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [initialize])

  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="notes" options={{ animation: 'slide_from_left' }} />
    </Stack>
  )

  return (
    <>
      <StatusBar style="dark" />
      <AnalyticsScreenTracker />
      {/* Web, signed out: only the auth, legal and guest-diagnostic routes, on every navigation. */}
      <WebGuestRouteGuard enabled={ready} />
      {/* Consent for the current Terms covers every route, deep links included. It
          starts checking once the launch routing below has run (`ready`). */}
      <ConsentGate enabled={ready}>
        {Platform.OS === 'web' ? <RouteFade>{stack}</RouteFade> : stack}
      </ConsentGate>
    </>
  )
}
