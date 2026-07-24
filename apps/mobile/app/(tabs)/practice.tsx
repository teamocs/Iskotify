import { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react'
import {
  StyleSheet, View, Text, Pressable,
  Modal, TextInput, Alert, FlatList,
  RefreshControl, Platform,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { router } from 'expo-router'
import { usePracticeData, type Strength, type TopicRow } from '../../hooks/usePracticeData'
import { useFocusListings } from '../../hooks/useFocusListings'
import { useDb } from '../../hooks/useDb'
import { listPublishedBlueprints, type PublishedBlueprint } from '../../services/examBlueprints'
import { cachedQuery, invalidate, subscribe } from '../../services/queryCache'
import {
  getTopicBestSessionPercentages,
  getSubjectSessionPercentages,
  getListingMockBest,
} from '../../services/homeAggregates'
import { orderBlueprintsForUser } from '../../utils/examBuilder'
import { readinessTone } from '../../utils/readinessTone'
import type { ReadinessTone } from '../../utils/readinessTone'
import { subjectsToImprove } from '../../utils/subjectsToImprove'
import { subjectColor } from '../../utils/subjectColors'
import { useSavedDecks, type SavedDeck } from '../../hooks/useSavedDecks'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { InfoBanner } from '../../components/ui/InfoBanner'
import { ListCard } from '../../components/ui/ListCard'
import { LoadingState } from '../../components/ui/LoadingState'
import { WebRefreshButton } from '../../components/ui/WebRefreshButton'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useBreakpoint, gridItemWidth } from '../../hooks/useBreakpoint'
import { useKuyaChatModal } from '../../providers/KuyaChatProvider'
import { useKuyaEnabled } from '../../hooks/useKuyaEnabled'
import { useSyncStatus } from '../../hooks/useSyncStatus'
import { syncOnLaunch } from '../../services/sync'

// ── Strength colours ──────────────────────────────────────────────────────────

// Static borders only (no border tokens exist); surfaces/text are resolved from
// theme tokens in useStrengthColor so greens/reds/ambers stay legible in dark mode.
const STRENGTH_BORDER_STATIC: Record<Strength, string> = {
  New:    'rgba(128,0,0,0.25)',
  Weak:   'rgba(239,68,68,0.22)',
  Review: 'rgba(245,158,11,0.22)',
  Strong: 'rgba(34,197,94,0.22)',
}

function useStrengthColor(strength: Strength) {
  const { theme: t } = useTheme()
  const border = STRENGTH_BORDER_STATIC[strength]
  switch (strength) {
    case 'New':
      return { bg: t.accentSurface, border, text: t.accentText, iconBg: t.accentSurface, iconColor: t.accentText }
    case 'Weak':
      return { bg: t.dangerSurface, border, text: t.danger, iconBg: t.dangerSurface, iconColor: t.danger }
    case 'Review':
      return { bg: t.warningSurface, border, text: t.warning, iconBg: t.warningSurface, iconColor: t.warning }
    case 'Strong':
      return { bg: t.successSurface, border, text: t.success, iconBg: t.successSurface, iconColor: t.success }
  }
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

type MStyles = { overlay: object; sheet: object; headerRow: object; title: object; closeBtn: object; label: object; input: object; btn: object; btnFlex: object; btnDisabled: object; btnTxt: object; topicList: object; topicRow: object; topicRowOn: object; checkbox: object; checkboxOn: object; checkmark: object; topicName: object; topicSub: object; footerRow: object; backBtn: object; backTxt: object; searchBar: object; searchBarTxt: object; resultRow: object; resultType: object; resultName: object; resultEmpty: object }

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
  const { theme: t } = useTheme()
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
                placeholderTextColor={t.textTertiary}
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

// ── Search Modal (subjects · topics · mock exams) ─────────────────────────────

type SearchResult = { key: string; type: string; name: string; onPress: () => void }

function SearchModal({
  visible,
  subjects,
  topicRows,
  blueprints,
  onClose,
  m,
}: {
  visible: boolean
  subjects: Array<{ id: string; name: string }>
  topicRows: TopicRow[]
  blueprints: PublishedBlueprint[]
  onClose: () => void
  m: MStyles
}) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')

  function handleClose() { setQuery(''); onClose() }

  // Flatten all searchable entries once per data change.
  const allEntries = useMemo<SearchResult[]>(() => {
    const entries: SearchResult[] = []
    for (const s of subjects) {
      entries.push({ key: `subject:${s.id}`, type: 'Subject', name: s.name, onPress: () => router.push(`/subjects/${s.id}`) })
    }
    for (const row of topicRows) {
      entries.push({ key: `topic:${row.topic.id}`, type: 'Topic', name: row.topic.name, onPress: () => router.push(`/practice/${row.topic.id}`) })
    }
    for (const bp of blueprints) {
      entries.push({ key: `mock:${bp.slug}`, type: 'Mock exam', name: `${bp.acronym} · ${bp.name}`, onPress: () => router.push(`/practice/exam/${bp.slug}`) })
    }
    return entries
  }, [subjects, topicRows, blueprints])

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return []
    return allEntries.filter(e => e.name.toLowerCase().includes(q)).slice(0, 30)
  }, [query, allEntries])

  const handleResultPress = useCallback((result: SearchResult) => {
    setQuery('')
    onClose()
    result.onPress()
  }, [onClose])

  const renderResult = useCallback(({ item }: { item: SearchResult }) => (
    <Pressable
      style={({ pressed }) => [m.resultRow, pressed && { opacity: 0.7 }]}
      onPress={() => handleResultPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.type}: ${item.name}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={m.resultName} numberOfLines={1} maxFontSizeMultiplier={1.4}>{item.name}</Text>
        <Text style={m.resultType} maxFontSizeMultiplier={1.4}>{item.type}</Text>
      </View>
    </Pressable>
  ), [m, handleResultPress])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={m.overlay}>
        <Pressable
          style={{ flex: 1 }}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close search"
        />
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
          <View style={[m.sheet, { paddingBottom: Math.max(32, insets.bottom + 16) }]}>
            <View style={m.headerRow}>
              <Text style={m.title}>Search</Text>
              <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => pressed && { opacity: 0.7 }}>
                <Text style={m.closeBtn}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              style={m.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search subjects, topics, or mock exams"
              placeholderTextColor={t.textTertiary}
              autoFocus
              returnKeyType="search"
              autoCorrect={false}
            />
            {query.trim() === '' ? (
              <Text style={m.resultEmpty} maxFontSizeMultiplier={1.4}>
                Type to search your subjects, topics, and mock exams
              </Text>
            ) : results.length > 0 ? (
              <FlatList
                style={m.topicList}
                data={results}
                keyExtractor={(item) => item.key}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={renderResult}
              />
            ) : (
              <Text style={m.resultEmpty} maxFontSizeMultiplier={1.4}>
                No matches found
              </Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

// Styles factory (module-level) — keeps PracticeScreen's body small; memoized by
// the screen on (theme, typo, breakpoint).
function makeStyles(
  t: ReturnType<typeof useTheme>['theme'],
  typo: ReturnType<typeof useTheme>['typo'],
  bp: import('../../hooks/useBreakpoint').Breakpoint,
) {
  return {
    s: StyleSheet.create({
      root: { flex: 1, backgroundColor: t.bg },
      header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
      title: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
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
      secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
      secTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      secSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flex: 1, textAlign: 'right', marginLeft: spacing.sm },
      addBtn: { width: 28, height: 28, backgroundColor: t.accentStrong, borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
      addBtnTxt: { color: t.textInverse, fontSize: typo.base, lineHeight: 18, fontWeight: '700' },
      list: { gap: spacing.xl },
      empty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: spacing.sm },
      // Search bar (opens the search modal)
      searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      },
      searchBarTxt: { flex: 1, fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    }),
    rc: StyleSheet.create({
      grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
      cardWrap: { width: gridItemWidth(bp) },
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
    // Readiness card (subject readiness + My Focus) — horizontal progress fill
    // clipped to the rounded corners, content above via zIndex.
    rd: StyleSheet.create({
      card: {
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        boxShadow: t.shadowSm,
        padding: spacing.md,
        minHeight: 84,
        justifyContent: 'space-between',
      },
      fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
      content: { position: 'relative', zIndex: 1, flex: 1, justifyContent: 'space-between' },
      topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2 },
      dot: { width: 10, height: 10, borderRadius: 5 },
      badge: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Lexend_600SemiBold' },
      name: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, lineHeight: 17, fontFamily: 'Outfit_700Bold', marginTop: spacing.xs / 2 },
      pct: { fontSize: typo.lg, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -0.3, marginTop: spacing.xs / 2 },
      // dashed ghost "+ Add" card spanning the grid item width
      addCard: {
        minHeight: 84,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: t.border,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        padding: spacing.md,
      },
      addTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold', textAlign: 'center' },
    }),
    m: StyleSheet.create({
      overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
      sheet: { backgroundColor: t.bg, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, borderCurve: 'continuous', padding: spacing.xl, paddingBottom: spacing.xxxl, borderTopWidth: 1, borderColor: t.border, maxHeight: '85%' },
      headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
      title: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
      closeBtn: { color: t.textTertiary, fontSize: typo.base, padding: spacing.xs },
      label: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm - 2, fontFamily: 'Lexend_600SemiBold' },
      input: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.divider, borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.lg - 2, paddingVertical: spacing.md - 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', marginBottom: spacing.lg - 2 },
      btn: { backgroundColor: t.accentStrong, borderRadius: radius.md, borderCurve: 'continuous', minHeight: 48, justifyContent: 'center', paddingVertical: spacing.md, alignItems: 'center' },
      btnFlex: { flex: 1 },
      btnDisabled: { opacity: 0.4 },
      btnTxt: { fontSize: typo.md, fontWeight: '700', color: t.textInverse, fontFamily: 'Outfit_700Bold' },
      topicList: { maxHeight: 320, marginBottom: spacing.lg - 2 },
      topicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs / 2, borderBottomWidth: 1, borderColor: t.surfaceSubtle },
      topicRowOn: { backgroundColor: t.accentSurface, borderRadius: radius.sm, borderCurve: 'continuous', paddingHorizontal: spacing.sm - 2 },
      checkbox: { width: 22, height: 22, borderRadius: radius.sm - 4, borderCurve: 'continuous', borderWidth: 1.5, borderColor: t.textTertiary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      checkboxOn: { backgroundColor: t.accent, borderColor: t.accent },
      checkmark: { color: t.textInverse, fontSize: typo.xs, fontWeight: '700' },
      topicName: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
      topicSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
      footerRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
      backBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
      backTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
      // Search result row
      searchBar: {},
      searchBarTxt: {},
      resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs / 2, borderBottomWidth: 1, borderColor: t.surfaceSubtle, minHeight: 48 },
      resultName: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
      resultType: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 2 },
      resultEmpty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', paddingVertical: spacing.xl },
    }),
  }
}

