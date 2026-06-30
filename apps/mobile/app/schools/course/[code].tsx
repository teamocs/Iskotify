import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import {
  StyleSheet, View, Text, Pressable, ActivityIndicator, FlatList,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import {
  courseSchoolRankings as rankingsTable,
  courseTaxonomyMap as taxonomyTable,
  aiCareerImpact as aiImpactTable,
} from '../../../db/schema'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius, type Theme, type Typography } from '../../../theme/tokens'
import { Card } from '../../../components/ui/Card'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
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

function makeStyles(t: Theme, typo: Typography) {
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: t.bg },
    topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
    backArrow:   { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:    { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    heroTitle:   { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs },
    heroSub:     { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    aiChip:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
    aiChipTxt:   { fontSize: typo.xs, color: t.accentText, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
    careerLink:  { marginTop: spacing.md, minHeight: 44, justifyContent: 'center' },
    careerLinkTxt: { fontSize: typo.sm, color: t.accentText, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
    sectionWrap: { marginTop: spacing.lg, marginBottom: spacing.xs },
    rankCard:    { padding: spacing.md },
    rankHeader:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    rankBadge:   { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', flexShrink: 0 },
    rankNum:     { fontSize: typo.xs, fontWeight: '700', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    schoolName:  { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    metaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    metaChip:    { backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 },
    metaTxt:     { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    highlight:   { color: t.textSecondary, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
    loadMore:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
    loadMoreTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    disclaimer:  { marginTop: spacing.lg, backgroundColor: t.warningSurface, borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: radius.md, padding: spacing.md },
    disclaimerTxt: { fontSize: typo.xs, color: t.warning, fontFamily: 'Lexend_400Regular', lineHeight: 17 },
    empty:       { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: spacing.xl, fontStyle: 'italic' },
  })
}

// ---------------------------------------------------------------------------
// Memoized list item — keeps each row from re-rendering as the page grows.
// ---------------------------------------------------------------------------

const RankCard = memo(function RankCard({ row, s }: { row: RankingRow; s: Styles }) {
  return (
    <Card style={s.rankCard}>
      <View style={s.rankHeader}>
        <View style={s.rankBadge}>
          <Text style={s.rankNum} maxFontSizeMultiplier={1.4}>#{row.rank ?? '—'}</Text>
        </View>
        <Text style={s.schoolName} numberOfLines={2} maxFontSizeMultiplier={1.4}>{row.schoolName}</Text>
      </View>
      <View style={s.metaRow}>
        {row.region ? (
          <View style={s.metaChip}>
            <Text style={s.metaTxt} maxFontSizeMultiplier={1.4}>📍 {row.region}</Text>
          </View>
        ) : null}
        <View style={s.metaChip}>
          <Text style={s.metaTxt} maxFontSizeMultiplier={1.4}>
            Pass rate: <Text style={s.highlight}>{fmtPassRate(row.rawPassRate)}</Text>
          </Text>
        </View>
        <View style={s.metaChip}>
          <Text style={s.metaTxt} maxFontSizeMultiplier={1.4}>
            Wilson: <Text style={s.highlight}>{fmtScore(row.wilsonScore)}</Text>
          </Text>
        </View>
        {row.totalExaminees != null ? (
          <View style={s.metaChip}>
            <Text style={s.metaTxt} maxFontSizeMultiplier={1.4}>{row.totalExaminees.toLocaleString()} examinees</Text>
          </View>
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
  const { theme: t, typo } = useTheme()
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

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  const rankings = data?.rankings ?? []
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
    <View>
      <Card elevated>
        <Text style={s.heroTitle} maxFontSizeMultiplier={1.4}>{courseLabel}</Text>
        <Text style={s.heroSub} maxFontSizeMultiplier={1.4}>PRC board exam school rankings by Wilson-adjusted pass rate</Text>

        {aiRow?.aiSafetyScore != null ? (
          <View style={s.aiChip}>
            <Text style={s.aiChipTxt} maxFontSizeMultiplier={1.4}>
              🤖 AI-Safe-Score {aiRow.aiSafetyScore}/5
              {aiRow.aiSafetyLabel ? ` · ${aiRow.aiSafetyLabel}` : ''}
            </Text>
          </View>
        ) : null}

        {taxonomy?.careerCourseId ? (
          <Pressable
            style={({ pressed }) => [s.careerLink, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(`/career/${taxonomy.careerCourseId}` as never)}
            accessibilityRole="link"
          >
            <Text style={s.careerLinkTxt} maxFontSizeMultiplier={1.4}>View career paths →</Text>
          </Pressable>
        ) : null}
      </Card>

      <View style={s.sectionWrap}>
        <SectionHeader title="School Rankings" subtitle={total > 0 ? `${total} schools ranked` : undefined} />
      </View>
    </View>
  ), [s, courseLabel, aiRow, taxonomy, total])

  const footer = useMemo(() => (
    <View>
      {visibleCount < total ? (
        <Pressable
          testID="load-more"
          onPress={loadMore}
          style={({ pressed }) => [s.loadMore, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.loadMoreTxt} maxFontSizeMultiplier={1.4}>
            Show more · {visibleCount} of {total}
          </Text>
        </Pressable>
      ) : null}
      <View style={s.disclaimer}>
        <Text style={s.disclaimerTxt} maxFontSizeMultiplier={1.4}>
          ⚠ Rankings use historical PRC pass-rate data — verify on official PRC releases.
        </Text>
      </View>
    </View>
  ), [s, loadMore, visibleCount, total])

  // ── No-code (redirecting) ──────────────────────────────────────────────────

  if (!code) return null

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <WebTopSpacer />
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>Top Schools · {courseLabel}</Text>
      </View>

      <FlatList
        testID="rankings-list"
        data={visible}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          <Text style={s.empty}>No ranking data available for this course yet.</Text>
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        initialNumToRender={PAGE_SIZE}
        maxToRenderPerBatch={PAGE_SIZE}
        windowSize={11}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
      />
    </SafeAreaView>
  )
}
