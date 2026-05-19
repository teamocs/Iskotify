import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  StyleSheet, View, Text, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { usePracticeData, type Strength, type TopicRow } from '../../hooks/usePracticeData'
import { useFocusListings, type FocusListing } from '../../hooks/useFocusListings'
import { useHomeStats } from '../../hooks/useHomeStats'
import { useSavedDecks, type SavedDeck } from '../../hooks/useSavedDecks'

// ── Strength colours ──────────────────────────────────────────────────────────

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
  return `${days}d ago`
}

// ── Recommended card (horizontal scroll) ─────────────────────────────────────

function RecommendedCard({ row }: { row: TopicRow }) {
  const c = STRENGTH_COLOR[row.strength]
  return (
    <TouchableOpacity
      style={rc.card}
      onPress={() => router.push(`/practice/${row.topic.id}`)}
      activeOpacity={0.8}
    >
      <View style={[rc.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
        <Text style={[rc.badgeTxt, { color: c.text }]}>{row.strength}</Text>
      </View>
      <Text style={rc.name} numberOfLines={2}>{row.topic.name}</Text>
      <Text style={rc.sub}>{row.cardCount} cards</Text>
    </TouchableOpacity>
  )
}

// ── Topic card ────────────────────────────────────────────────────────────────

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

// ── Deck card ─────────────────────────────────────────────────────────────────

function DeckCard({
  deck,
  totalCards,
  onDelete,
}: {
  deck: SavedDeck
  totalCards: number
  onDelete: () => void
}) {
  function handleLongPress() {
    Alert.alert('Delete Deck', `Delete "${deck.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ])
  }

  return (
    <TouchableOpacity
      style={s.deckCard}
      onPress={() => router.push(`/practice/deck/${deck.id}`)}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      <View style={s.deckIcon}>
        <Text style={{ fontSize: 16 }}>🗂️</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.deckName} numberOfLines={1}>{deck.name}</Text>
        <Text style={s.deckSub}>{deck.topicIds.length} topic{deck.topicIds.length !== 1 ? 's' : ''} · {totalCards} cards</Text>
      </View>
      <Text style={s.deckChevron}>›</Text>
    </TouchableOpacity>
  )
}

// ── Create Deck Modal ─────────────────────────────────────────────────────────

function CreateDeckModal({
  visible,
  topicRows,
  onClose,
  onCreate,
}: {
  visible: boolean
  topicRows: TopicRow[]
  onClose: () => void
  onCreate: (name: string, topicIds: string[]) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(''); setSelected(new Set()); setStep(1); setSaving(false)
  }
  function handleClose() { reset(); onClose() }

  function toggleTopic(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!name.trim() || selected.size === 0) return
    setSaving(true)
    try { await onCreate(name.trim(), Array.from(selected)); reset(); onClose() }
    finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.headerRow}>
            <Text style={m.title}>New Deck</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={m.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {step === 1 ? (
            <>
              <Text style={m.label}>Deck name</Text>
              <TextInput
                style={m.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. UPCAT Science Finals"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => { if (name.trim()) setStep(2) }}
              />
              <TouchableOpacity
                style={[m.btn, !name.trim() && m.btnDisabled]}
                disabled={!name.trim()}
                onPress={() => setStep(2)}
              >
                <Text style={m.btnTxt}>Next: Pick Topics →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={m.label}>Select topics  ({selected.size} chosen)</Text>
              <ScrollView style={m.topicList} showsVerticalScrollIndicator={false}>
                {topicRows.map(row => {
                  const on = selected.has(row.topic.id)
                  return (
                    <TouchableOpacity
                      key={row.topic.id}
                      style={[m.topicRow, on && m.topicRowOn]}
                      onPress={() => toggleTopic(row.topic.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[m.checkbox, on && m.checkboxOn]}>
                        {on && <Text style={m.checkmark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={m.topicName} numberOfLines={1}>{row.topic.name}</Text>
                        <Text style={m.topicSub}>{row.cardCount} cards</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
              <View style={m.footerRow}>
                <TouchableOpacity style={m.backBtn} onPress={() => setStep(1)}>
                  <Text style={m.backTxt}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[m.btn, m.btnFlex, (selected.size === 0 || saving) && m.btnDisabled]}
                  disabled={selected.size === 0 || saving}
                  onPress={handleCreate}
                >
                  <Text style={m.btnTxt}>{saving ? 'Saving…' : 'Create Deck'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

// ── Focus card ────────────────────────────────────────────────────────────────

function FocusCard({ row, isActive, onPress }: { row: FocusListing; isActive: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[fc.card, isActive && fc.cardActive]}
      activeOpacity={0.8}
    >
      <Text style={fc.badge}>#{row.priority} · {row.type === 'exam' ? 'Exam' : 'Scholar'}</Text>
      <Text style={fc.name} numberOfLines={2}>{row.title}</Text>
    </TouchableOpacity>
  )
}

const fc = StyleSheet.create({
  card: { minWidth: 110, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 16, padding: 11, marginRight: 8 },
  cardActive: { backgroundColor: 'rgba(128,0,0,0.18)', borderColor: '#831626', borderWidth: 2 },
  badge: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Lexend_600SemiBold' },
  name: { fontSize: 11, fontWeight: '700', color: '#fff', lineHeight: 15, fontFamily: 'Outfit_700Bold' },
})

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PracticeScreen() {
  const { subjects, topicRows, recommendedTopics, selectedSubjectId, setSelectedSubjectId, totalCards, cardCountByTopic, topicIdsByListingSlug } = usePracticeData()
  const { listing } = useHomeStats()
  const { decks, createDeck, deleteDeck } = useSavedDecks()
  const [modalVisible, setModalVisible] = useState(false)

  const { focusListings: focusListingsList } = useFocusListings()
  const [activeFocusSlug, setActiveFocusSlug] = useState<string>('')

  // Sync activeFocusSlug to first focus listing when list loads
  useEffect(() => {
    if (focusListingsList.length > 0 && !activeFocusSlug) {
      setActiveFocusSlug(focusListingsList[0]!.slug)
    }
  }, [focusListingsList])

  const activeTopicIds = useMemo(
    () => new Set(topicIdsByListingSlug[activeFocusSlug] ?? []),
    [topicIdsByListingSlug, activeFocusSlug]
  )

  const activeRecommended = useMemo(
    () => topicRows
      .filter(r => activeTopicIds.has(r.topic.id))
      .sort((a, b) =>
        ({ New: 0, Weak: 1, Review: 2, Strong: 3 }[a.strength] ?? 0) -
        ({ New: 0, Weak: 1, Review: 2, Strong: 3 }[b.strength] ?? 0)
      )
      .slice(0, 5),
    [topicRows, activeTopicIds]
  )

  const weakTopicsForActive = useMemo(
    () => topicRows.filter(r => activeTopicIds.has(r.topic.id) && r.strength === 'Weak'),
    [topicRows, activeTopicIds]
  )

  const activeListing = useMemo(
    () => focusListingsList.find(r => r.slug === activeFocusSlug),
    [focusListingsList, activeFocusSlug]
  )

  const deckCardCount = useCallback(
    (deck: SavedDeck) => deck.topicIds.reduce((sum, tid) => sum + (cardCountByTopic[tid] ?? 0), 0),
    [cardCountByTopic]
  )

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Practice</Text>
        <Text style={s.subtitle}>{listing?.title ?? '—'} · {totalCards} cards synced</Text>
      </View>

      {/* Subject filter chips */}
      <View style={s.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsContent}
          style={s.chipsScroll}
        >
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
        </ScrollView>
      </View>

      <FlatList
        data={topicRows}
        keyExtractor={r => r.topic.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <TopicCard row={item} />}
        ListEmptyComponent={<Text style={s.empty}>No topics found. Try syncing again.</Text>}
        ListHeaderComponent={
          <>
            {/* Focus cards row */}
            {focusListingsList.length > 0 && (
              <>
                <View style={s.secRow}>
                  <Text style={s.secTitle}>My Focus</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 4, marginBottom: 12 }}
                >
                  {focusListingsList.map(row => (
                    <FocusCard
                      key={row.slug}
                      row={row}
                      isActive={row.slug === activeFocusSlug}
                      onPress={() => setActiveFocusSlug(row.slug)}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* Quick Start — auto-generated decks for active focus */}
            {activeFocusSlug ? (
              <>
                <View style={s.secRow}>
                  <Text style={s.secTitle}>Quick Start</Text>
                  <Text style={s.secSub}>{activeListing?.title ?? ''}</Text>
                </View>
                <TouchableOpacity
                  style={qs.card}
                  onPress={() => router.push(`/practice/listing/${activeFocusSlug}?mode=all`)}
                  activeOpacity={0.8}
                >
                  <View style={qs.icon}><Text style={{ fontSize: 15 }}>⚡</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={qs.title}>Full Review Deck</Text>
                    <Text style={qs.sub}>Auto · all topics tagged to this listing</Text>
                  </View>
                  <Text style={qs.go}>›</Text>
                </TouchableOpacity>
                {weakTopicsForActive.length > 0 && (
                  <TouchableOpacity
                    style={qs.card2}
                    onPress={() => router.push(`/practice/listing/${activeFocusSlug}?mode=weak`)}
                    activeOpacity={0.8}
                  >
                    <View style={qs.icon2}><Text style={{ fontSize: 15 }}>⚠️</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={qs.title}>Weak Topics Only</Text>
                      <Text style={qs.sub}>Smart · {weakTopicsForActive.length} weak topics</Text>
                    </View>
                    <Text style={[qs.go, { color: 'rgba(245,158,11,0.80)' }]}>›</Text>
                  </TouchableOpacity>
                )}
                <View style={{ height: 4 }} />
              </>
            ) : null}

            {/* Recommended section */}
            {activeRecommended.length > 0 && (
              <>
                <View style={s.secRow}>
                  <Text style={s.secTitle}>Recommended</Text>
                  <Text style={s.secSub}>{activeListing?.title ?? ''}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={rc.row}
                  style={{ marginBottom: 14 }}
                >
                  {activeRecommended.map(row => (
                    <RecommendedCard key={row.topic.id} row={row} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* Saved Decks section */}
            <View style={s.secRow}>
              <Text style={s.secTitle}>Saved Decks</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setModalVisible(true)}>
                <Text style={s.addBtnTxt}>＋</Text>
              </TouchableOpacity>
            </View>
            {decks.length === 0 ? (
              <Text style={[s.empty, { marginBottom: 14 }]}>No decks yet. Tap ＋ to create one.</Text>
            ) : (
              <View style={{ marginBottom: 8 }}>
                {decks.map(deck => (
                  <DeckCard
                    key={deck.id}
                    deck={deck}
                    totalCards={deckCardCount(deck)}
                    onDelete={() => deleteDeck(deck.id)}
                  />
                ))}
              </View>
            )}

            {/* Topics section header */}
            <View style={s.secRow}>
              <Text style={s.secTitle}>All Topics</Text>
            </View>
          </>
        }
      />

      <CreateDeckModal
        visible={modalVisible}
        topicRows={topicRows}
        onClose={() => setModalVisible(false)}
        onCreate={createDeck}
      />
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  subtitle: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2, fontFamily: 'Lexend_400Regular' },
  chipsWrap: { height: 44, marginBottom: 4 },
  chipsScroll: { flex: 1 },
  chipsContent: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 },
  chip: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 980, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { backgroundColor: 'rgba(128,0,0,0.82)', borderColor: 'transparent' },
  chipTxt: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)', fontFamily: 'Lexend_600SemiBold' },
  chipTxtOn: { color: '#fff' },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  secTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  secSub: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', flex: 1, textAlign: 'right', marginLeft: 8 },
  addBtn: { width: 24, height: 24, backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addBtnTxt: { color: '#fff', fontSize: 14, lineHeight: 18, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  topicCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  topicIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topicName: { fontSize: 12, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold', marginBottom: 1 },
  topicSub: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 9, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  deckCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  deckIcon: { width: 36, height: 36, backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deckName: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', marginBottom: 1 },
  deckSub: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  deckChevron: { color: 'rgba(255,255,255,0.38)', fontSize: 18 },
  empty: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 8 },
})

const rc = StyleSheet.create({
  row: { gap: 10, paddingRight: 4 },
  card: { width: 130, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 18, padding: 12 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8 },
  badgeTxt: { fontSize: 9, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  name: { fontSize: 11, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold', marginBottom: 4, lineHeight: 16 },
  sub: { fontSize: 9.5, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
})

const qs = StyleSheet.create({
  card:  { backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.28)', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  card2: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  icon:  { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(128,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  icon2: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: 11, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  sub:   { fontSize: 9, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', marginTop: 1 },
  go:    { fontSize: 18, color: 'rgba(128,0,0,0.80)', marginLeft: 'auto', flexShrink: 0 },
})

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)', maxHeight: '85%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  closeBtn: { color: 'rgba(255,255,255,0.45)', fontSize: 16, padding: 4 },
  label: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontFamily: 'Lexend_600SemiBold' },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, color: '#fff', fontFamily: 'Lexend_400Regular', marginBottom: 14 },
  btn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  btnFlex: { flex: 1 },
  btnDisabled: { opacity: 0.4 },
  btnTxt: { fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  topicList: { maxHeight: 280, marginBottom: 14 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  topicRowOn: { backgroundColor: 'rgba(128,0,0,0.08)', borderRadius: 10, paddingHorizontal: 6 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxOn: { backgroundColor: '#800000', borderColor: '#800000' },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  topicName: { fontSize: 12, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold' },
  topicSub: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  footerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  backBtn: { paddingVertical: 12, paddingHorizontal: 4 },
  backTxt: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: 'Lexend_400Regular' },
})
