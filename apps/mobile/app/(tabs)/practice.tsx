import { useState, useCallback, useMemo, memo } from 'react'
import { groupTopicsBySubject } from '../../utils/groupTopicsBySubject'
import { SubjectAccordion } from '../../components/SubjectAccordion'
import {
  StyleSheet, View, Text, Pressable,
  Modal, TextInput, Alert, ScrollView, FlatList,
  RefreshControl,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { usePracticeData, type Strength, type TopicRow } from '../../hooks/usePracticeData'
import { useFocusListings, type FocusListing } from '../../hooks/useFocusListings'
import { useHomeStats } from '../../hooks/useHomeStats'
import { useSavedDecks, type SavedDeck } from '../../hooks/useSavedDecks'
import { useTheme } from '../../theme/ThemeContext'
import { AiModelBanner } from '../../components/AiModelBanner'
import { useAnalytics } from '../../hooks/useAnalytics'

// ── Strength colours ──────────────────────────────────────────────────────────

const STRENGTH_COLOR_STATIC: Record<Strength, { bg: string; border: string; text: string; iconBg: string; iconColor: string }> = {
  New:    { bg: 'rgba(128,0,0,0.10)',    border: 'rgba(128,0,0,0.25)',    text: '',        iconBg: 'rgba(128,0,0,0.10)',    iconColor: '' },
  Weak:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)',  text: '#f87171', iconBg: 'rgba(239,68,68,0.10)',  iconColor: '#f87171' },
  Review: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)', text: '#fbbf24', iconBg: 'rgba(245,158,11,0.08)', iconColor: '#fbbf24' },
  Strong: { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.22)',  text: '#4ade80', iconBg: 'rgba(34,197,94,0.08)',  iconColor: '#4ade80' },
}

