import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { useFonts } from 'expo-font'
import {
  Outfit_400Regular,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit'
import {
  Lexend_300Light,
  Lexend_400Regular,
  Lexend_500Medium,
  Lexend_600SemiBold,
} from '@expo-google-fonts/lexend'
import { DrizzleProvider } from '../db'
import { useDb } from '../hooks/useDb'
import { syncOnLaunch } from '../services/sync'
import { userSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import '../global.css'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Lexend_300Light,
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
  })

  return (
    <SQLiteProvider databaseName="iskotify.db" options={{ enableChangeListener: true }}>
      <DrizzleProvider>
        <AppInit fontsLoaded={fontsLoaded} />
      </DrizzleProvider>
    </SQLiteProvider>
  )
}

function AppInit({ fontsLoaded }: { fontsLoaded: boolean }) {
  const db = useDb()
  const [dbReady, setDbReady] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        await syncOnLaunch(db)
        const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
        if (!rows[0]?.selectedListingSlug) {
          router.replace('/onboarding')
        }
      } catch (e) {
        console.error('[layout] init error:', e)
        router.replace('/onboarding')
      } finally {
        setDbReady(true)
      }
    }
    void init()
  }, [db])

  useEffect(() => {
    if (dbReady && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [dbReady, fontsLoaded])

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      {(!dbReady || !fontsLoaded) && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1a1a2e' }} />
      )}
    </>
  )
}
