import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function AnalyticsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: 'Outfit_700Bold', fontSize: 18 }}>Analytics</Text>
      <Text style={{ color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', fontSize: 12, marginTop: 6 }}>
        Coming soon
      </Text>
    </SafeAreaView>
  )
}
