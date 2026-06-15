import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import {
  StyleSheet, View, Text, Pressable, ActivityIndicator, FlatList,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq, and } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { subjects as subjectsTable, topics as topicsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, type Theme, type Typography } from '../../theme/tokens'
import { cachedQuery } from '../../services/queryCache'
import { getTopicBestSessionPercentages } from '../../services/homeAggregates'
import { readinessTone, type ReadinessTone } from '../../utils/readinessTone'
import { subjectColor } from '../../utils/subjectColors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopicRow {
  id: string
  name: string
  // Highest attained result % across this topic's review sessions, or null when
  // the topic has never been practiced (no qualifying session).
  bestPct: number | null
}

interface SubjectData {
  subjectName: string
  rows: TopicRow[]
}

// Cached for 5 min so re-opening the same subject is instant (no re-query/re-sort).
const SUBJECT_TTL = 300_000

// ---------------------------------------------------------------------------
// Sort: lowest readiness first (needs the most work), topics with no session
// last, alphabetical tiebreak within each band.
// ---------------------------------------------------------------------------

function byReadiness(a: TopicRow, b: TopicRow): number {
  const an = a.bestPct == null
  const bn = b.bestPct == null
  if (an !== bn) return an ? 1 : -1            // null (no session) sinks to the bottom
  if (!an && !bn && a.bestPct !== b.bestPct) {
    return (a.bestPct as number) - (b.bestPct as number) // ascending: lowest first
  }
  return a.name.localeCompare(b.name)          // alpha tiebreak
}

type Styles = ReturnType<typeof makeStyles>

