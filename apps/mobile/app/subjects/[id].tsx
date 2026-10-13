import { useState, useEffect, useMemo, memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { eq, and } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { subjects as subjectsTable, topics as topicsTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined, Books2Outlined } from '@lineiconshq/free-icons'
import { Screen } from '../../components/ui/Screen'
import { TwoColumn } from '../../components/ui/TwoColumn'
import { LargeTitleHeader } from '../../components/navigation/LargeTitleHeader'
import { Card } from '../../components/ui/Card'
import { InsetGroup } from '../../components/ui/InsetGroup'
import { Button } from '../../components/ui/Button'
import { StatNumber } from '../../components/ui/StatNumber'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { decorative, focusRing, heading } from '../../components/ui/a11y'
import { PressableScale } from '../../components/ui/Pressable'
import { Text } from '../../components/ui/Text'
import { layout, spacing, radius } from '../../theme/tokens'
import { cachedQuery, invalidate } from '../../services/queryCache'
import { getSubjectRecentAccuracy, getTopicRecentAccuracy } from '../../services/homeAggregates'
import { topicReadiness } from '../../utils/subjectReadiness'
import { subjectColor } from '../../utils/subjectColors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopicRow {
  id: string
  name: string
  // Recent weighted accuracy over this topic's latest answered questions, or
  // null when there are too few answers yet ("Not started").
  pct: number | null
}

interface SubjectData {
  subjectName: string
  rows: TopicRow[]
  /** Recent accuracy across all of the subject's answers; null until enough answers. */
  subjectPct: number | null
}

// Cached for 5 min so re-opening the same subject is instant (no re-query/re-sort).
const SUBJECT_TTL = 300_000

// ---------------------------------------------------------------------------
// Sort: lowest readiness first (needs the most work), topics with no session
// last, alphabetical tiebreak within each band.
// ---------------------------------------------------------------------------

function byReadiness(a: TopicRow, b: TopicRow): number {
  const an = a.pct == null
  const bn = b.pct == null
  if (an !== bn) return an ? 1 : -1            // null (no session) sinks to the bottom
  if (!an && !bn && a.pct !== b.pct) {
    return (a.pct as number) - (b.pct as number) // ascending: lowest first
  }
  return a.name.localeCompare(b.name)          // alpha tiebreak
}

// ---------------------------------------------------------------------------
// Topic row — an inset-group row: the name, the number, and a thin mastery
// bar under the name. Readiness is one ink at every score (redesign M2): a
// red/green percent reads as a verdict.
// ---------------------------------------------------------------------------

const TopicProgressRow = memo(function TopicProgressRow({ row, last }: { row: TopicRow; last: boolean }) {
  const { theme: t } = useTheme()
  const pctLabel = row.pct != null ? `${row.pct}%` : '—'

  return (
    <PressableScale
      onPress={() => router.push(`/practice/${row.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${row.pct != null ? `readiness ${pctLabel}` : 'not started'}`}
      accessibilityHint="Opens practice for this topic"
      style={({ pressed, hovered, focused }) => [
        {
          minHeight: layout.rowMinHeight, flexDirection: 'row', alignItems: 'stretch', paddingLeft: spacing.lg,
          backgroundColor: pressed ? t.surface2 : hovered ? t.surfaceSubtle : 'transparent',
        },
        focusRing(t.focusRing, focused),
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingRight: spacing.lg, paddingVertical: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
          <Text testID="topic-name" role="body" numberOfLines={2}>{row.name}</Text>
          {row.pct == null ? (
            <Text role="subheadline" color={t.textSecondary} numberOfLines={1}>Not started</Text>
          ) : (
            <ProgressBar value={row.pct / 100} label={`${row.name} readiness`} height={4} />
          )}
        </View>
        <Text role="headline" color={row.pct == null ? t.textSecondary : t.textPrimary} style={{ fontVariant: ['tabular-nums'] }} chrome>
          {pctLabel}
        </Text>
        <View {...decorative} style={{ transform: [{ scaleX: -1 }] }}>
          <Lineicons icon={ChevronLeftOutlined} size={14} color={t.textTertiary} />
        </View>
        {!last ? (
          <View
            {...decorative}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.divider }}
          />
        ) : null}
      </View>
    </PressableScale>
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
          // Readiness per topic = the topic's own recent accuracy (latest 60 answered
          // questions, minimum 10) — not lifted by the subject's overall result.
          const [subjectRows, topicRows, topicPctRows, subjectPctRows] = await Promise.all([
            db.select({ id: subjectsTable.id, name: subjectsTable.name })
              .from(subjectsTable).where(eq(subjectsTable.id, id)).limit(1),
            db.select({ id: topicsTable.id, name: topicsTable.name })
              .from(topicsTable)
              .where(and(eq(topicsTable.subjectId, id), eq(topicsTable.status, 'published'))),
            getTopicRecentAccuracy(db),
            getSubjectRecentAccuracy(db),
          ])

          const topicPctMap = new Map(topicPctRows.map(r => [r.topicId, r.pct]))

          const subjectName = (subjectRows[0]?.name as string | undefined) ?? 'Subject'

          const rows: TopicRow[] = (topicRows as Array<{ id: string; name: string }>).map(tp => ({
            id: tp.id,
            name: tp.name,
            pct: topicReadiness(topicPctMap.get(tp.id)),
          }))
          rows.sort(byReadiness)

          // The headline is the subject's own recent accuracy — the same figure
          // Progress and Practice show. It includes mock and drill answers,
          // which have no flashcard topic, so a mean of the topics would differ.
          const subjectPct = subjectPctRows.find(r => r.subject === subjectName)?.pct ?? null

          return { subjectName, rows, subjectPct }
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
          <Skeleton height={32} width="40%" radius={radius.chip} />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={64} radius={radius.group} />)}
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

  const { subjectName, rows, subjectPct } = state.data
  const practised = rows.filter(r => r.pct != null)
  // Rows are sorted lowest readiness first, so the first row is the next step.
  const next = rows[0] as TopicRow | undefined

  const title = (
    <View style={{ marginBottom: spacing.lg }}>
      <LargeTitleHeader
        testID="subject-title"
        title={subjectName}
        subtitle="Readiness per topic, lowest first. Tap a topic to practise it."
        actions={
          // The subject's identity colour, as a small marker (decorative).
          <View {...decorative} style={{ width: 12, height: 12, borderRadius: radius.capsule, backgroundColor: accent }} />
        }
      />
    </View>
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
    <View testID="topics-list">
      <InsetGroup inset={false} header="Topics">
        {rows.map((row, i) => <TopicProgressRow key={row.id} row={row} last={i === rows.length - 1} />)}
      </InsetGroup>
    </View>
  )

  const summary = (
    <Card style={{ gap: spacing.lg }}>
      <Text {...heading(2)} role="title3">
        Subject summary
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl }}>
        <StatNumber label="Topics practised" value={practised.length} unit={`of ${rows.length}`} />
        {/* Value and unit as separate texts so the number stays tabular. */}
        <StatNumber label="Subject readiness" value={subjectPct ?? 'None yet'} unit={subjectPct != null ? '%' : undefined} />
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
