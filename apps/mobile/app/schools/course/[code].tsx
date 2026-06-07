import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import {
  courseSchoolRankings as rankingsTable,
  courseSchoolQuality as qualityTable,
  courseTaxonomyMap as taxonomyTable,
  aiCareerImpact as aiImpactTable,
} from '../../../db/schema'
import { useTheme } from '../../../theme/ThemeContext'

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

interface QualityRow {
  id: string
  schoolName: string
  qualityTier: string | null
  accreditations: string
  courseGroup: string | null
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

function tierColor(tier: string | null): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'top':        return '#4ade80'
    case 'strong':     return '#86efac'
    case 'good':       return '#fbbf24'
    case 'average':    return 'rgba(255,255,255,0.5)'
    default:           return 'rgba(255,255,255,0.38)'
  }
}

function safeParseAccreds(raw: string): string[] {
  try {
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CourseSchoolsScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [rankings, setRankings]   = useState<RankingRow[]>([])
  const [quality, setQuality]     = useState<QualityRow[]>([])
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

      // Load AI impact and quality in parallel if we have a careerCourseId
      if (tax?.careerCourseId) {
        const [aiRows, qualRows] = await Promise.all([
          db.select({
            aiSafetyScore: aiImpactTable.aiSafetyScore,
            aiSafetyLabel: aiImpactTable.aiSafetyLabel,
          }).from(aiImpactTable).where(eq(aiImpactTable.courseId, tax.careerCourseId)).limit(1),

          db.select({
            id: qualityTable.id,
            schoolName: qualityTable.schoolName,
            qualityTier: qualityTable.qualityTier,
            accreditations: qualityTable.accreditations,
            courseGroup: qualityTable.courseGroup,
          }).from(qualityTable),
        ])
        setAiRow((aiRows[0] ?? null) as AiRow | null)
        setQuality(qualRows as QualityRow[])
      } else {
        const qualRows = await db.select({
          id: qualityTable.id,
          schoolName: qualityTable.schoolName,
          qualityTier: qualityTable.qualityTier,
          accreditations: qualityTable.accreditations,
          courseGroup: qualityTable.courseGroup,
        }).from(qualityTable)
        setQuality(qualRows as QualityRow[])
      }

      setLoading(false)
    }
    void load()
  }, [db, code])

  const courseLabel = taxonomy?.label ?? code

  const s = useMemo(() => StyleSheet.create({
    root:        { flex: 1, backgroundColor: t.bg },
    topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
    backBtn:     { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    backArrow:   { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:    { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    scroll:      { paddingBottom: 40 },
    hero:        { marginHorizontal: 14, borderRadius: 18, padding: 16, marginBottom: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
    heroTitle:   { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
    heroSub:     { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    aiChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
    aiChipTxt:   { fontSize: typo.xs, color: t.accentText, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
    careerLink:  { marginTop: 10 },
    careerLinkTxt: { fontSize: typo.sm, color: t.accent, fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
    section:     { marginHorizontal: 14, marginBottom: 16 },
    sectionTitle: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', marginBottom: 10 },
    rankCard:    { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 12, marginBottom: 8 },
    rankHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    rankBadge:   { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', flexShrink: 0 },
    rankNum:     { fontSize: typo.xs, fontWeight: '700', color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    schoolName:  { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    metaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    metaChip:    { backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    metaTxt:     { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    highlight:   { color: t.textSecondary, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
    qualCard:    { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 11, marginBottom: 7, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    qualDot:     { width: 10, height: 10, borderRadius: 5, marginTop: 3, flexShrink: 0 },
    qualBody:    { flex: 1 },
    qualName:    { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    qualTier:    { fontSize: typo.xs, fontFamily: 'Lexend_600SemiBold', fontWeight: '600', marginBottom: 2 },
    qualAccred:  { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    disclaimer:  { marginHorizontal: 14, marginBottom: 16, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: 12, padding: 12 },
    disclaimerTxt: { fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 17 },
    empty:       { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: 20, fontStyle: 'italic' },
    emptyScreen: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60 },
  }), [t, typo])

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>Top Schools · {courseLabel}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={s.hero}>
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
            <TouchableOpacity
              style={s.careerLink}
              onPress={() => router.push(`/career/${taxonomy.careerCourseId}` as never)}
            >
              <Text style={s.careerLinkTxt}>View career paths →</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── PRC Rankings ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>School Rankings</Text>

          {rankings.length > 0 ? rankings.map(row => (
            <View key={row.id} style={s.rankCard}>
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
            </View>
          )) : (
            <Text style={s.empty}>No ranking data available for this course yet.</Text>
          )}
        </View>

        {/* ── Quality / Accreditation (light section) ── */}
        {quality.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Program Quality</Text>
            {quality.slice(0, 10).map(q => {
              const accreds = safeParseAccreds(q.accreditations)
              return (
                <View key={q.id} style={s.qualCard}>
                  <View style={[s.qualDot, { backgroundColor: tierColor(q.qualityTier) }]} />
                  <View style={s.qualBody}>
                    <Text style={s.qualName} numberOfLines={2}>{q.schoolName}</Text>
                    {q.qualityTier ? (
                      <Text style={[s.qualTier, { color: tierColor(q.qualityTier) }]}>
                        {q.qualityTier} tier
                      </Text>
                    ) : null}
                    {accreds.length > 0 ? (
                      <Text style={s.qualAccred}>{accreds.join(' · ')}</Text>
                    ) : null}
                  </View>
                </View>
              )
            })}
          </View>
        ) : null}

        {/* ── Disclaimer ── */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTxt}>
            ⚠ Rankings use historical PRC pass-rate data — verify on official PRC releases.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
