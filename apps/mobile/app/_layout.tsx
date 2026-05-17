import { useEffect, useState, useCallback } from 'react'
import { Platform, View, Text, ActivityIndicator, TouchableOpacity } from 'react-native'
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
import { useDb } from '../hooks/useDb'
import { syncOnLaunch } from '../services/sync'
import { supabase } from '../services/supabase'
import { userSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import '../global.css'

type AppState = 'loading' | 'offline' | 'ready'

/**
 * Checks if Supabase is reachable within 5 seconds.
 * Supabase is what the app needs — not just generic internet.
 */
async function checkConnectivity(): Promise<boolean> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 5000)
    )
    const check = supabase.from('listings').select('id').limit(1)
    await Promise.race([check, timeout])
    return true
  } catch {
    return false
  }
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

  if (Platform.OS === 'web') {
    return <WebUnsupported />
  }

  return (
    <SQLiteProvider databaseName="iskotify.db" options={{ enableChangeListener: true }}>
      <DrizzleProvider>
        <AppInit fontsReady={fontsLoaded || !!fontError} />
      </DrizzleProvider>
    </SQLiteProvider>
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

function AppInit({ fontsReady }: { fontsReady: boolean }) {
  const db = useDb()
  const [appState, setAppState] = useState<AppState>('loading')

  const initialize = useCallback(async () => {
    setAppState('loading')

    // Require Supabase to be reachable before doing anything
    const isOnline = await checkConnectivity()
    if (!isOnline) {
      setAppState('offline')
      return
    }

    // Sync fresh data from Supabase (non-fatal if it fails)
    try {
      await syncOnLaunch(db)
    } catch (e) {
      console.warn('[layout] sync warning:', e)
    }

    // Decide which screen to show based on local DB state
    try {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const settings = rows[0]
      if (!settings?.fullName) {
        router.replace('/landing')
      } else if (!settings?.selectedListingSlug) {
        router.replace('/onboarding')
      }
      // else: returning user with full profile — Stack shows main app
    } catch (e) {
      console.error('[layout] init error:', e)
      router.replace('/landing')
    } finally {
      setAppState('ready')
    }
  }, [db])

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />

      {/* Loading overlay — while checking internet + syncing + font loading */}
      {(appState === 'loading' || !fontsReady) && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <View style={{ width: 64, height: 64, backgroundColor: '#831626', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 36, color: '#fff', fontWeight: '700' }}>I</Text>
          </View>
          <ActivityIndicator color="rgba(252,165,165,0.8)" size="small" />
        </View>
      )}

      {/* Offline overlay — when Supabase is unreachable */}
      {appState === 'offline' && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', padding: 28,
        }}>
          <View style={{ width: 64, height: 64, backgroundColor: '#831626', borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 36, color: '#fff', fontWeight: '700' }}>I</Text>
          </View>
          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 22, color: '#fff', textAlign: 'center', marginBottom: 8 }}>
            No Internet Connection
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 20, marginBottom: 32 }}>
            Iskotify needs an internet connection to load your study data. Please connect and try again.
          </Text>
          <TouchableOpacity
            onPress={() => void initialize()}
            style={{ backgroundColor: '#831626', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 13 }}
          >
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: '#fff' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  )
}
