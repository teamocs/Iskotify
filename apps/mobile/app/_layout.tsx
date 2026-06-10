import { useEffect, useState, useCallback } from 'react'
import { Platform, View, Text, Image, InteractionManager } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
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
import { syncOnLaunch } from '../services/sync'
import { runEnhancement } from '../hooks/useAiEnhancement'
import { pruneOldTrashedNotesDb } from '../hooks/useNotes'
import { notes as notesTable, userSettings, focusListings as focusListingsTable } from '../db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { hasOnboardingFocus } from '../utils/onboardingStatus'
import { requestNotificationPermissions, scheduleNoteReminder } from '../services/notifications'

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

  if (Platform.OS === 'web') {
    return <WebUnsupported />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
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
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

function WebUnsupported() {
  return (
    <View style={{ flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <StatusBar style="light" />
      <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8, textAlign: 'center' }}>Iskotify</Text>
      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 20 }}>
        This app runs on iOS and Android.{'\n'}Scan the QR code from the terminal using Expo Go.
      </Text>
    </View>
  )
}

function AppInit({ onReady }: { onReady: () => void }) {
  const db = useDb()
  const { isDark } = useTheme()

  const initialize = useCallback(async () => {
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
    void initialize()
  }, [initialize])

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AiCoachProvider>
        <KuyaChatProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="notes" options={{ animation: 'slide_from_left' }} />
          </Stack>
        </KuyaChatProvider>
      </AiCoachProvider>
    </>
  )
}