export default function PracticeScreen() {
  const { subjects, topicRows, cardCountByTopic, topicIdsByListingSlug, refresh, loaded } = usePracticeData()
  const { decks, createDeck, deleteDeck } = useSavedDecks()
  const [modalVisible, setModalVisible] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)

  // Progressive-disclosure state
  const [aiFeedbackExpanded, setAiFeedbackExpanded] = useState(false)
  const [studyToolsExpanded, setStudyToolsExpanded] = useState(false)

  // Overall analytics — still feeds AI Study Feedback (weakest subjects).
  const overallAnalytics = useAnalytics('overall')

  const db = useDb()

  // ── Sync / loading (web-only) ─────────────────────────────────────────────
  const sync = useSyncStatus()
  // `loaded` comes from usePracticeData — true once its load has run at least
  // once (success or error), so we can tell an as-yet-unloaded screen from a
  // genuinely-empty one. (Watching subjects.length can't: it starts [].)
  const showLoading = Platform.OS === 'web' && (!loaded || (sync.isSyncing && !sync.firstSyncDone))

  // ── Readiness maps (SESSION-based, mirrors Home) ─────────────────────────────
  // Bumped by onRefresh (after invalidating the cache) to force fresh re-fetches.
  const [reloadKey, setReloadKey] = useState(0)

  // Subject readiness: per-topic review bests + subject-level mock bests.
  const [sessionReadiness, setSessionReadiness] = useState<{
    perTopicBest: Map<string, number>
    subjectBest: Map<string, number>
  }>(() => ({ perTopicBest: new Map(), subjectBest: new Map() }))
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [topicBest, subjectBest] = await cachedQuery(
          'practice:sessionReadiness',
          30_000,
          () => Promise.all([
            getTopicBestSessionPercentages(db),
            getSubjectSessionPercentages(db),
          ]),
        )
        if (!cancelled) {
          setSessionReadiness({
            perTopicBest: new Map(topicBest.map(r => [r.topicId, r.bestPct])),
            subjectBest: new Map(subjectBest.map(r => [r.subject, r.bestPct])),
          })
        }
      } catch (e) {
        console.warn('[practice/sessionReadiness] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [db, reloadKey])

  // My Focus readiness: per-listing best overall MOCK-exam attempt %.
  const [mockBestBySlug, setMockBestBySlug] = useState<Map<string, number>>(() => new Map())
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await cachedQuery('practice:mockReadiness', 30_000, () => getListingMockBest(db))
        if (!cancelled) {
          setMockBestBySlug(new Map(rows.map(r => [r.listingSlug, r.bestPct])))
        }
      } catch (e) {
        console.warn('[practice/mockReadiness] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [db, reloadKey])

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    // Drop the cached readiness maps and re-trigger their effects for fresh data.
    invalidate('practice:sessionReadiness')
    invalidate('practice:mockReadiness')
    setReloadKey(k => k + 1)
    try { await refresh() } finally { setRefreshing(false) }
  }, [refresh])

  // Web-only refresh: full sync then invalidate + re-load, separate from the
  // native pull-to-refresh onRefresh which does NOT call syncOnLaunch.
  const webRefresh = useCallback(async () => {
    if (refreshing || sync.isSyncing) return
    setRefreshing(true)
    try {
      await syncOnLaunch(db)
      invalidate('practice:sessionReadiness')
      invalidate('practice:mockReadiness')
      setReloadKey(k => k + 1)
      await refresh()
    } catch (e) {
      console.warn('[practice] webRefresh error:', e)
    } finally {
      setRefreshing(false)
    }
  }, [db, refresh, refreshing, sync.isSyncing])

  const { open: openKuya } = useKuyaChatModal()
  const { enabled: kuyaEnabled } = useKuyaEnabled()

  const { theme: t, typo } = useTheme()
  // Web-only adaptive grids: native tablets (iPad etc.) keep the phone 2-col
  // layout — the native app's rendering must not change with viewport width.
  const bpRaw = useBreakpoint()
  const bp = Platform.OS === 'web' ? bpRaw : 'sm'

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

  const { s, rc, rd, m } = useMemo(() => makeStyles(t, typo, bp), [t, typo, bp])

  const { focusListings: focusListingsList } = useFocusListings()

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

  // Focus slugs drive the blueprint ordering (focus-first).
  const focusSlugs = useMemo(() => focusListingsList.map(f => f.slug), [focusListingsList])

  // Blueprints ordered by focus-first, then displayOrder
  const orderedBlueprints = useMemo(
    () => orderBlueprintsForUser(blueprints, focusSlugs),
    [blueprints, focusSlugs]
  )

  // Recommended is driven by the FIRST focus listing (cards no longer set an
  // active slug — they navigate to the new chooser instead).
  const effectiveFocusSlug = focusListingsList[0]?.slug || ''

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

  // Per-subject readiness (lowest first) for the Subject readiness grid —
  // SESSION-based, consistent with Home + Subject Details.
  const subjectReadiness = useMemo(
    () => subjectsToImprove(topicRows, subjects, sessionReadiness.perTopicBest, sessionReadiness.subjectBest),
    [topicRows, subjects, sessionReadiness],
  )

  // Readiness tone → token mapping for the progress bars (mirrors Home).
  // fill = subtle surface tint (text stays ≥4.5:1 over it); pct = solid level color.
  // 'none' (not practiced): no fill, em-dash in tertiary text.
  const toneTokens = useCallback((tone: ReadinessTone): { fill: string | null; pct: string } => {
    switch (tone) {
      case 'strong': return { fill: t.successSurface, pct: t.success }
      case 'fair':   return { fill: t.warningSurface, pct: t.warning }
      case 'weak':   return { fill: t.dangerSurface,  pct: t.danger }
      default:       return { fill: null,             pct: t.textTertiary }
    }
  }, [t])

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
      <WebTopSpacer />
      {/* (1) Header */}
      <View style={[s.header, { flexDirection: 'row', alignItems: 'center' }]}>
        <Text style={[s.title, { flex: 1 }]}>Exams</Text>
        <WebRefreshButton onRefresh={webRefresh} refreshing={refreshing} />
      </View>

      <ScreenScroll
        tabBarInset
        contentContainerStyle={s.list}
        refreshControl={refreshCtl}
      >
        {/* (2) Search — full-width bar opening the search modal (top, under header) */}
        <View>
          <Pressable
            style={({ pressed }) => [s.searchBar, pressed && { opacity: 0.8 }]}
            onPress={() => setSearchVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Search subjects, topics, or mock exams"
          >
            <Text maxFontSizeMultiplier={1.4}>🔍</Text>
            <Text style={s.searchBarTxt} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              Search subjects, topics, or mock exams
            </Text>
          </Pressable>
        </View>

        {/* (3) AI Study Feedback — COLLAPSED to 2-line summary row, expands inline */}
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

        {/* (4) Subject readiness — per-subject readiness grid (lowest first) */}
        <View>
          <SectionHeader
            title="Subject readiness"
            subtitle="Tap a subject to see your topic readiness"
          />
          {subjectReadiness.length > 0 ? (
            <View style={rc.grid}>
              {subjectReadiness.map(subject => {
                const tone = readinessTone(subject.pct)
                const { fill, pct: pctColor } = toneTokens(tone)
                const fillPct = Math.max(0, Math.min(100, subject.pct))
                return (
                  <View key={subject.id} style={rc.cardWrap}>
                    <Pressable
                      style={({ pressed }) => [rd.card, pressed && { opacity: 0.8 }]}
                      onPress={() => router.push(`/subjects/${subject.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={subject.name}
                    >
                      {fill != null ? (
                        <View style={[rd.fill, { width: `${fillPct}%`, backgroundColor: fill }]} />
                      ) : null}
                      <View style={rd.content}>
                        <View style={rd.topRow}>
                          <View style={[rd.dot, { backgroundColor: subjectColor(subject.id).accent }]} />
                          <Text style={rd.name} numberOfLines={2} maxFontSizeMultiplier={1.4}>{subject.name}</Text>
                        </View>
                        <Text style={[rd.pct, { color: pctColor }]} maxFontSizeMultiplier={1.4}>{subject.pct}%</Text>
                      </View>
                    </Pressable>
                  </View>
                )
              })}
            </View>
          ) : showLoading ? (
            <LoadingState label="Loading…" />
          ) : (
            <Text style={s.empty} maxFontSizeMultiplier={1.4}>
              Practice to see your subject readiness here
            </Text>
          )}
        </View>

        {/* (5) My Focus — per-target mock-exam readiness grid */}
        <View>
          <SectionHeader title="My Focus" subtitle="Your mock-exam readiness per target" />
          {focusListingsList.length > 0 ? (
            <View style={rc.grid}>
              {focusListingsList.map(row => {
                const best = mockBestBySlug.get(row.slug) ?? null
                const tone = readinessTone(best)
                const { fill, pct: pctColor } = toneTokens(tone)
                const fillPct = best != null ? Math.max(0, Math.min(100, best)) : 0
                const pctLabel = best != null ? `${best}%` : '—'
                return (
                  <View key={row.slug} style={rc.cardWrap}>
                    <Pressable
                      style={({ pressed }) => [rd.card, pressed && { opacity: 0.8 }]}
                      onPress={() => router.push(`/practice/start/${row.slug}`)}
                      accessibilityRole="button"
                      accessibilityLabel={row.title}
                    >
                      {fill != null ? (
                        <View style={[rd.fill, { width: `${fillPct}%`, backgroundColor: fill }]} />
                      ) : null}
                      <View style={rd.content}>
                        <View style={rd.topRow}>
                          <Text style={rd.badge} maxFontSizeMultiplier={1.4}>
                            #{row.priority} · {row.type === 'exam' ? 'Exam' : 'Scholar'}
                          </Text>
                        </View>
                        <Text style={rd.name} numberOfLines={2} maxFontSizeMultiplier={1.4}>{row.title}</Text>
                        <Text style={[rd.pct, { color: pctColor }]} maxFontSizeMultiplier={1.4}>{pctLabel}</Text>
                      </View>
                    </Pressable>
                  </View>
                )
              })}
              {/* Add-more-targets ghost card — additive action distinct from focus cards */}
              <View style={rc.cardWrap}>
                <Pressable
                  style={({ pressed }) => [rd.addCard, pressed && { opacity: 0.7 }]}
                  onPress={() => router.push('/(tabs)/listings')}
                  accessibilityRole="button"
                  accessibilityLabel="Add exam or scholarship"
                >
                  <Text style={rd.addTxt} maxFontSizeMultiplier={1.4}>＋ Add exam or scholarship</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <InfoBanner
              icon={<Text style={{ fontSize: 16 }}>🎯</Text>}
              message="Add an exam or scholarship from the Lists tab"
              actionLabel="Lists"
              onAction={() => router.push('/(tabs)/listings')}
              tone="neutral"
            />
          )}
        </View>

        {/* (6) Recommended 2-col grid — "what next" */}
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

        {/* (7) Mock Exams section */}
        {blueprints.length > 0 ? (
          <View>
            <SectionHeader
              title="Mock Exams"
              actionLabel="See all"
              onAction={() => router.push('/practice/exam')}
            />
            <View style={rc.grid}>
              {orderedBlueprints.slice(0, 4).map(blueprint => (
                <View key={blueprint.slug} style={rc.cardWrap}>
                  <Pressable
                    style={({ pressed }) => [rc.mockCard, pressed && { opacity: 0.8 }]}
                    onPress={() => router.push(`/practice/exam/${blueprint.slug}`)}
                    accessibilityRole="button"
                  >
                    <Text style={rc.mockCardTitle}>
                      {blueprint.acronym}
                    </Text>
                    <Text numberOfLines={1} style={rc.mockCardName}>
                      {blueprint.name}
                    </Text>
                    <Text maxFontSizeMultiplier={1.4} style={rc.mockCardMeta}>
                      {blueprint.totalItems} items · {Math.round(blueprint.totalTimeMinutes / 60 * 10) / 10}h
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* (8) Saved Decks — ONLY when non-empty; SectionHeader with + always shown for create access */}
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

        {/* (9) Study tools — collapsed "Study tools" row expanding inline to links */}
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
                  icon={<Text style={{ fontSize: 15 }}>✅</Text>}
                  iconBg="rgba(34,197,94,0.14)"
                  title="Requirements"
                  subtitle="Track requirements for your focus exams & scholarships"
                  onPress={() => router.push('/requirements')}
                />
                <ListCard
                  icon={<Text style={{ fontSize: 15 }}>📝</Text>}
                  iconBg="rgba(128,0,0,0.18)"
                  title="Notes"
                  subtitle="Your study notes & reminders"
                  onPress={() => router.push('/notes')}
                />
                {kuyaEnabled && (
                  <ListCard
                    icon={<Text style={{ fontSize: 15 }}>💬</Text>}
                    iconBg="rgba(34,197,94,0.14)"
                    title="AI Chat"
                    subtitle="Ask Kuya Baw anything about exams & courses"
                    onPress={() => { void openKuya() }}
                  />
                )}
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
                <Text style={s.collapsedSub}>{kuyaEnabled ? 'Requirements · Notes · AI Chat' : 'Requirements · Notes'}</Text>
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

      <SearchModal
        visible={searchVisible}
        subjects={subjects}
        topicRows={topicRows}
        blueprints={blueprints}
        onClose={() => setSearchVisible(false)}
        m={m}
      />
    </SafeAreaView>
  )
}
