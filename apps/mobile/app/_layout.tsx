import { useEffect, useState, useCallback } from 'react'
import { Platform, View, Image, InteractionManager } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, router } from 'expo-router'
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
import { ThemeProvider, useTheme } from '../theme/ThemeContext'
import { useDb } from '../hooks/useDb'
import { AiCoachProvider } from '../providers/AiCoachProvider'
import { KuyaChatProvider } from '../providers/KuyaChatProvider'
import { RouteFade } from '../components/web/RouteFade'
import { syncOnLaunch } from '../services/sync'
import { pullUserData } from '../services/sync'
import { runEnhancement } from '../hooks/useAiEnhancement'
import { pruneOldTrashedNotesDb } from '../hooks/useNotes'
import { notes as notesTable, userSettings, focusListings as focusListingsTable } from '../db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { hasOnboardingFocus } from '../utils/onboardingStatus'
import { webEntryTarget } from '../utils/webEntryTarget'
import { supabase } from '../services/supabase'
import { requestNotificationPermissions, scheduleNoteReminder } from '../services/notifications'

// KeyboardProvider is native-only (react-native-keyboard-controller).
// On web, render children directly — the provider import itself is safe to
// include in the bundle but its runtime code is no-op on web. We gate the
// wrapper to avoid any potential side effects.
let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> | null = null
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  // Stable callback — never changes, safe as useCallback dep
  const handleReady = useCallback(() => setAppReady(true), [])

  // ── Web: no SQLiteProvider (sql.js used instead via WebDrizzleProvider) ──
  if (Platform.OS === 'web') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProviderCompat>
          <DrizzleProvider>
            <ThemeProvider>
              <AppInit onReady={handleReady} />
            </ThemeProvider>
          </DrizzleProvider>
          {(!appReady || !fontsReady) && (
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center',
            }}>
              <Image
                source={require('../assets/images/icon.png')}
                style={{ width: 80, height: 80, borderRadius: 20 }}
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
              <AppInit onReady={handleReady} />
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
            backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center',
          }}>
            <Image
              source={require('../assets/images/icon.png')}
              style={{ width: 80, height: 80, borderRadius: 20 }}
            />
          </View>
        )}
      </KeyboardProviderCompat>
    </GestureHandlerRootView>
  )
}

function AppInit({ onReady }: { onReady: () => void }) {
  const db = useDb()
  const { isDark } = useTheme()

  const initialize = useCallback(async () => {
    // ── Web: auth-first entry gate ─────────────────────────────────────────
    // On web, session is the source of truth for routing. We check it first,
    // before the local DB, so an unauthenticated visitor always lands on the
    // sign-in screen. Native keeps its original local-DB-first flow below.
    if (Platform.OS === 'web') {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          // No session → sign-in screen
          router.replace('/auth/sign-in')
          onReady()
          return
        }

        // Session exists — pull latest user data from Supabase (non-fatal)
        try {
          await pullUserData(db)
        } catch (e) {
          console.warn('[layout] web pullUserData (non-fatal):', e)
        }

        // Route based on local DB state (populated by pullUserData above)
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
        if (target !== '/(tabs)') {
          router.replace(target)
        }
        // else: returning user — Stack shows tabs automatically
      } catch (e) {
        console.error('[layout] web init error:', e)
        router.replace('/auth/sign-in')
      } finally {
        onReady()
      }

      // ── Web: pull the catalog (listings/flashcards/subjects/topics/upcat/
      // career/university) the SAME way native does. Without this the web init
      // branch only ran pullUserData (per-user backup) and every catalog-backed
      // screen rendered empty. Web has no InteractionManager guarantees, so we
      // fire it AFTER onReady() (non-blocking) — syncOnLaunch invalidates the
      // queryCache, so screens re-render once the data lands. Fire-and-forget.
      void syncOnLaunch(db)
        .then(() => { void runEnhancement(db) })
        .catch(e => console.warn('[layout] web bg sync:', e))

      // Subscribe to auth state changes on web so sign-in/sign-out re-routes.
      // This subscription is long-lived for the app's lifetime — no cleanup
      // needed (supabase-js handles it; the app will re-mount after signOut).
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'SIGNED_IN' && session) {
            try { await pullUserData(db) } catch { /* non-fatal */ }
            // Fresh sign-in on web: pull the catalog too (non-blocking).
            void syncOnLaunch(db)
              .then(() => { void runEnhancement(db) })
              .catch(e => console.warn('[layout] web signed-in sync:', e))
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
            router.replace(target)
          } else if (event === 'SIGNED_OUT') {
            router.replace('/auth/sign-in')
          }
        }
      )
      // Subscription cleanup when component unmounts (e.g. during HMR)
      return () => subscription.unsubscribe()
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
    // After sync completes, kick off AI enhancement in the background (fire-and-forget).
    InteractionManager.runAfterInteractions(() => {
      void syncOnLaunch(db)
        .then(() => { void runEnhancement(db) })
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
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AiCoachProvider>
        <KuyaChatProvider>
          {Platform.OS === 'web' ? <RouteFade>{stack}</RouteFade> : stack}
        </KuyaChatProvider>
      </AiCoachProvider>
    </>
  )
}
