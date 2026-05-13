import { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '../services/supabase'
import { syncOnLaunch } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'

interface ListingRow {
  id: string
  slug: string
  title: string
  type: string
  exam_date: string | null
}

export default function OnboardingScreen() {
  const db = useDb()
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('listings')
      .select('id,slug,title,type,exam_date')
      .in('status', ['active', 'upcoming'])
      .order('title')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('[onboarding] fetch listings error:', error)
        setListings(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function handleSelect(listing: ListingRow) {
    setSelecting(true)
    try {
      await db.insert(userSettings)
        .values({ id: 1, selectedListingSlug: listing.slug, lastSyncedAt: 0 })
        .onConflictDoUpdate({
          target: userSettings.id,
          set: { selectedListingSlug: listing.slug, lastSyncedAt: 0 },
        })
      await syncOnLaunch(db)
      router.replace('/(tabs)')
    } catch (e) {
      console.error('[onboarding] select error:', e)
    } finally {
      setSelecting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#1a1a2e] items-center justify-center">
        <ActivityIndicator color="#fff" size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-[#1a1a2e]">
      <View className="px-6 pt-8 pb-4">
        <Text className="text-white text-3xl font-bold">
          Which exam are you{'\n'}preparing for?
        </Text>
        <Text className="text-white/50 text-sm mt-2">
          You can change this later from your profile.
        </Text>
      </View>

      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleSelect(item)}
            disabled={selecting}
            className="bg-white/10 rounded-2xl p-4 mb-3 border border-white/20 active:bg-white/20"
          >
            <Text className="text-white font-semibold text-base">{item.title}</Text>
            {item.exam_date ? (
              <Text className="text-white/50 text-sm mt-1">
                {new Date(item.exam_date).toLocaleDateString('en-PH', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      />

      {selecting ? (
        <View className="absolute inset-0 bg-black/50 items-center justify-center">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </SafeAreaView>
  )
}
