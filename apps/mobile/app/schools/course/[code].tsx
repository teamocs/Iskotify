import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { StyleSheet, View, Text, FlatList } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ArrowRightOutlined, Shield2CheckOutlined } from '@lineiconshq/free-icons'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import {
  courseSchoolRankings as rankingsTable,
  courseTaxonomyMap as taxonomyTable,
  aiCareerImpact as aiImpactTable,
} from '../../../db/schema'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius, textStyle, type Theme } from '../../../theme/tokens'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { Skeleton } from '../../../components/ui/Skeleton'
import { decorative } from '../../../components/ui/a11y'
import { useWebContentWidth } from '../../../components/ui/webMaxWidth'
import { DetailTopBar } from '../../../components/explore/DetailTopBar'
import { cachedQuery } from '../../../services/queryCache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RankingRow {
  id: string
  rank: number | null
  schoolName: string
  region: string | null
  wilsonScore: number | null
  rawPassRate: number | null
  totalExaminees: number | null
}

interface TaxonomyRow {
  courseTab: string
  careerCourseId: string | null
  label: string | null
}

interface AiRow {
  aiSafetyScore: number | null
  aiSafetyLabel: string | null
}

interface CourseData {
  taxonomy: TaxonomyRow | null
  rankings: RankingRow[]
  ai: AiRow | null
}

// Stable empty list while loading, so `visible` below is not recomputed every render.
const NO_RANKINGS: RankingRow[] = []

// First page size + how many more rows reveal each time the list nears its end.
// The whole course is read once from local SQLite (fast, indexed on course_tab),
// but rows are RENDERED progressively so a 300-school course (e.g. Accountancy)
// never mounts hundreds of Cards at once.
const PAGE_SIZE = 20

