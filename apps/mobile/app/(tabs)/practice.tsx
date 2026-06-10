import { useState, useCallback, useMemo, memo, useEffect } from 'react'
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
import { useDb } from '../../hooks/useDb'
import { listPublishedBlueprints, type PublishedBlueprint } from '../../services/examBlueprints'
import { cachedQuery, subscribe } from '../../services/queryCache'
import { orderBlueprintsForUser } from '../../utils/examBuilder'
import { useHomeStats } from '../../hooks/useHomeStats'
import { useSavedDecks, type SavedDeck } from '../../hooks/useSavedDecks'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, typography } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { SplitStatCard } from '../../components/ui/SplitStatCard'
import { ListCard } from '../../components/ui/ListCard'
import { Badge } from '../../components/ui/Badge'
import { AiModelBanner } from '../../components/AiModelBanner'
import { useAnalytics } from '../../hooks/useAnalytics'

// Maps a topic strength to a design-system Badge tone.
const STRENGTH_TONE: Record<Strength, 'accent' | 'neutral' | 'success' | 'warning' | 'danger'> = {
  New: 'accent', Weak: 'danger', Review: 'warning', Strong: 'success',
}

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

// ── Recommended card (2-col grid) ────────────────────────────────────────────

type RcStyles = { card: object; badge: object; badgeTxt: object; name: object; sub: object; grid: object; cardWrap: object }
function RecommendedCard({ row, rc }: { row: TopicRow; rc: RcStyles }) {
  const c = useStrengthColor(row.strength)
  return (
    <Pressable
      style={({ pressed }) => [rc.card, pressed && { opacity: 0.8 }]}
      onPress={() => router.push(`/practice/${row.topic.id}`)}
      accessibilityRole="button"
      // card fills its 48% wrapper — no fixed width here
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

function TopicCard({ row }: { row: TopicRow }) {
  const c = useStrengthColor(row.strength)
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <ListCard
        icon={<Text style={{ color: c.iconColor, fontSize: 15 }}>📖</Text>}
        iconBg={c.iconBg}
        title={row.topic.name}
        subtitle={`${row.cardCount} cards · ${lastPracticedLabel(row.lastPracticedAt)}`}
        trailing={<Badge label={row.strength} tone={STRENGTH_TONE[row.strength]} />}
        onPress={() => router.push(`/practice/${row.topic.id}`)}
      />
    </View>
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
    <View style={{ marginBottom: spacing.sm }}>
      <ListCard
        icon={<Text style={{ fontSize: 16 }}>🗂️</Text>}
        title={deck.name}
        subtitle={`${deck.topicIds.length} topic${deck.topicIds.length !== 1 ? 's' : ''} · ${totalCards} cards`}
        onPress={() => router.push(`/practice/deck/${deck.id}`)}
        onLongPress={handleLongPress}
      />
    </View>
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

function FocusCard({ row, isActive, accuracy, hasMockBlueprint, onPress, onReview, onMock }: {
  row: FocusListing
  isActive: boolean
  accuracy: number | null
  hasMockBlueprint: boolean
  onPress: () => void
  onReview: () => void
  onMock: () => void
}) {
  const { theme: t, typo } = useTheme()
  const fc = useMemo(() => StyleSheet.create({
    card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', boxShadow: t.shadowSm, padding: spacing.md },
    cardActive: { backgroundColor: t.accentSurface, borderColor: '#831626', borderWidth: 2 },
    badge: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs, fontFamily: 'Lexend_600SemiBold' },
    name: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, lineHeight: 16, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm - 2 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs / 2 },
    score: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold', color: t.textTertiary },
    actionsCol: { marginTop: spacing.xs, gap: spacing.xs },
    reviewBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: radius.sm - 4, borderCurve: 'continuous', paddingHorizontal: spacing.sm - 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    reviewBtnTxt: { fontSize: typo.xs, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },
    mockBtn: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: radius.sm - 4, borderCurve: 'continuous', paddingHorizontal: spacing.sm - 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    mockBtnTxt: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
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
      </View>
      {(isActive || hasMockBlueprint) ? (
        <View style={fc.actionsCol}>
          {isActive ? (
            <Pressable
              style={({ pressed }) => [fc.reviewBtn, pressed && { opacity: 0.8 }]}
              onPress={onReview}
              accessibilityRole="button"
              accessibilityLabel="Review"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={fc.reviewBtnTxt} maxFontSizeMultiplier={1.4}>Review</Text>
            </Pressable>
          ) : null}
          {hasMockBlueprint ? (
            <Pressable
              style={({ pressed }) => [fc.mockBtn, pressed && { opacity: 0.8 }]}
              onPress={onMock}
              accessibilityRole="button"
              accessibilityLabel="Mock exam"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={fc.mockBtnTxt} maxFontSizeMultiplier={1.4}>Mock exam</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
      header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
      title: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
      subtitle: { fontSize: typo.sm, color: t.textTertiary, marginTop: spacing.xs, fontFamily: 'Lexend_400Regular' },
      // AI Study Feedback
      aiFeedbackCard: { gap: spacing.xs / 2 },
      aiFeedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
      aiFeedbackIcon: { fontSize: typo.base },
      aiFeedbackTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      aiFeedbackPrompt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold', marginBottom: spacing.xs },
      aiFeedbackItem: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.xs / 2 },
      aiFeedbackEmpty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' },
      // Collapsed row (shared for AI feedback + study tools)
      collapsedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radius.xl,
        borderCurve: 'continuous',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      },
      collapsedIcon: { fontSize: 16, width: 22, textAlign: 'center' },
      collapsedLabel: { flex: 1, fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
      collapsedSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
      collapsedChevron: { fontSize: 18, color: t.textTertiary },
      // Chips
      chipsWrap: { height: 44, marginBottom: spacing.xs },
      chipsScroll: { flex: 1 },
      chipsContent: { paddingHorizontal: spacing.lg, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm - 2 },
      chip: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1 },
      chipOn: { backgroundColor: 'rgba(128,0,0,0.82)', borderColor: 'transparent' },
      chipTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
      chipTxtOn: { color: '#fff' },
      secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
      secTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      secSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flex: 1, textAlign: 'right', marginLeft: spacing.sm },
      addBtn: { width: 28, height: 28, backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
      addBtnTxt: { color: '#fff', fontSize: typo.base, lineHeight: 18, fontWeight: '700' },
      list: { gap: spacing.xl },
      empty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: spacing.sm },
      focusDebug: { paddingBottom: spacing.xs, fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    }),
    rc: StyleSheet.create({
      grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
      cardWrap: { width: '48%' },
      card: { flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', boxShadow: t.shadowSm, padding: spacing.md },
      badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm - 1, paddingVertical: spacing.xs / 2, alignSelf: 'flex-start', marginBottom: spacing.sm },
      badgeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
      name: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', marginBottom: spacing.xs, lineHeight: 16 },
      sub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
      // Mock Exam card base (pressed opacity stays in the function-form style array)
      mockCard: { flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', boxShadow: t.shadowSm, padding: spacing.md },
      mockCardTitle: { fontSize: typo.md, fontWeight: '700', fontFamily: 'Outfit_700Bold', color: t.textPrimary, marginBottom: spacing.xs },
      mockCardName: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.xs },
      mockCardMeta: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    }),
    m: StyleSheet.create({
      overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
      sheet: { backgroundColor: t.bg, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, borderCurve: 'continuous', padding: spacing.xl, paddingBottom: spacing.xxxl, borderTopWidth: 1, borderColor: t.border, maxHeight: '85%' },
      headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
      title: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      closeBtn: { color: t.textTertiary, fontSize: typo.base, padding: spacing.xs },
      label: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm - 2, fontFamily: 'Lexend_600SemiBold' },
      input: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.divider, borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.lg - 2, paddingVertical: spacing.md - 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.lg - 2 },
      btn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: radius.md, borderCurve: 'continuous', minHeight: 48, justifyContent: 'center', paddingVertical: spacing.md, alignItems: 'center' },
      btnFlex: { flex: 1 },
      btnDisabled: { opacity: 0.4 },
      btnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
      topicList: { maxHeight: 280, marginBottom: spacing.lg - 2 },
      topicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs / 2, borderBottomWidth: 1, borderColor: t.surfaceSubtle },
      topicRowOn: { backgroundColor: t.accentSurface, borderRadius: radius.sm, borderCurve: 'continuous', paddingHorizontal: spacing.sm - 2 },
      checkbox: { width: 22, height: 22, borderRadius: radius.sm - 4, borderCurve: 'continuous', borderWidth: 1.5, borderColor: t.textTertiary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      checkboxOn: { backgroundColor: t.accent, borderColor: t.accent },
      checkmark: { color: '#fff', fontSize: typo.xs, fontWeight: '700' },
      topicName: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
      topicSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
      footerRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
      backBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
      backTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    }),
  }
}

