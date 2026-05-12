import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { DatabaseProvider } from '../hooks/useDatabase'
import { database } from '../db'
import { syncOnLaunch } from '../services/sync'
import type { UserSettings } from '../db/models/UserSettings'
import '../global.css'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        await syncOnLaunch(database)
        const settings = await database
          .get<UserSettings>('user_settings')
          .find('local')
          .catch(() => null)
        if (!settings?.selectedListingSlug) {
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
    <DatabaseProvider>
      <StatusBar style="light" />
      {ready ? (
        <Stack screenOptions={{ headerShown: false }} />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#1a1a2e' }} />
      )}
    </DatabaseProvider>
  )
}