// Cached for 5 min so re-opening the same course is instant (no re-query/re-sort).
// Content sync invalidates 'course:rankings:' alongside the other chat/meta keys.
const RANKINGS_TTL = 300_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPassRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${rate.toFixed(1)}%`
}

function fmtScore(score: number | null): string {
  if (score == null) return '—'
  return score.toFixed(3)
}

function byRank(a: RankingRow, b: RankingRow): number {
  if (a.rank == null) return 1
  if (b.rank == null) return -1
  return a.rank - b.rank
}

type Styles = ReturnType<typeof makeStyles>

function makeStyles(t: Theme) {
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: t.bg },
    heroTitle:   textStyle('title', t.textPrimary),
    heroSub:     { ...textStyle('body', t.textSecondary), marginTop: spacing.xs },
    rankHeader:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    rankBadge:   { minWidth: 36, height: 36, paddingHorizontal: spacing.xs, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2, flexShrink: 0 },
    rankNum:     textStyle('label', t.textPrimary),
    schoolName:  { ...textStyle('titleSm', t.textPrimary), flex: 1 },
    metaRow:     { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs },
    metaTxt:     textStyle('bodySm', t.textSecondary),
    highlight:   { ...textStyle('label', t.textPrimary), fontVariant: ['tabular-nums'] },
    disclaimer:  { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.lg, backgroundColor: t.warningSurface, borderRadius: radius.sm, padding: spacing.md },
    disclaimerTxt: { ...textStyle('bodySm', t.warningStrong), flex: 1 },
    empty:       { ...textStyle('body', t.textSecondary), textAlign: 'center', marginTop: spacing.xl },
  })
}

// ---------------------------------------------------------------------------
// Memoized list item — keeps each row from re-rendering as the page grows.
// ---------------------------------------------------------------------------

const RankCard = memo(function RankCard({ row, s }: { row: RankingRow; s: Styles }) {
  const facts = [
    row.region,
    `Pass rate ${fmtPassRate(row.rawPassRate)}`,
    `Wilson score ${fmtScore(row.wilsonScore)}`,
    row.totalExaminees != null ? `${row.totalExaminees.toLocaleString()} examinees` : null,
  ].filter(Boolean).join(', ')
  return (
    <Card accessible accessibilityLabel={`Rank ${row.rank ?? 'unranked'}: ${row.schoolName}. ${facts}`}>
      <View style={s.rankHeader}>
        <View style={s.rankBadge}>
          <Text style={s.rankNum} maxFontSizeMultiplier={1.4}>#{row.rank ?? '–'}</Text>
        </View>
        <Text style={s.schoolName} numberOfLines={2} maxFontSizeMultiplier={1.6}>{row.schoolName}</Text>
      </View>
      <View style={s.metaRow}>
        {row.region ? <Text style={s.metaTxt} maxFontSizeMultiplier={1.6}>{row.region}</Text> : null}
        <Text style={s.metaTxt} maxFontSizeMultiplier={1.6}>
          Pass rate <Text style={s.highlight}>{fmtPassRate(row.rawPassRate)}</Text>
        </Text>
        <Text style={s.metaTxt} maxFontSizeMultiplier={1.6}>
          Wilson <Text style={s.highlight}>{fmtScore(row.wilsonScore)}</Text>
        </Text>
        {row.totalExaminees != null ? (
          <Text style={s.metaTxt} maxFontSizeMultiplier={1.6}>{row.totalExaminees.toLocaleString()} examinees</Text>
        ) : null}
      </View>
    </Card>
  )
})

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CourseSchoolsScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const db = useDb()
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()

  const [data, setData] = useState<CourseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Guard: if navigated to without a code param, redirect to the picker so the
  // user can choose a course rather than seeing an empty rankings list.
  // useEffect keeps all hooks unconditional.
  useEffect(() => {
    if (!code) router.replace('/schools/course' as never)
  }, [code])

  useEffect(() => {
    if (!code) return
    let alive = true
    setLoading(true)
    setVisibleCount(PAGE_SIZE)
    void (async () => {
      // One cached read per course: the full ranking list comes from local
      // SQLite (indexed on course_tab) and is reused on re-entry within the TTL.
      const result = await cachedQuery<CourseData>(`course:rankings:${code}`, RANKINGS_TTL, async () => {
        const [taxRows, rankRows] = await Promise.all([
          db.select({
            courseTab: taxonomyTable.courseTab,
            careerCourseId: taxonomyTable.careerCourseId,
            label: taxonomyTable.label,
          }).from(taxonomyTable).where(eq(taxonomyTable.courseTab, code)).limit(1),

          db.select({
            id: rankingsTable.id,
            rank: rankingsTable.rank,
            schoolName: rankingsTable.schoolName,
            region: rankingsTable.region,
            wilsonScore: rankingsTable.wilsonScore,
            rawPassRate: rankingsTable.rawPassRate,
            totalExaminees: rankingsTable.totalExaminees,
          }).from(rankingsTable).where(eq(rankingsTable.courseTab, code)),
        ])

        const tax = (taxRows[0] ?? null) as TaxonomyRow | null
        const sorted = (rankRows as RankingRow[]).slice().sort(byRank)

        let ai: AiRow | null = null
        if (tax?.careerCourseId) {
          const aiRows = await db.select({
            aiSafetyScore: aiImpactTable.aiSafetyScore,
            aiSafetyLabel: aiImpactTable.aiSafetyLabel,
          }).from(aiImpactTable).where(eq(aiImpactTable.courseId, tax.careerCourseId)).limit(1)
          ai = (aiRows[0] ?? null) as AiRow | null
        }

        return { taxonomy: tax, rankings: sorted, ai }
      })
      if (!alive) return
      setData(result)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [db, code])

  const s = useMemo(() => makeStyles(t), [t])
  // Web-only max-width centering for the rankings list (null on native/sm).
  const webWidth = useWebContentWidth()

  const rankings = data?.rankings ?? NO_RANKINGS
  const taxonomy = data?.taxonomy ?? null
  const aiRow = data?.ai ?? null
  const courseLabel = taxonomy?.label ?? code
  const total = rankings.length

  const visible = useMemo(() => rankings.slice(0, visibleCount), [rankings, visibleCount])

  const loadMore = useCallback(() => {
    setVisibleCount(c => (c < total ? Math.min(total, c + PAGE_SIZE) : c))
  }, [total])

  const onEndReached = useCallback((info?: { distanceFromEnd: number }) => {
    // Ignore the spurious mount-time fire (distanceFromEnd <= 0, content not yet
    // laid out) so the next page reveals only once the user scrolls near the end.
    if (info && info.distanceFromEnd <= 0) return
    loadMore()
  }, [loadMore])

  const renderItem = useCallback(
    ({ item }: { item: RankingRow }) => <RankCard row={item} s={s} />,
    [s],
  )
  const keyExtractor = useCallback((item: RankingRow) => item.id, [])

  const header = useMemo(() => (
    <View style={{ gap: spacing.lg, marginBottom: spacing.sm }}>
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={s.heroTitle} maxFontSizeMultiplier={1.4}>{courseLabel}</Text>
        <Text style={s.heroSub} maxFontSizeMultiplier={1.6}>Schools ranked by PRC board-exam pass rate, adjusted for class size (Wilson score)</Text>
        {aiRow?.aiSafetyScore != null ? (
          <Badge
            label={`AI-safe score ${aiRow.aiSafetyScore}/5${aiRow.aiSafetyLabel ? ` · ${aiRow.aiSafetyLabel}` : ''}`}
            tone="neutral"
          />
        ) : null}
        {taxonomy?.careerCourseId ? (
          <Button
            label="View career paths"
            variant="ghost"
            size="sm"
            icon={<Lineicons icon={ArrowRightOutlined} size={14} color={t.accentText} />}
            onPress={() => router.push(`/career/${taxonomy.careerCourseId}` as never)}
            style={{ marginLeft: -spacing.lg }}
          />
        ) : null}
      </View>
      <SectionHeader title="School rankings" subtitle={total > 0 ? `${total} schools ranked` : undefined} />
    </View>
  ), [s, t, courseLabel, aiRow, taxonomy, total])

  const footer = useMemo(() => (
    <View>
      {visibleCount < total ? (
        <Button
          testID="load-more"
          label={`Show more · ${visibleCount} of ${total}`}
          variant="secondary"
          fullWidth
          onPress={loadMore}
        />
      ) : null}
      <View style={s.disclaimer}>
        <View {...decorative} style={{ marginTop: 2 }}>
          <Lineicons icon={Shield2CheckOutlined} size={16} color={t.warningStrong} />
        </View>
        <Text style={s.disclaimerTxt} maxFontSizeMultiplier={1.6}>
          Rankings use historical PRC pass-rate data. Check official PRC releases before you decide.
        </Text>
      </View>
    </View>
  ), [s, t, loadMore, visibleCount, total])

  // ── No-code (redirecting) ──────────────────────────────────────────────────

  if (!code) return null

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <DetailTopBar fallbackHref="/explore?section=courses" />
        <View
          accessible
          accessibilityLabel="Loading rankings"
          aria-busy
          style={[{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }, webWidth]}
        >
          <Skeleton width="70%" height={28} />
          <Skeleton width="90%" height={14} />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={88} radius={radius.xl} />)}
        </View>
      </SafeAreaView>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <DetailTopBar fallbackHref="/explore?section=courses" />
      <FlatList
        testID="rankings-list"
        data={visible}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          <Text style={s.empty} maxFontSizeMultiplier={1.6}>No ranking data for this course yet.</Text>
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        initialNumToRender={PAGE_SIZE}
        maxToRenderPerBatch={PAGE_SIZE}
        windowSize={11}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xl }, webWidth]}
      />
    </SafeAreaView>
  )
}
