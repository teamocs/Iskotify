import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { DrizzleProvider } from '../db'
import { useDb } from '../hooks/useDb'
import { syncOnLaunch } from '../services/sync'
import { userSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import '../global.css'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="iskotify.db" options={{ enableChangeListener: true }}>
      <DrizzleProvider>
        <AppInit />
      </DrizzleProvider>
    </SQLiteProvider>
  )
}

function AppInit() {
  const db = useDb()
  const [ready, setReady] = useState(false)

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
        await SplashScreen.hideAsync()
        setReady(true)
      }
    }
    void init()
  }, [])

  return (
    <>
      <StatusBar style="light" />
      {ready ? (
        <Stack screenOptions={{ headerShown: false }} />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#1a1a2e' }} />
      )}
    </>
  )
}
