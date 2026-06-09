import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, Pressable, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import {
  courseSchoolRankings as rankingsTable,
  courseTaxonomyMap as taxonomyTable,
  aiCareerImpact as aiImpactTable,
} from '../../../db/schema'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing, radius } from '../../../theme/tokens'
import { ScreenScroll } from '../../../components/ui/ScreenScroll'
import { Card } from '../../../components/ui/Card'
import { SectionHeader } from '../../../components/ui/SectionHeader'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPassRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmtScore(score: number | null): string {
  if (score == null) return '—'
  return score.toFixed(3)
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CourseSchoolsScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [rankings, setRankings]   = useState<RankingRow[]>([])
  const [taxonomy, setTaxonomy]   = useState<TaxonomyRow | null>(null)
  const [aiRow, setAiRow]         = useState<AiRow | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
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
      setTaxonomy(tax)

      // Sort by rank ascending (nulls last)
      const sorted = (rankRows as RankingRow[]).slice().sort((a, b) => {
        if (a.rank == null) return 1
        if (b.rank == null) return -1
        return a.rank - b.rank
      })
      setRankings(sorted)

      // Load AI impact if we have a careerCourseId
      if (tax?.careerCourseId) {
        const aiRows = await db.select({
          aiSafetyScore: aiImpactTable.aiSafetyScore,
          aiSafetyLabel: aiImpactTable.aiSafetyLabel,
        }).from(aiImpactTable).where(eq(aiImpactTable.courseId, tax.careerCourseId)).limit(1)
        setAiRow((aiRows[0] ?? null) as AiRow | null)
      }

      setLoading(false)
    }
    void load()
  }, [db, code])

  const courseLabel = taxonomy?.label ?? code

  const s = useMemo(() => StyleSheet.create({
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
    rankCard:    { padding: spacing.md },
    rankHeader:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    rankBadge:   { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', flexShrink: 0 },
    rankNum:     { fontSize: typo.xs, fontWeight: '700', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    schoolName:  { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    metaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    metaChip:    { backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 },
    metaTxt:     { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    highlight:   { color: t.textSecondary, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
    disclaimer:  { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: radius.md, padding: spacing.md },
    disclaimerTxt: { fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 17 },
    empty:       { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: spacing.xl, fontStyle: 'italic' },
  }), [t, typo])

  // ── Loading ────────────────────────────────────────────────────────────────

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
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <Text style={s.topTitle} numberOfLines={1}>Top Schools · {courseLabel}</Text>
      </View>

      <ScreenScroll tabBarInset={false} contentContainerStyle={{ gap: spacing.lg, paddingTop: spacing.sm }}>

        {/* ── Hero ── */}
        <Card elevated>
          <Text style={s.heroTitle}>{courseLabel}</Text>
          <Text style={s.heroSub}>PRC board exam school rankings by Wilson-adjusted pass rate</Text>

          {/* AI-Safe-Score chip */}
          {aiRow?.aiSafetyScore != null ? (
            <View style={s.aiChip}>
              <Text style={s.aiChipTxt}>
                🤖 AI-Safe-Score {aiRow.aiSafetyScore}/5
                {aiRow.aiSafetyLabel ? ` · ${aiRow.aiSafetyLabel}` : ''}
              </Text>
            </View>
          ) : null}

          {/* Career path cross-link */}
          {taxonomy?.careerCourseId ? (
            <Pressable
              style={({ pressed }) => [s.careerLink, pressed && { opacity: 0.7 }]}
              onPress={() => router.push(`/career/${taxonomy.careerCourseId}` as never)}
              accessibilityRole="link"
            >
              <Text style={s.careerLinkTxt}>View career paths →</Text>
            </Pressable>
          ) : null}
        </Card>

        {/* ── PRC Rankings ── */}
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="School Rankings" />

          {rankings.length > 0 ? rankings.map(row => (
            <Card key={row.id} style={s.rankCard}>
              <View style={s.rankHeader}>
                <View style={s.rankBadge}>
                  <Text style={s.rankNum}>#{row.rank ?? '—'}</Text>
                </View>
                <Text style={s.schoolName} numberOfLines={2}>{row.schoolName}</Text>
              </View>
              <View style={s.metaRow}>
                {row.region ? (
                  <View style={s.metaChip}>
                    <Text style={s.metaTxt}>📍 {row.region}</Text>
                  </View>
                ) : null}
                <View style={s.metaChip}>
                  <Text style={s.metaTxt}>
                    Pass rate: <Text style={s.highlight}>{fmtPassRate(row.rawPassRate)}</Text>
                  </Text>
                </View>
                <View style={s.metaChip}>
                  <Text style={s.metaTxt}>
                    Wilson: <Text style={s.highlight}>{fmtScore(row.wilsonScore)}</Text>
                  </Text>
                </View>
                {row.totalExaminees != null ? (
                  <View style={s.metaChip}>
                    <Text style={s.metaTxt}>{row.totalExaminees.toLocaleString()} examinees</Text>
                  </View>
                ) : null}
              </View>
            </Card>
          )) : (
            <Text style={s.empty}>No ranking data available for this course yet.</Text>
          )}
        </View>

        {/* ── Disclaimer ── */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTxt}>
            ⚠ Rankings use historical PRC pass-rate data — verify on official PRC releases.
          </Text>
        </View>

      </ScreenScroll>
    </SafeAreaView>
  )
}
