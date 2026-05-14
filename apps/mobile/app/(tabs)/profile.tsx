import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native'
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
    <SafeAreaView style={s.root}>
      <View style={s.inner}>
        <Text style={s.title}>Profile</Text>
        <TouchableOpacity onPress={handleChangeExam} style={s.card}>
          <Text style={s.cardTitle}>Change Exam</Text>
          <Text style={s.cardSub}>Select a different exam to study for</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleExport} style={s.card}>
          <Text style={s.cardTitle}>Export Data</Text>
          <Text style={s.cardSub}>Save your preferences as a JSON file</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  inner: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 20 },
  card: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 16, marginBottom: 10 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold' },
  cardSub: { fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 3, fontFamily: 'Lexend_400Regular' },
})