function makeStyles(t: Theme, typo: Typography) {
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: t.bg },
    // Thin accent bar in the subject's identity color, just under the top bar.
    accentBar:   { height: 3, width: '100%' },
    topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
    backArrow:   { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    accentDot:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    topTitle:    { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    subHint:     { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
    // Topic card — the card itself is a horizontal readiness progress bar.
    // overflow:hidden clips the absolute fill to the rounded corners.
    topicCard: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    topicCardPressed: { opacity: 0.75 },
    // Absolute readiness fill (subtle surface tint) layered UNDER the content.
    topicFill:   { position: 'absolute', left: 0, top: 0, bottom: 0 },
    // Content row sits above the fill (zIndex) — name left, % right end.
    topicRow:    { position: 'relative', zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    topicTextCol:{ flex: 1 },
    topicName:   { fontSize: typo.base, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    topicMeta:   { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: spacing.xs / 2 },
    topicPct:    { fontSize: typo.lg, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -0.3 },
    empty:       { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: spacing.xl, fontStyle: 'italic' },
  })
}

// ---------------------------------------------------------------------------
// Readiness tone → token mapping (mirrors the Home "My Focus" bars).
// fill = subtle surface tint (text stays readable over it in both themes);
// pct  = solid level color (bold). 'none' (no session): no fill, em-dash tertiary.
// ---------------------------------------------------------------------------

function toneTokens(t: Theme, tone: ReadinessTone): { fill: string | null; pct: string } {
  switch (tone) {
    case 'strong': return { fill: t.successSurface, pct: t.success }
    case 'fair':   return { fill: t.warningSurface, pct: t.warning }
    case 'weak':   return { fill: t.dangerSurface,  pct: t.danger }
    default:       return { fill: null,             pct: t.textTertiary }
  }
}

// ---------------------------------------------------------------------------
// Memoized list item — each topic row is its own progress bar.
// ---------------------------------------------------------------------------

const TopicProgressRow = memo(function TopicProgressRow({
  row, s, t,
}: { row: TopicRow; s: Styles; t: Theme }) {
  const tone = readinessTone(row.bestPct)
  const { fill, pct: pctColor } = toneTokens(t, tone)
  // Clamp the fill width to 0–100 of the card.
  const fillPct = row.bestPct != null ? Math.max(0, Math.min(100, row.bestPct)) : 0
  const pctLabel = row.bestPct != null ? `${row.bestPct}%` : '—'

  return (
    <Pressable
      style={({ pressed }) => [s.topicCard, pressed && s.topicCardPressed]}
      onPress={() => router.push(`/practice/${row.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, readiness ${pctLabel}`}
    >
      {/* Readiness fill — absolute, under the content, clipped by overflow:hidden */}
      {fill != null ? (
        <View style={[s.topicFill, { width: `${fillPct}%`, backgroundColor: fill }]} />
      ) : null}
      <View style={s.topicRow}>
        <View style={s.topicTextCol}>
          <Text testID="topic-name" style={s.topicName} numberOfLines={2} maxFontSizeMultiplier={1.4}>
            {row.name}
          </Text>
          {row.bestPct == null ? (
            <Text style={s.topicMeta} numberOfLines={1} maxFontSizeMultiplier={1.4}>No sessions yet</Text>
          ) : null}
        </View>
        <Text style={[s.topicPct, { color: pctColor }]} maxFontSizeMultiplier={1.4}>{pctLabel}</Text>
      </View>
    </Pressable>
  )
})

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SubjectDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const insets = useSafeAreaInsets()

  const [data, setData] = useState<SubjectData | null>(null)
  const [loading, setLoading] = useState(true)

  // Guard: if navigated to without an id, return home so the user lands on a real
  // screen rather than an empty topic list. useEffect keeps all hooks unconditional.
  useEffect(() => {
    if (!id) router.replace('/(tabs)')
  }, [id])

  useEffect(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    void (async () => {
      const result = await cachedQuery<SubjectData>(`subject:topics:${id}`, SUBJECT_TTL, async () => {
        const [subjectRows, topicRows] = await Promise.all([
          db.select({ id: subjectsTable.id, name: subjectsTable.name })
            .from(subjectsTable).where(eq(subjectsTable.id, id)).limit(1),
          db.select({ id: topicsTable.id, name: topicsTable.name })
            .from(topicsTable)
            .where(and(eq(topicsTable.subjectId, id), eq(topicsTable.status, 'published'))),
        ])

        // Per-topic best result %, keyed for O(1) lookup while composing rows.
        const bestRows = await getTopicBestSessionPercentages(db)
        const bestMap = new Map(bestRows.map(r => [r.topicId, r.bestPct]))

        const subjectName = (subjectRows[0]?.name as string | undefined) ?? 'Subject'
        const rows: TopicRow[] = (topicRows as Array<{ id: string; name: string }>).map(tp => ({
          id: tp.id,
          name: tp.name,
          bestPct: bestMap.has(tp.id) ? (bestMap.get(tp.id) as number) : null,
        }))
        rows.sort(byReadiness)

        return { subjectName, rows }
      })
      if (!alive) return
      setData(result)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [db, id])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])
  const accent = useMemo(() => subjectColor(id ?? '').accent, [id])

  const rows = data?.rows ?? []
  const subjectName = data?.subjectName ?? 'Subject'

  const renderItem = useCallback(
    ({ item }: { item: TopicRow }) => <TopicProgressRow row={item} s={s} t={t} />,
    [s, t],
  )
  const keyExtractor = useCallback((item: TopicRow) => item.id, [])

  // ── No-id (redirecting) ──────────────────────────────────────────────────
  if (!id) return null

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
        </View>
        <View style={[s.accentBar, { backgroundColor: accent }]} />
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <View style={[s.accentDot, { backgroundColor: accent }]} />
        <Text style={s.topTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>{subjectName}</Text>
      </View>
      <View style={[s.accentBar, { backgroundColor: accent }]} />

      <FlatList
        testID="topics-list"
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={
          <Text style={s.subHint} maxFontSizeMultiplier={1.4}>
            Your readiness per topic — tap to review. Lowest first.
          </Text>
        }
        ListEmptyComponent={
          <Text style={s.empty}>No topics in this subject yet.</Text>
        }
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={11}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
      />
    </SafeAreaView>
  )
}
