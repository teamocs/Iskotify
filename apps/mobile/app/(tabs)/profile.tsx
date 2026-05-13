import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { exportUserData } from '../../services/export'
import { userSettings } from '../../db/schema'

export default function ProfileScreen() {
  const db = useDb()

  function handleChangeExam() {
    Alert.alert(
      'Change Exam',
      'This will clear your current selection and restart onboarding.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.update(userSettings)
                .set({ selectedListingSlug: '', lastSyncedAt: 0 })
                .where(eq(userSettings.id, 1))
              router.replace('/onboarding')
            } catch {
              Alert.alert('Error', 'Could not reset your selection. Please try again.')
            }
          },
        },
      ]
    )
  }

  async function handleExport() {
    try {
      await exportUserData(db)
    } catch {
      Alert.alert('Export Failed', 'Could not export data. Please try again.')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#1a1a2e]">
      <View className="flex-1 px-6 pt-8">
        <Text className="text-white text-3xl font-bold mb-8">Profile</Text>

        <TouchableOpacity
          onPress={handleChangeExam}
          className="bg-white/10 rounded-2xl p-4 mb-4 border border-white/20"
        >
          <Text className="text-white font-semibold text-base">Change Exam</Text>
          <Text className="text-white/50 text-sm mt-1">
            Select a different exam to study for
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleExport}
          className="bg-white/10 rounded-2xl p-4 border border-white/20"
        >
          <Text className="text-white font-semibold text-base">Export Data</Text>
          <Text className="text-white/50 text-sm mt-1">
            Save your preferences as a JSON file
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
