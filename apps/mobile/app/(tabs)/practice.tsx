import { StyleSheet, View, Text, TouchableOpacity, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { usePracticeData, type Strength, type TopicRow } from '../../hooks/usePracticeData'
import { useHomeStats } from '../../hooks/useHomeStats'

const STRENGTH_COLOR: Record<Strength, { bg: string; border: string; text: string; iconBg: string; iconColor: string }> = {
  New:    { bg: 'rgba(128,0,0,0.10)',    border: 'rgba(128,0,0,0.25)',    text: '#fca5a5', iconBg: 'rgba(128,0,0,0.10)',    iconColor: '#fca5a5' },
  Weak:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)',  text: '#f87171', iconBg: 'rgba(239,68,68,0.10)',  iconColor: '#f87171' },
  Review: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)', text: '#fbbf24', iconBg: 'rgba(245,158,11,0.08)', iconColor: '#fbbf24' },
  Strong: { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.22)',  text: '#4ade80', iconBg: 'rgba(34,197,94,0.08)',  iconColor: '#4ade80' },
}

function lastPracticedLabel(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function TopicCard({ row }: { row: TopicRow }) {
  const c = STRENGTH_COLOR[row.strength]
  return (
    <TouchableOpacity style={s.topicCard} onPress={() => router.push(`/practice/${row.topic.id}`)}>
      <View style={[s.topicIcon, { backgroundColor: c.iconBg }]}>
        <Text style={{ color: c.iconColor, fontSize: 15 }}>📖</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.topicName} numberOfLines={1}>{row.topic.name}</Text>
        <Text style={s.topicSub}>{row.cardCount} cards · {lastPracticedLabel(row.lastPracticedAt)}</Text>
      </View>
      <View style={[s.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
        <Text style={[s.badgeText, { color: c.text }]}>{row.strength}</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function PracticeScreen() {
  const { subjects, topicRows, selectedSubjectId, setSelectedSubjectId, totalCards } = usePracticeData()
  const { listing } = useHomeStats()

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Practice</Text>
        <Text style={s.subtitle}>{listing?.title ?? '—'} · {totalCards} cards synced</Text>
      </View>

      {/* Subject filter chips — flex-wrap, no scroll */}
      <View style={s.chips}>
        <TouchableOpacity onPress={() => setSelectedSubjectId(null)}>
          <View style={[s.chip, !selectedSubjectId && s.chipOn]}>
            <Text style={[s.chipTxt, !selectedSubjectId && s.chipTxtOn]}>All</Text>
          </View>
        </TouchableOpacity>
        {subjects.map(sub => (
          <TouchableOpacity key={sub.id} onPress={() => setSelectedSubjectId(sub.id)}>
            <View style={[s.chip, selectedSubjectId === sub.id && s.chipOn]}>
              <Text style={[s.chipTxt, selectedSubjectId === sub.id && s.chipTxtOn]}>{sub.name}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.secRow}>
        <Text style={s.secTitle}>Topics</Text>
        <Text style={s.sortLink}>Sort</Text>
      </View>

      <FlatList
        data={topicRows}
        keyExtractor={r => r.topic.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <TopicCard row={item} />}
        ListEmptyComponent={<Text style={s.empty}>No topics found. Try syncing again.</Text>}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  subtitle: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2, fontFamily: 'Lexend_400Regular' },
  chips: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: 'rgba(128,0,0,0.82)', borderColor: 'transparent' },
  chipTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_600SemiBold' },
  chipTxtOn: { color: '#fff' },
  secRow: { paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  secTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  sortLink: { fontSize: 10, color: '#fca5a5', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  topicCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  topicIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topicName: { fontSize: 12, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold', marginBottom: 1 },
  topicSub: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 9, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  empty: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 32 },
})