export default function PracticeScreen() {
  const { subjects, topicRows, recommendedTopics, selectedSubjectId, setSelectedSubjectId, totalCards, cardCountByTopic, topicIdsByListingSlug, refresh } = usePracticeData()
  const { listing } = useHomeStats()
  const { decks, createDeck, deleteDeck } = useSavedDecks()
  const [modalVisible, setModalVisible] = useState(false)

  // Progressive-disclosure state
  const [aiFeedbackExpanded, setAiFeedbackExpanded] = useState(false)
  const [studyToolsExpanded, setStudyToolsExpanded] = useState(false)

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

  const { s, rc, m } = useMemo(() => makeStyles(t, typo), [t, typo])

  const db = useDb()
  const { focusListings: focusListingsList } = useFocusListings()
  const [activeFocusSlug, setActiveFocusSlug] = useState<string>('')

  // Published blueprints — fetched on mount and re-pulled whenever the cache
  // key is invalidated (e.g. after a sync that fires invalidate('practice:')).
  const [blueprints, setBlueprints] = useState<PublishedBlueprint[]>([])
  useEffect(() => {
    let cancelled = false
    function pull() {
      return cachedQuery('practice:blueprints:list', 30_000, () => listPublishedBlueprints(db)).then(result => {
        if (!cancelled) setBlueprints(result)
      })
    }
    void pull()
    const unsub = subscribe('practice:blueprints:', () => { void pull() })
    return () => { cancelled = true; unsub() }
  }, [db])

  const blueprintSlugSet = useMemo(() => new Set(blueprints.map(b => b.slug)), [blueprints])

  // Per-focus accuracy map — hooks called unconditionally at top level
  const focusSlugs = useMemo(() => focusListingsList.map(f => f.slug), [focusListingsList])
  const focusAccuracyMap = useFocusAnalyticsMap(focusSlugs)

  // Blueprints ordered by focus-first, then displayOrder
  const orderedBlueprints = useMemo(
    () => orderBlueprintsForUser(blueprints, focusSlugs),
    [blueprints, focusSlugs]
  )

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

  // Build collapsed AI feedback summary label
  const aiFeedbackSummary = useMemo(() => {
    if (!weakSubjectsFeedback || weakSubjectsFeedback.length === 0) return 'No data yet'
    return `Weak: ${weakSubjectsFeedback.map(i => i.label).join(', ')}`
  }, [weakSubjectsFeedback])

  return (
    <SafeAreaView style={s.root}>
      {/* (1) Header + stats */}
      <View style={s.header}>
        <Text style={s.title}>Practice</Text>
        <Text style={s.subtitle}>{listing?.title ?? '—'} · {totalCards} cards synced</Text>

        {/* Stats row — split statistics card (design system §3) */}
        <View style={{ marginTop: spacing.md }}>
          <SplitStatCard
            columns={[
              { value: overallAnalytics.avgAccuracy != null ? `${overallAnalytics.avgAccuracy}%` : '—', label: 'Accuracy' },
              { value: `${overallAnalytics.streak} 🔥`, label: 'Streak' },
              { value: String(overallAnalytics.sessionCount), label: 'Exams taken' },
            ]}
          />
        </View>
      </View>

      {/* AI Reviewer Engine — banner + progress + download bottom-sheet */}
      <AiModelBanner />

      {/* (2) Subject filter chips */}
      <View style={s.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsContent}
          style={s.chipsScroll}
        >
          <Pressable onPress={() => setSelectedSubjectId(null)} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <View style={[s.chip, !selectedSubjectId && s.chipOn]}>
              <Text style={[s.chipTxt, !selectedSubjectId && s.chipTxtOn]} maxFontSizeMultiplier={1.4}>All</Text>
            </View>
          </Pressable>
          {/* bounded: a handful of exam subjects (<10), horizontal chip rail — virtualization unwarranted */}
          {/* eslint-disable-next-line react-doctor/rn-no-scrollview-mapped-list */}
          {subjects.map(sub => (
            <Pressable key={sub.id} onPress={() => setSelectedSubjectId(sub.id)} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
              <View style={[s.chip, selectedSubjectId === sub.id && s.chipOn]}>
                <Text style={[s.chipTxt, selectedSubjectId === sub.id && s.chipTxtOn]} maxFontSizeMultiplier={1.4}>{sub.name}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScreenScroll
        tabBarInset
        contentContainerStyle={s.list}
        refreshControl={refreshCtl}
      >
        {/* (3) Recommended 2-col grid — "what next" */}
        {activeRecommended.length > 0 ? (
          <View>
            <View style={s.secRow}>
              <Text style={s.secTitle}>Recommended</Text>
              <Text style={s.secSub}>{activeListing?.title ?? ''}</Text>
            </View>
            <View style={rc.grid}>
              {activeRecommended.slice(0, 4).map(row => (
                <View key={row.topic.id} style={rc.cardWrap}>
                  <RecommendedCard row={row} rc={rc} />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* (4) Subjects accordion — PROMOTED (core list) */}
        <View>
          <SectionHeader title="Subjects" />
          {focusListingsList.length > 0 ? (
            <Text style={s.focusDebug}>
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
              return <TopicCard row={row} />
            }}
          />
        </View>

        {/* (5) Focus 2-col grid */}
        {focusListingsList.length > 0 ? (
          <View>
            <SectionHeader title="My Focus" />
            <View style={rc.grid}>
              {focusListingsList.map(row => (
                <View key={row.slug} style={rc.cardWrap}>
                  <FocusCard
                    row={row}
                    isActive={row.slug === effectiveFocusSlug}
                    accuracy={focusAccuracyMap.get(row.slug) ?? null}
                    hasMockBlueprint={blueprintSlugSet.has(row.slug)}
                    onPress={() => setActiveFocusSlug(row.slug)}
                    onReview={() => router.push(`/practice/listing/${row.slug}?mode=all`)}
                    onMock={() => router.push(`/practice/exam/${row.slug}`)}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* (5b) Mock Exams section */}
        {blueprints.length > 0 ? (
          <View>
            <SectionHeader
              title="Mock Exams"
              actionLabel="See all"
              onAction={() => router.push('/practice/exam')}
            />
            <View style={rc.grid}>
              {orderedBlueprints.slice(0, 4).map(bp => (
                <View key={bp.slug} style={rc.cardWrap}>
                  <Pressable
                    style={({ pressed }) => [rc.mockCard, pressed && { opacity: 0.8 }]}
                    onPress={() => router.push(`/practice/exam/${bp.slug}`)}
                    accessibilityRole="button"
                  >
                    <Text style={rc.mockCardTitle}>
                      {bp.acronym}
                    </Text>
                    <Text numberOfLines={1} style={rc.mockCardName}>
                      {bp.name}
                    </Text>
                    <Text maxFontSizeMultiplier={1.4} style={rc.mockCardMeta}>
                      {bp.totalItems} items · {Math.round(bp.totalTimeMinutes / 60 * 10) / 10}h
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* (6) Saved Decks — ONLY when non-empty; SectionHeader with + always shown for create access */}
        <View>
          <View style={s.secRow}>
            <Text style={s.secTitle}>Saved Decks</Text>
            <Pressable
              style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Create deck"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={s.addBtnTxt}>＋</Text>
            </Pressable>
          </View>
          {decks.length > 0 ? (
            <View>
              {decks.map(deck => (
                <DeckCard
                  key={deck.id}
                  deck={deck}
                  totalCards={deckCardCount(deck)}
                  onDelete={() => deleteDeck(deck.id)}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* (7) AI Study Feedback — COLLAPSED to 2-line summary row, expands inline */}
        <View>
          {aiFeedbackExpanded ? (
            <Card elevated style={s.aiFeedbackCard}>
              <View style={s.aiFeedbackHeader}>
                <Text style={s.aiFeedbackIcon}>📊</Text>
                <Text style={s.aiFeedbackTitle}>AI Study Feedback</Text>
                <Pressable
                  onPress={() => setAiFeedbackExpanded(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Collapse AI Study Feedback"
                  style={{ marginLeft: 'auto' }}
                >
                  <Text style={{ fontSize: 18, color: t.textTertiary }}>‹</Text>
                </Pressable>
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
            </Card>
          ) : (
            <Pressable
              style={({ pressed }) => [s.collapsedRow, pressed && { opacity: 0.8 }]}
              onPress={() => setAiFeedbackExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Expand AI Study Feedback"
              accessibilityState={{ expanded: false }}
              testID="ai-feedback-collapsed"
            >
              <Text style={s.collapsedIcon}>📊</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.collapsedLabel}>AI Study Feedback</Text>
                <Text style={s.collapsedSub} numberOfLines={1}>{aiFeedbackSummary}</Text>
              </View>
              <Text style={s.collapsedChevron}>›</Text>
            </Pressable>
          )}
        </View>

        {/* (8) Study tools — collapsed "Study tools" row expanding inline to 3 links */}
        <View>
          {studyToolsExpanded ? (
            <View>
              <View style={[s.secRow, { marginBottom: spacing.sm }]}>
                <Text style={s.secTitle}>Study Tools</Text>
                <Pressable
                  onPress={() => setStudyToolsExpanded(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Collapse study tools"
                >
                  <Text style={{ fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' }}>Show less ‹</Text>
                </Pressable>
              </View>
              <View style={{ gap: spacing.sm }}>
                <ListCard
                  icon={<Text style={{ fontSize: 15 }}>🎓</Text>}
                  iconBg="rgba(128,0,0,0.18)"
                  title="UPCAT Mock Exam"
                  subtitle="Authored questions · timed mock by subtest"
                  onPress={() => router.push('/practice/upcat')}
                />
                <ListCard
                  icon={<Text style={{ fontSize: 15 }}>🧮</Text>}
                  iconBg="rgba(245,158,11,0.14)"
                  title="GWA Calculator"
                  subtitle="Compute your General Weighted Average · UP scale"
                  onPress={() => router.push('/estimator/gwa')}
                />
                <ListCard
                  icon={<Text style={{ fontSize: 15 }}>🌍</Text>}
                  iconBg="rgba(245,158,11,0.14)"
                  title="Career Paths"
                  subtitle="Where can your course take you? · AI-Safe-Score"
                  onPress={() => router.push('/career')}
                />
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [s.collapsedRow, pressed && { opacity: 0.8 }]}
              onPress={() => setStudyToolsExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Expand Study Tools"
              accessibilityState={{ expanded: false }}
              testID="study-tools-collapsed"
            >
              <Text style={s.collapsedIcon}>🛠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.collapsedLabel}>Study Tools</Text>
                <Text style={s.collapsedSub}>UPCAT Mock · GWA Calculator · Career Paths</Text>
              </View>
              <Text style={s.collapsedChevron}>›</Text>
            </Pressable>
          )}
        </View>

      </ScreenScroll>

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
