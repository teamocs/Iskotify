import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { View, Text, Pressable, FlatList } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { eq, and } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { subjects as subjectsTable, topics as topicsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined, Books2Outlined } from '@lineiconshq/free-icons'
import { Screen } from '../../components/ui/Screen'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { decorative, focusRing, type WebPressableState } from '../../components/ui/a11y'
import { spacing, radius, textStyle } from '../../theme/tokens'
import { cachedQuery, invalidate } from '../../services/queryCache'
import { getTopicBestSessionPercentages, getSubjectSessionPercentages } from '../../services/homeAggregates'
import { topicReadiness } from '../../utils/subjectReadiness'
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

// ---------------------------------------------------------------------------
// Topic row — name, a neutral readiness bar, and the number. Readiness is one
// ink at every score (redesign M2): a red/green percent reads as a verdict.
// ---------------------------------------------------------------------------

const TopicProgressRow = memo(function TopicProgressRow({ row }: { row: TopicRow }) {
  const { theme: t } = useTheme()
  const pctLabel = row.bestPct != null ? `${row.bestPct}%` : '—'

  return (
    <Pressable
      onPress={() => router.push(`/practice/${row.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${row.bestPct != null ? `readiness ${pctLabel}` : 'no sessions yet'}`}
      accessibilityHint="Opens practice for this topic"
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          {
            minHeight: 64, gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            backgroundColor: pressed ? t.surface2 : t.surface,
            borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous',
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text testID="topic-name" style={textStyle('titleSm', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={1.8}>
            {row.name}
          </Text>
          {row.bestPct == null ? (
            <Text style={textStyle('caption', t.textSecondary)} numberOfLines={1} maxFontSizeMultiplier={1.8}>No sessions yet</Text>
          ) : null}
        </View>
        <Text style={[textStyle('numeric', row.bestPct == null ? t.textSecondary : t.textPrimary)]} maxFontSizeMultiplier={1.4}>
          {pctLabel}
        </Text>
        <View {...decorative} style={{ transform: [{ scaleX: -1 }] }}>
          <Lineicons icon={ChevronLeftOutlined} size={16} color={t.textTertiary} />
        </View>
      </View>
      {row.bestPct != null ? <ProgressBar value={row.bestPct / 100} label={`${row.name} readiness`} height={4} /> : null}
    </Pressable>
  )
})

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: SubjectData }

export default function SubjectDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const db = useDb()
  const { theme: t } = useTheme()
  const [state, setState] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // Guard: if navigated to without an id, return home so the user lands on a real
  // screen rather than an empty topic list. useEffect keeps all hooks unconditional.
  useEffect(() => {
    if (!id) router.replace('/(tabs)')
  }, [id])

  useEffect(() => {
    if (!id) return
    let alive = true
    setState({ status: 'loading' })
    void (async () => {
      try {
        const result = await cachedQuery<SubjectData>(`subject:topics:${id}`, SUBJECT_TTL, async () => {
          // Per-topic review bests + subject-level mock bests both feed readiness,
          // so a subject practiced only via a mock (subtest == subject name) still
          // shows its readiness on every topic. All fetched together (independent).
          const [subjectRows, topicRows, topicBestRows, subjectBestRows] = await Promise.all([
            db.select({ id: subjectsTable.id, name: subjectsTable.name })
              .from(subjectsTable).where(eq(subjectsTable.id, id)).limit(1),
            db.select({ id: topicsTable.id, name: topicsTable.name })
              .from(topicsTable)
              .where(and(eq(topicsTable.subjectId, id), eq(topicsTable.status, 'published'))),
            getTopicBestSessionPercentages(db),
            getSubjectSessionPercentages(db),
          ])

          const topicBestMap = new Map(topicBestRows.map(r => [r.topicId, r.bestPct]))
          const subjectBestMap = new Map(subjectBestRows.map(r => [r.subject, r.bestPct]))

          const subjectName = (subjectRows[0]?.name as string | undefined) ?? 'Subject'
          // subtest (mock) sessions are keyed by the subject NAME.
          const subjectBest = subjectBestMap.get(subjectName) ?? null

          const rows: TopicRow[] = (topicRows as Array<{ id: string; name: string }>).map(tp => ({
            id: tp.id,
            name: tp.name,
            // readiness = max(this topic's review best, the subject mock best).
            bestPct: topicReadiness({
              topicBest: topicBestMap.get(tp.id) ?? null,
              subjectBest,
            }),
          }))
          rows.sort(byReadiness)

          return { subjectName, rows }
        })
        if (alive) setState({ status: 'ready', data: result })
      } catch (e) {
        console.warn('[subjects/[id]] load failed:', e)
        if (alive) setState({ status: 'error' })
      }
    })()
    return () => { alive = false }
  }, [db, id, attempt])

  const accent = useMemo(() => subjectColor(id ?? '').accent, [id])

  const renderItem = useCallback(({ item }: { item: TopicRow }) => <TopicProgressRow row={item} />, [])
  const keyExtractor = useCallback((item: TopicRow) => item.id, [])

  // ── No-id (redirecting) ──────────────────────────────────────────────────
  if (!id) return null

  const subjectName = state.status === 'ready' ? state.data.subjectName : null

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={(state) => {
          const { pressed, focused } = state as WebPressableState
          return [
            { width: 44, height: 44, marginLeft: -spacing.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent' },
            focusRing(t.focusRing, focused),
          ]
        }}
      >
        <Lineicons icon={ChevronLeftOutlined} size={24} color={t.textSecondary} />
      </Pressable>
      {/* The subject's identity colour, as a small marker (decorative). */}
      <View {...decorative} style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: accent }} />
      <Text accessibilityRole="header" style={[textStyle('headline', t.textPrimary), { flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
        {subjectName ?? 'Subject'}
      </Text>
    </View>
  )

  return (
    <Screen scroll={false} header={header}>
      {state.status === 'loading' ? (
        <View accessible accessibilityLabel="Loading topics" accessibilityState={{ busy: true }} style={{ gap: spacing.sm, paddingTop: spacing.md }}>
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={64} radius={radius.lg} />)}
        </View>
      ) : state.status === 'error' ? (
        <ErrorState title="Couldn't load this subject" onRetry={() => { _invalidateSubject(id); setAttempt(n => n + 1) }} />
      ) : (
        <FlatList
          testID="topics-list"
          style={{ flex: 1 }}
          data={state.data.rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={
            <Text style={[textStyle('bodySm', t.textSecondary), { marginBottom: spacing.xs }]} maxFontSizeMultiplier={1.8}>
              Readiness per topic, lowest first. Tap a topic to practise it.
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Lineicons icon={Books2Outlined} size={24} color={t.textSecondary} />}
              title="No topics in this subject yet."
              body="Topics appear here once their questions download to this device."
            />
          }
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={11}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.md }}
        />
      )}
    </Screen>
  )
}

/** Drop a failed/stale subject entry so Try again really refetches. */
function _invalidateSubject(id: string) {
  invalidate(`subject:topics:${id}`)
}
