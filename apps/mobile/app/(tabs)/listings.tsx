import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined, SparkOutlined, Funnel1Outlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { listings as listingsTable } from '../../db/schema'

type Segment = 'all' | 'exam' | 'scholarship'

interface ListingRow {
  id: string; slug: string; title: string; type: string; status: string; examDate: number | null
}

function fmtDate(ts: number | null): string {
  if (!ts) return 'Date TBA'
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ListingsScreen() {
  const db = useDb()
  const [all, setAll] = useState<ListingRow[]>([])
  const [segment, setSegment] = useState<Segment>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    db.select().from(listingsTable).then(rows => setAll(rows))
  }, [db])

  const filtered = useMemo(() => {
    return all
      .filter(l => segment === 'all' || l.type === segment)
      .filter(l => l.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (!a.examDate) return 1
        if (!b.examDate) return -1
        return a.examDate - b.examDate
      })
  }, [all, segment, query])

  const isExam = (l: ListingRow) => l.type === 'exam'

  return (
    <SafeAreaView style={s.root}>

      <View style={s.header}>
        <Text style={s.title}>Listings</Text>
        <Text style={s.subtitle}>Exams & Scholarships</Text>
      </View>

      {/* Segment control */}
      <View style={s.seg}>
        {(['all', 'exam', 'scholarship'] as Segment[]).map(seg => (
          <TouchableOpacity key={seg} style={[s.segBtn, segment === seg && s.segBtnOn]} onPress={() => setSegment(seg)}>
            <Text style={[s.segTxt, segment === seg && s.segTxtOn]}>
              {seg === 'all' ? 'All' : seg === 'exam' ? 'Exams' : 'Scholarships'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + filter */}
      <View style={s.searchRow}>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>🔍</Text>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search..."
          placeholderTextColor="rgba(255,255,255,0.38)"
        />
        <View style={s.searchDivider} />
        <TouchableOpacity>
          <Lineicons icon={Funnel1Outlined} size={13} color="rgba(255,255,255,0.62)" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={s.empty}>No listings found.</Text>}
        renderItem={({ item: l }) => {
          const exam = isExam(l)
          return (
            <View style={s.card}>
              <View style={[s.cardIcon, exam ? s.examIcon : s.scholarIcon]}>
                <Lineicons
                  icon={exam ? GraduationCap1Outlined : SparkOutlined}
                  size={16}
                  color={exam ? '#fca5a5' : '#4ade80'}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.row1}>
                  <Text style={s.cardTitle} numberOfLines={1}>{l.title}</Text>
                  <View style={[s.typeBadge, exam ? s.examBadge : s.scholarBadge]}>
                    <Text style={[s.typeTxt, { color: exam ? '#fca5a5' : '#4ade80' }]}>
                      {exam ? 'Exam' : 'Scholar'}
                    </Text>
                  </View>
                </View>
                <View style={s.row2}>
                  <Text style={s.dateText}>{fmtDate(l.examDate)}</Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>🔖</Text>
                </View>
              </View>
            </View>
          )
        }}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  subtitle: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2, fontFamily: 'Lexend_400Regular' },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 10, padding: 3, gap: 2, marginHorizontal: 16, marginBottom: 8 },
  segBtn: { flex: 1, paddingVertical: 5, borderRadius: 8, alignItems: 'center' },
  segBtnOn: { backgroundColor: 'rgba(128,0,0,0.82)' },
  segTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_600SemiBold' },
  segTxtOn: { color: '#fff' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8, marginHorizontal: 16, marginBottom: 9 },
  searchInput: { flex: 1, fontSize: 11, color: '#fff', fontFamily: 'Lexend_400Regular', padding: 0 },
  searchDivider: { width: 1, height: 13, backgroundColor: 'rgba(255,255,255,0.20)' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  examIcon: { backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)' },
  scholarIcon: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  cardTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  typeBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
  examBadge: { backgroundColor: 'rgba(128,0,0,0.12)', borderColor: 'rgba(128,0,0,0.25)' },
  scholarBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.22)' },
  typeTxt: { fontSize: 8.5, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { flex: 1, fontSize: 9.5, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  empty: { textAlign: 'center', color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', fontSize: 11, marginTop: 32 },
})
