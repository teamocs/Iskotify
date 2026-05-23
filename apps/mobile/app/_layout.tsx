import { useEffect, useState, useCallback } from 'react'
import { Platform, View, Text, Image } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
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
import { syncOnLaunch } from '../services/sync'
import { runEnhancement } from '../hooks/useAiEnhancement'
import { userSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { requestNotificationPermissions } from '../services/notifications'
import '../global.css'

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
    <>
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
    </>
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
    // Navigate based on local DB — instant, no network required
    try {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const settings = rows[0]
      if (!settings?.fullName) {
        router.replace('/landing')
      } else if (!settings?.selectedListingSlug) {
        router.replace('/onboarding')
      }
      // else: returning user — Stack shows tabs automatically
    } catch (e) {
      console.error('[layout] init error:', e)
      router.replace('/landing')
    } finally {
      onReady()  // hide the loading overlay
    }

    // Background sync — fire and forget, never blocks navigation.
    // After sync completes, kick off AI enhancement in the background (fire-and-forget).
    syncOnLaunch(db)
      .then(() => { void runEnhancement(db) })
      .catch(e => console.warn('[layout] bg sync:', e))

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
        <Stack screenOptions={{ headerShown: false }} />
      </AiCoachProvider>
    </>
  )
}
