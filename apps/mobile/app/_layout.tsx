import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { DatabaseProvider } from '../hooks/useDatabase'
import { database } from '../db'
import { syncOnLaunch } from '../services/sync'
import type { UserSettings } from '../db/models/UserSettings'
import '../global.css'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
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
      }
    }
    init()
  }, [])

  return (
    <DatabaseProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </DatabaseProvider>
  )
}
