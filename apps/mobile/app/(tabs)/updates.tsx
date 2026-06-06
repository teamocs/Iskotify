import { StyleSheet, View, Text, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'

function PlaceholderCard({ title }: { title: string }) {
  const { theme: t, typo } = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.divider }]}>
      <Text style={[styles.cardTitle, { color: t.textPrimary, fontSize: typo.sm }]}>{title}</Text>
      <Text style={[styles.comingSoon, { color: t.textSecondary, fontSize: typo.xs }]}>
        Coming soon
      </Text>
    </View>
  )
}

export default function UpdatesScreen() {
  const { theme: t, typo } = useTheme()

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.textPrimary, fontSize: typo.xl }]}>Updates</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary, fontSize: typo.sm }]}>
          Events, news &amp; app updates
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PlaceholderCard title="Upcoming Events" />
        <PlaceholderCard title="News" />
        <PlaceholderCard title="Iskotify Updates" />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontWeight: '400',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 8,
    minHeight: 100,
    justifyContent: 'center',
  },
  cardTitle: {
    fontWeight: '600',
  },
  comingSoon: {
    fontWeight: '400',
    fontStyle: 'italic',
  },
})