function useStrengthColor(strength: Strength) {
  const { theme: t } = useTheme()
  const base = STRENGTH_COLOR_STATIC[strength]
  if (strength === 'New') {
    return { ...base, text: t.accentText, iconColor: t.accentText }
  }
  return base
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

type RcStyles = { card: object; badge: object; badgeTxt: object; name: object; sub: object; row: object }
function RecommendedCard({ row, rc }: { row: TopicRow; rc: RcStyles }) {
  const c = useStrengthColor(row.strength)
  return (
    <Pressable
      style={({ pressed }) => [rc.card, pressed && { opacity: 0.8 }]}
      onPress={() => router.push(`/practice/${row.topic.id}`)}
      accessibilityRole="button"
    >
      <View style={[rc.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
        <Text style={[rc.badgeTxt, { color: c.text }]}>{row.strength}</Text>
      </View>
      <Text style={rc.name} numberOfLines={2}>{row.topic.name}</Text>
      <Text style={rc.sub}>{row.cardCount} cards</Text>
    </Pressable>
  )
}

// ── Topic card ────────────────────────────────────────────────────────────────

type SStyles = { topicCard: object; topicIcon: object; topicName: object; topicSub: object; badge: object; badgeText: object; deckCard: object; deckIcon: object; deckName: object; deckSub: object; deckChevron: object; root: object; header: object; title: object; subtitle: object; chipsWrap: object; chipsScroll: object; chipsContent: object; chip: object; chipOn: object; chipTxt: object; chipTxtOn: object; secRow: object; secTitle: object; secSub: object; addBtn: object; addBtnTxt: object; list: object; empty: object }
function TopicCard({ row, s }: { row: TopicRow; s: SStyles }) {
  const c = useStrengthColor(row.strength)
  return (
    <Pressable style={({ pressed }) => [s.topicCard, pressed && { opacity: 0.7 }]} onPress={() => router.push(`/practice/${row.topic.id}`)} accessibilityRole="button">
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
    </Pressable>
  )
}

// ── Deck card ─────────────────────────────────────────────────────────────────

function DeckCard({
  deck,
  totalCards,
  onDelete,
  s,
}: {
  deck: SavedDeck
  totalCards: number
  onDelete: () => void
  s: SStyles
}) {
  function handleLongPress() {
    Alert.alert('Delete Deck', `Delete "${deck.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ])
  }

  return (
    <Pressable
      style={({ pressed }) => [s.deckCard, pressed && { opacity: 0.8 }]}
      onPress={() => router.push(`/practice/deck/${deck.id}`)}
      onLongPress={handleLongPress}
      accessibilityRole="button"
    >
      <View style={s.deckIcon}>
        <Text style={{ fontSize: 16 }}>🗂️</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.deckName} numberOfLines={1}>{deck.name}</Text>
        <Text style={s.deckSub}>{deck.topicIds.length} topic{deck.topicIds.length !== 1 ? 's' : ''} · {totalCards} cards</Text>
      </View>
      <Text style={s.deckChevron}>›</Text>
    </Pressable>
  )
}

// ── Create Deck Modal ─────────────────────────────────────────────────────────

type MStyles = { overlay: object; sheet: object; headerRow: object; title: object; closeBtn: object; label: object; input: object; btn: object; btnFlex: object; btnDisabled: object; btnTxt: object; topicList: object; topicRow: object; topicRowOn: object; checkbox: object; checkboxOn: object; checkmark: object; topicName: object; topicSub: object; footerRow: object; backBtn: object; backTxt: object }

// Memoized row for the deck-topic FlatList — keeps renderItem cheap so a row only
// re-renders when its own selected state changes.
const TopicSelectRow = memo(function TopicSelectRow({
  id, name, cardCount, selected, onToggle, m,
}: {
  id: string; name: string; cardCount: number; selected: boolean
  onToggle: (id: string) => void; m: MStyles
}) {
  return (
    <Pressable
      style={({ pressed }) => [m.topicRow, selected && m.topicRowOn, pressed && { opacity: 0.8 }]}
      onPress={() => onToggle(id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      <View style={[m.checkbox, selected && m.checkboxOn]}>
        {selected ? <Text style={m.checkmark}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={m.topicName} numberOfLines={1}>{name}</Text>
        <Text style={m.topicSub}>{cardCount} cards</Text>
      </View>
    </Pressable>
  )
})

function CreateDeckModal({
  visible,
  topicRows,
  onClose,
  onCreate,
  m,
}: {
  visible: boolean
  topicRows: TopicRow[]
  onClose: () => void
  onCreate: (name: string, topicIds: string[]) => Promise<void>
  m: MStyles
}) {
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(''); setSelected(new Set()); setStep(1); setSaving(false)
  }
  function handleClose() { reset(); onClose() }

  const toggleTopic = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const renderTopic = useCallback(({ item: row }: { item: TopicRow }) => (
    <TopicSelectRow
      id={row.topic.id}
      name={row.topic.name}
      cardCount={row.cardCount}
      selected={selected.has(row.topic.id)}
      onToggle={toggleTopic}
      m={m}
    />
  ), [selected, toggleTopic, m])

  async function handleCreate() {
    if (!name.trim() || selected.size === 0) return
    setSaving(true)
    try { await onCreate(name.trim(), Array.from(selected)); reset(); onClose() }
    finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={m.overlay}>
        <KeyboardAvoidingView
          behavior="padding"
          style={{ width: '100%' }}
        >
        <View style={[m.sheet, { paddingBottom: Math.max(32, insets.bottom + 16) }]}>
          <View style={m.headerRow}>
            <Text style={m.title}>New Deck</Text>
            <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => pressed && { opacity: 0.7 }}>
              <Text style={m.closeBtn}>✕</Text>
            </Pressable>
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
              <Pressable
                style={({ pressed }) => [m.btn, !name.trim() && m.btnDisabled, pressed && { opacity: 0.7 }]}
                disabled={!name.trim()}
                onPress={() => setStep(2)}
                accessibilityRole="button"
              >
                <Text style={m.btnTxt}>Next: Pick Topics →</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={m.label}>Select topics  ({selected.size} chosen)</Text>
              <FlatList
                style={m.topicList}
                data={topicRows}
                extraData={selected}
                keyExtractor={(row) => row.topic.id}
                showsVerticalScrollIndicator={false}
                renderItem={renderTopic}
              />
              <View style={m.footerRow}>
                <Pressable style={({ pressed }) => [m.backBtn, pressed && { opacity: 0.7 }]} onPress={() => setStep(1)} accessibilityRole="button">
                  <Text style={m.backTxt}>← Back</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [m.btn, m.btnFlex, (selected.size === 0 || saving) && m.btnDisabled, pressed && { opacity: 0.7 }]}
                  disabled={selected.size === 0 || saving}
                  onPress={handleCreate}
                  accessibilityRole="button"
                >
                  <Text style={m.btnTxt}>{saving ? 'Saving…' : 'Create Deck'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ── Focus card ────────────────────────────────────────────────────────────────

function FocusCard({ row, isActive, accuracy, onPress, onReview }: { row: FocusListing; isActive: boolean; accuracy: number | null; onPress: () => void; onReview: () => void }) {
  const { theme: t, typo } = useTheme()
  const fc = useMemo(() => StyleSheet.create({
    card: { minWidth: 120, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 11, marginRight: 8 },
    cardActive: { backgroundColor: t.accentSurface, borderColor: '#831626', borderWidth: 2 },
    badge: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Lexend_600SemiBold' },
    name: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, lineHeight: 15, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    score: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold', color: t.textTertiary },
    reviewBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    reviewBtnTxt: { fontSize: 10, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },
  }), [t, typo])
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [fc.card, isActive && fc.cardActive, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      <Text style={fc.badge}>#{row.priority} · {row.type === 'exam' ? 'Exam' : 'Scholar'}</Text>
      <Text style={fc.name} numberOfLines={2}>{row.title}</Text>
      <View style={fc.scoreRow}>
        <Text style={fc.score}>{accuracy != null ? `${accuracy}%` : '—'}</Text>
        {isActive && (
          <Pressable style={({ pressed }) => [fc.reviewBtn, pressed && { opacity: 0.8 }]} onPress={onReview} accessibilityRole="button" accessibilityLabel="Review">
            <Text style={fc.reviewBtnTxt}>Review</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  )
}

// ── Per-focus analytics wrapper (calls hook per slug) ─────────────────────────
// React rules require hooks at top level, so we call useAnalytics for up to
// 5 focus slugs and map results by index.

const MAX_FOCUS = 5

function useFocusAnalyticsMap(slugs: string[]): Map<string, number | null> {
  const a0 = useAnalytics(slugs[0] ?? '')
  const a1 = useAnalytics(slugs[1] ?? '')
  const a2 = useAnalytics(slugs[2] ?? '')
  const a3 = useAnalytics(slugs[3] ?? '')
  const a4 = useAnalytics(slugs[4] ?? '')
  const all = [a0, a1, a2, a3, a4]
  const map = new Map<string, number | null>()
  slugs.slice(0, MAX_FOCUS).forEach((slug, i) => {
    map.set(slug, all[i]?.avgAccuracy ?? null)
  })
  return map
}

// ── Main screen ───────────────────────────────────────────────────────────────

// Styles factory (module-level) — keeps PracticeScreen's body small; memoized by
// the screen on (theme, typo).
function makeStyles(
  t: ReturnType<typeof useTheme>['theme'],
  typo: ReturnType<typeof useTheme>['typo'],
) {
  return {
    s: StyleSheet.create({
      root: { flex: 1, backgroundColor: t.bg },
      header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
      title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
      subtitle: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
      statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4 },
      statItem: { flex: 1, alignItems: 'center' },
      statValue: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      statLabel: { fontSize: 10, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 2 },
      statDivider: { width: 1, height: 30, backgroundColor: t.divider },
      aiFeedbackCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 14, marginBottom: 12 },
      aiFeedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
      aiFeedbackIcon: { fontSize: 14 },
      aiFeedbackTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      aiFeedbackPrompt: { fontSize: typo.xs, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold', marginBottom: 4 },
      aiFeedbackItem: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: 2 },
      aiFeedbackEmpty: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' },
      chipsWrap: { height: 44, marginBottom: 4 },
      chipsScroll: { flex: 1 },
      chipsContent: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 },
      chip: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 980, paddingHorizontal: 12, paddingVertical: 5 },
      chipOn: { backgroundColor: 'rgba(128,0,0,0.82)', borderColor: 'transparent' },
      chipTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
      chipTxtOn: { color: '#fff' },
      secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
      secTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      secSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flex: 1, textAlign: 'right', marginLeft: 8 },
      addBtn: { width: 24, height: 24, backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
      addBtnTxt: { color: '#fff', fontSize: 14, lineHeight: 18, fontWeight: '700' },
      list: { paddingHorizontal: 16, paddingBottom: 100 },
      topicCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
      topicIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      topicName: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', marginBottom: 1 },
      topicSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
      badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
      badgeText: { fontSize: typo.xs, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
      deckCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
      deckIcon: { width: 36, height: 36, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      deckName: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 1 },
      deckSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
      deckChevron: { color: t.textTertiary, fontSize: 18 },
      empty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 8 },
    }),
    rc: StyleSheet.create({
      row: { gap: 10, paddingRight: 4 },
      card: { width: 130, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 12 },
      badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8 },
      badgeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
      name: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', marginBottom: 4, lineHeight: 16 },
      sub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    }),
    qs: StyleSheet.create({
      card:  { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.28)', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
      card2: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
      icon:  { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(128,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      icon2: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      title: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      sub:   { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 1 },
      go:    { fontSize: 18, color: 'rgba(128,0,0,0.80)', marginLeft: 'auto', flexShrink: 0 },
    }),
    m: StyleSheet.create({
      overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
      sheet: { backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: t.border, maxHeight: '85%' },
      headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
      title: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      closeBtn: { color: t.textTertiary, fontSize: 16, padding: 4 },
      label: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontFamily: 'Lexend_600SemiBold' },
      input: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.divider, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', marginBottom: 14 },
      btn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
      btnFlex: { flex: 1 },
      btnDisabled: { opacity: 0.4 },
      btnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
      topicList: { maxHeight: 280, marginBottom: 14 },
      topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: t.surfaceSubtle },
      topicRowOn: { backgroundColor: t.accentSurface, borderRadius: 10, paddingHorizontal: 6 },
      checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: t.textTertiary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      checkboxOn: { backgroundColor: t.accent, borderColor: t.accent },
      checkmark: { color: '#fff', fontSize: 11, fontWeight: '700' },
      topicName: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
      topicSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
      footerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
      backBtn: { paddingVertical: 12, paddingHorizontal: 4 },
      backTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    }),
  }
}

// Quick-link shortcut cards (UPCAT mock, GWA calculator, Career Paths). Pure
// presentational — extracted to keep PracticeScreen small.
function PracticeShortcuts({ qs }: { qs: ReturnType<typeof makeStyles>['qs'] }) {
  return (
    <>
      <Pressable
        style={qs.card}
        onPress={() => router.push('/practice/upcat')}
        accessibilityRole="button"
        accessibilityLabel="Open UPCAT mock exam"
      >
        <View style={qs.icon}><Text style={{ fontSize: 15 }}>🎓</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={qs.title}>UPCAT Mock Exam</Text>
          <Text style={qs.sub}>Authored questions · timed mock by subtest</Text>
        </View>
        <Text style={qs.go}>›</Text>
      </Pressable>

      <Pressable
        style={qs.card2}
        onPress={() => router.push('/estimator/gwa')}
        accessibilityRole="button"
        accessibilityLabel="Open GWA Calculator"
      >
        <View style={qs.icon2}><Text style={{ fontSize: 15 }}>🧮</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={qs.title}>GWA Calculator</Text>
          <Text style={qs.sub}>Compute your General Weighted Average · UP scale</Text>
        </View>
        <Text style={qs.go}>›</Text>
      </Pressable>

      <Pressable
        style={qs.card2}
        onPress={() => router.push('/career')}
        accessibilityRole="button"
        accessibilityLabel="Open Career Paths"
      >
        <View style={qs.icon2}><Text style={{ fontSize: 15 }}>🌍</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={qs.title}>Career Paths</Text>
          <Text style={qs.sub}>Where can your course take you? · AI-Safe-Score</Text>
        </View>
        <Text style={qs.go}>›</Text>
      </Pressable>
    </>
  )
}

export default function PracticeScreen() {
  const { subjects, topicRows, recommendedTopics, selectedSubjectId, setSelectedSubjectId, totalCards, cardCountByTopic, topicIdsByListingSlug, refresh } = usePracticeData()
  const { listing } = useHomeStats()
  const { decks, createDeck, deleteDeck } = useSavedDecks()
  const [modalVisible, setModalVisible] = useState(false)

  // Overall analytics (stats header)
  const overallAnalytics = useAnalytics('overall')

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }, [refresh])

  const { theme: t, typo } = useTheme()

  // Stable element for the ScrollView refreshControl prop. RN's refreshControl
  // requires a JSX element (no component/render-prop form), so memoize it to avoid
  // handing the ScrollView a brand-new element on every render.
  const refreshCtl = useMemo(() => (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.accent}
      colors={[t.accent]}
      progressBackgroundColor={t.surface}
    />
  ), [refreshing, onRefresh, t.accent, t.surface])

  const { s, rc, qs, m } = useMemo(() => makeStyles(t, typo), [t, typo])

  const { focusListings: focusListingsList } = useFocusListings()
  const [activeFocusSlug, setActiveFocusSlug] = useState<string>('')

  // Per-focus accuracy map — hooks called unconditionally at top level
  const focusSlugs = useMemo(() => focusListingsList.map(f => f.slug), [focusListingsList])
  const focusAccuracyMap = useFocusAnalyticsMap(focusSlugs)

  // Default to the first focus listing until the user taps another. Derived during
  // render (not via an effect) so there's no extra render or stale-state hop; an
  // explicit user pick wins because the non-empty stored slug short-circuits the ||.
  const effectiveFocusSlug = activeFocusSlug || focusListingsList[0]?.slug || ''

  const activeTopicIds = useMemo(
    () => new Set(topicIdsByListingSlug[effectiveFocusSlug] ?? []),
    [topicIdsByListingSlug, effectiveFocusSlug]
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

  const activeListing = useMemo(  // kept for Recommended section label
    () => focusListingsList.find(r => r.slug === effectiveFocusSlug),
    [focusListingsList, effectiveFocusSlug]
  )

  const deckCardCount = useCallback(
    (deck: SavedDeck) => deck.topicIds.reduce((sum, tid) => sum + (cardCountByTopic[tid] ?? 0), 0),
    [cardCountByTopic]
  )

  const topicRowById = useMemo(
    () => new Map(topicRows.map(r => [r.topic.id, r])),
    [topicRows]
  )

  const subjectGroups = useMemo(() => {
    function avgAccuracy(items: Array<{ accuracy?: number | null }>): number {
      const practiced = items.filter(i => i.accuracy != null) as Array<{ accuracy: number }>
      if (practiced.length === 0) return 0
      return Math.round(practiced.reduce((s, i) => s + i.accuracy, 0) / practiced.length)
    }
    return groupTopicsBySubject(
      {
        topics: topicRows.map(r => ({
          id: r.topic.id,
          name: r.topic.name,
          subjectId: r.topic.subjectId,
          accuracy: r.accuracy,
        })),
        subjects,
        focusListingSlugs: focusListingsList.map(l => l.slug),
        topicIdsByListingSlug,
      },
      (t) => topicRowById.get(t.id)!,
      (rows, raws) => {
        const allNew = raws.every(r => r.accuracy == null)
        return allNew ? `${rows.length} topics · New` : `${rows.length} topics · ${avgAccuracy(raws)}% avg`
      },
      'accuracy-asc',
    )
  }, [topicRows, topicRowById, subjects, focusListingsList, topicIdsByListingSlug])

  // AI feedback: weakest subjects from overall topicMastery (bottom by accuracy)
  const weakSubjectsFeedback = useMemo(() => {
    const { topicMastery } = overallAnalytics
    if (topicMastery.length === 0) return null
    return [...topicMastery]
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
  }, [overallAnalytics])

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Practice</Text>
        <Text style={s.subtitle}>{listing?.title ?? '—'} · {totalCards} cards synced</Text>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statValue}>
              {overallAnalytics.avgAccuracy != null ? `${overallAnalytics.avgAccuracy}%` : '—'}
            </Text>
            <Text style={s.statLabel}>Accuracy</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statValue}>{overallAnalytics.streak > 0 ? `${overallAnalytics.streak}` : '0'} 🔥</Text>
            <Text style={s.statLabel}>Streak</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statValue}>{overallAnalytics.sessionCount}</Text>
            <Text style={s.statLabel}>Exams taken</Text>
          </View>
        </View>
      </View>

      {/* AI Reviewer Engine — banner + progress + download bottom-sheet */}
      <AiModelBanner />

      {/* Subject filter chips */}
      <View style={s.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsContent}
          style={s.chipsScroll}
        >
          <Pressable onPress={() => setSelectedSubjectId(null)} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <View style={[s.chip, !selectedSubjectId && s.chipOn]}>
              <Text style={[s.chipTxt, !selectedSubjectId && s.chipTxtOn]}>All</Text>
            </View>
          </Pressable>
          {/* bounded: a handful of exam subjects (<10), horizontal chip rail — virtualization unwarranted */}
          {/* eslint-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
          {subjects.map(sub => (
            <Pressable key={sub.id} onPress={() => setSelectedSubjectId(sub.id)} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
              <View style={[s.chip, selectedSubjectId === sub.id && s.chipOn]}>
                <Text style={[s.chipTxt, selectedSubjectId === sub.id && s.chipTxtOn]}>{sub.name}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshCtl}
      >
        {/* Quick-link shortcuts */}
        <PracticeShortcuts qs={qs} />

        {/* AI Study Feedback card */}
        <View style={s.aiFeedbackCard}>
          <View style={s.aiFeedbackHeader}>
            <Text style={s.aiFeedbackIcon}>📊</Text>
            <Text style={s.aiFeedbackTitle}>AI Study Feedback</Text>
          </View>
          {weakSubjectsFeedback && weakSubjectsFeedback.length > 0 ? (
            <>
              <Text style={s.aiFeedbackPrompt}>Focus on:</Text>
              {weakSubjectsFeedback.map((item) => (
                <Text key={item.label} style={s.aiFeedbackItem}>
                  · {item.label} ({item.accuracy}%)
                </Text>
              ))}
            </>
          ) : (
            <Text style={s.aiFeedbackEmpty}>
              Take a few quizzes to unlock your personalized study tips.
            </Text>
          )}
        </View>

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
              {/* bounded: user-curated focus list, analytics capped at MAX_FOCUS=5; horizontal rail */}
              {/* eslint-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
              {focusListingsList.map(row => (
                <FocusCard
                  key={row.slug}
                  row={row}
                  isActive={row.slug === effectiveFocusSlug}
                  accuracy={focusAccuracyMap.get(row.slug) ?? null}
                  onPress={() => setActiveFocusSlug(row.slug)}
                  onReview={() => router.push(`/practice/listing/${row.slug}?mode=all`)}
                />
              ))}
            </ScrollView>
          </>
        )}

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
              {/* bounded: activeRecommended is .slice(0,5), max 5 items; horizontal rail */}
              {/* eslint-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
              {activeRecommended.map(row => (
                <RecommendedCard key={row.topic.id} row={row} rc={rc} />
              ))}
            </ScrollView>
          </>
        )}

        {/* Saved Decks section */}
        <View style={s.secRow}>
          <Text style={s.secTitle}>Saved Decks</Text>
          <Pressable style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]} onPress={() => setModalVisible(true)} accessibilityRole="button" accessibilityLabel="Create deck">
            <Text style={s.addBtnTxt}>＋</Text>
          </Pressable>
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
                s={s}
              />
            ))}
          </View>
        )}

        {/* Subjects section with accordion */}
        <View style={s.secRow}>
          <Text style={s.secTitle}>Subjects</Text>
        </View>
        {focusListingsList.length > 0 ? (
          <Text style={{ paddingHorizontal: 16, paddingBottom: 4, fontSize: 12, color: t.textTertiary }}>
            focus: {focusListingsList.map(l => l.slug).join(', ')}
          </Text>
        ) : null}
        <SubjectAccordion
          groups={subjectGroups}
          emptyText="No topics yet — they'll appear here after sync"
          initiallyExpanded="focused"
          keyExtractor={(t) => t.topic.id}
          renderRow={(row) => {
            if (!row) return null  // defensive — shouldn't happen, but no crash if it does
            return <TopicCard row={row} s={s} />
          }}
        />
      </ScrollView>

      <CreateDeckModal
        visible={modalVisible}
        topicRows={topicRows}
        onClose={() => setModalVisible(false)}
        onCreate={createDeck}
        m={m}
      />
    </SafeAreaView>
  )
}

