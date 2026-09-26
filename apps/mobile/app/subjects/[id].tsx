import { useState, useEffect, useMemo, memo } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { eq, and } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { subjects as subjectsTable, topics as topicsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined, Books2Outlined } from '@lineiconshq/free-icons'
import { Screen } from '../../components/ui/Screen'
import { TwoColumn } from '../../components/ui/TwoColumn'
import { PageTitle } from '../../components/ui/PageTitle'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatNumber } from '../../components/ui/StatNumber'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { decorative, focusRing, heading, type WebPressableState } from '../../components/ui/a11y'
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

  // ── No-id (redirecting) ──────────────────────────────────────────────────
  if (!id) return null

  const header = <DetailTopBar bare fallbackHref="/practice" />

  if (state.status === 'loading') {
    return (
      <Screen header={header} width="wide">
        <View accessible accessibilityLabel="Loading topics" aria-busy style={{ gap: spacing.sm, paddingTop: spacing.md }}>
          <Skeleton height={32} width="40%" radius={radius.sm} />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={64} radius={radius.lg} />)}
        </View>
      </Screen>
    )
  }

  if (state.status === 'error') {
    return (
      <Screen header={header}>
        <ErrorState title="Couldn't load this subject" onRetry={() => { _invalidateSubject(id); setAttempt(n => n + 1) }} />
      </Screen>
    )
  }

  const { subjectName, rows } = state.data
  const practised = rows.filter(r => r.bestPct != null)
  const average = practised.length > 0
    ? Math.round(practised.reduce((sum, r) => sum + (r.bestPct as number), 0) / practised.length)
    : null
  // Rows are sorted lowest readiness first, so the first row is the next step.
  const next = rows[0] as TopicRow | undefined

  const title = (
    <PageTitle
      title={subjectName}
      lead="Readiness per topic, lowest first. Tap a topic to practise it."
      trailing={
        // The subject's identity colour, as a small marker (decorative).
        <View {...decorative} style={{ width: 12, height: 12, borderRadius: radius.pill, backgroundColor: accent }} />
      }
    />
  )

  if (rows.length === 0) {
    return (
      <Screen header={header}>
        {title}
        <EmptyState
          icon={<Lineicons icon={Books2Outlined} size={24} color={t.textSecondary} />}
          title="No topics in this subject yet."
          body="Topics appear here once their questions download to this device."
        />
      </Screen>
    )
  }

  const topics = (
    <View testID="topics-list" style={{ gap: spacing.sm }}>
      {rows.map(row => <TopicProgressRow key={row.id} row={row} />)}
    </View>
  )

  const summary = (
    <Card style={{ gap: spacing.lg }}>
      <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>
        Subject summary
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl }}>
        <StatNumber label="Topics practised" value={practised.length} unit={`of ${rows.length}`} />
        {/* Value and unit as separate texts so the number stays tabular. */}
        <StatNumber label="Average readiness" value={average ?? 'None yet'} unit={average != null ? '%' : undefined} />
      </View>
      {next ? <Button
        label={`Practise ${next.name}`}
        accessibilityHint="Opens practice for the topic that needs the most work"
        onPress={() => router.push(`/practice/${next.id}`)}
        fullWidth
      /> : null}
    </Card>
  )

  return (
    <Screen header={header} width="wide">
      {title}
      <TwoColumn primary={topics} secondary={summary} />
    </Screen>
  )
}

/** Drop a failed/stale subject entry so Try again really refetches. */
function _invalidateSubject(id: string) {
  invalidate(`subject:topics:${id}`)
}
