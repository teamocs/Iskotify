import { useState, useMemo, useCallback } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useFocusListings } from '../../hooks/useFocusListings'
import { usePracticeData } from '../../hooks/usePracticeData'
import { useTheme } from '../../theme/ThemeContext'
import { groupTopicsBySubject } from '../../utils/groupTopicsBySubject'
import { SubjectAccordion } from '../SubjectAccordion'

function StatCard({ value, label, color }: { value: string; label: string; color?: string }) {
  const { theme: t, typo, isDark } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    statCard: { flex: 1, minWidth: '45%', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 14, alignItems: 'center' },
    statVal: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', letterSpacing: -0.5 },
    statLbl: { fontSize: typo.xs, color: t.textTertiary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Lexend_600SemiBold' },
  }), [t, typo])
  const safeColor = color === '#4ade80' ? (isDark ? '#4ade80' : '#16a34a')
    : color === '#fbbf24' ? (isDark ? '#fbbf24' : '#b45309')
    : color
  return (
    <View style={s.statCard}>
      <Text style={[s.statVal, safeColor ? { color: safeColor } : {}]}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  )
}

function WeeklyChart({ data }: { data: { dayLabel: string; accuracy: number | null; sessionCount: number }[] }) {
  const { theme: t, typo, isDark } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    chartWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 4 },
    barCol: { flex: 1, alignItems: 'center', gap: 4 },
    barBg: { width: '100%', height: 60, backgroundColor: t.surfaceSubtle, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
    barFill: { width: '100%', borderRadius: 6 },
    barLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    barLabelToday: { color: t.accentText, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    barPct: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])
  return (
    <View style={s.chartWrap}>
      {data.map((bar, i) => {
        const height = bar.accuracy !== null ? Math.round((bar.accuracy / 100) * 60) : 0
        const isToday = i === data.length - 1
        const fillColor = isToday
          ? t.accentText
          : isDark ? 'rgba(128,0,0,0.55)' : 'rgba(128,0,0,0.35)'
        return (
          <View key={i} style={s.barCol}>
            <View style={s.barBg}>
              {bar.accuracy !== null && (
                <View style={[s.barFill, { height, backgroundColor: fillColor }]} />
              )}
            </View>
            <Text style={[s.barLabel, isToday && s.barLabelToday]}>{bar.dayLabel}</Text>
            {bar.accuracy !== null && (
              <Text style={s.barPct}>{bar.accuracy}%</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

interface Props {
  initialFilter?: string | 'overall'
  /** When true, wraps in its own ScrollView with RefreshControl. Set false when embedded in a parent ScrollView. */
  scrollable?: boolean
}

export function AnalyticsDashboard({ initialFilter = 'overall', scrollable = true }: Props) {
  const { focusListings } = useFocusListings()
  const [activeSlug, setActiveSlug] = useState<string | 'overall'>(initialFilter)
  const analytics = useAnalytics(activeSlug)
  const { refresh } = analytics
  const { subjects } = usePracticeData()

  const subjectGroups = useMemo(() => {
    function avgAccuracy(items: Array<{ accuracy?: number | null }>): number {
      const practiced = items.filter(i => i.accuracy != null) as Array<{ accuracy: number }>
      if (practiced.length === 0) return 0
      return Math.round(practiced.reduce((s, i) => s + i.accuracy, 0) / practiced.length)
    }
    const topicEntries = analytics.topicMastery.filter(t => t.topicId != null && t.subjectId != null)
    return groupTopicsBySubject(
      {
        topics: topicEntries.map(t => ({
          id: t.topicId as string,
          name: t.label,
          subjectId: t.subjectId as string,
          accuracy: t.accuracy,
          sessionCount: t.sessionCount,
        })),
        subjects,
      },
      (topic) => topic,
      (rows) => `${rows.length} topics · ${avgAccuracy(rows)}% avg`,
      'accuracy-desc',
    )
  }, [analytics.topicMastery, subjects])

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }, [refresh])

  const { theme: t, typo, isDark } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    tabsScroll: { maxHeight: 46, marginBottom: 4 },
    tabsContent: { paddingHorizontal: 0, gap: 8, alignItems: 'center', paddingVertical: 6 },
    tab: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 980, paddingHorizontal: 14, paddingVertical: 5, maxWidth: 140 },
    tabActive: { backgroundColor: 'rgba(128,0,0,0.75)', borderColor: 'transparent' },
    tabTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    tabTxtActive: { color: '#fff' },
    scroll: { paddingHorizontal: 0 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    section: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 14, marginBottom: 12 },
    sectionTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, fontFamily: 'Lexend_600SemiBold' },
    masteryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    masteryLabel: { width: 90, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    masteryBarBg: { flex: 1, height: 6, backgroundColor: t.surface2, borderRadius: 3, overflow: 'hidden' },
    masteryBarFill: { height: 6, borderRadius: 3 },
    masteryPct: { width: 32, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Lexend_600SemiBold', textAlign: 'right' },
    recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.surfaceSubtle },
    recentTitle: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    recentDate: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 1 },
    recentBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
    recentBadgeTxt: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyTitle: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
    emptySub: { fontSize: typo.base, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
  }), [t, typo])

  function fmtDate(ts: number): string {
    return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  }

  const activeDays = analytics.weeklyData.filter(d => d.sessionCount > 0).length

  const content = (
    <>
      {/* Listing filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabsContent}
        style={s.tabsScroll}
      >
        <TouchableOpacity
          style={[s.tab, activeSlug === 'overall' && s.tabActive]}
          onPress={() => setActiveSlug('overall')}
        >
          <Text style={[s.tabTxt, activeSlug === 'overall' && s.tabTxtActive]}>Overall</Text>
        </TouchableOpacity>
        {focusListings.map(fl => (
          <TouchableOpacity
            key={fl.slug}
            style={[s.tab, activeSlug === fl.slug && s.tabActive]}
            onPress={() => setActiveSlug(fl.slug)}
          >
            <Text style={[s.tabTxt, activeSlug === fl.slug && s.tabTxtActive]} numberOfLines={1}>{fl.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stats grid */}
      <View style={s.statsGrid}>
        <StatCard
          value={analytics.sessionCount > 0 ? String(analytics.sessionCount) : '—'}
          label="SESSIONS"
          color={t.accentText}
        />
        <StatCard
          value={analytics.avgAccuracy !== null ? `${analytics.avgAccuracy}%` : '—'}
          label="AVG ACCURACY"
        />
        <StatCard
          value={analytics.streak > 0 ? `${analytics.streak}🔥` : '—'}
          label="STREAK"
          color={isDark ? '#fbbf24' : '#b45309'}
        />
        <StatCard
          value={activeDays > 0 ? String(activeDays) : '—'}
          label="ACTIVE DAYS"
          color={isDark ? '#4ade80' : '#16a34a'}
        />
      </View>

      {/* Weekly chart */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>This Week</Text>
        <WeeklyChart data={analytics.weeklyData} />
      </View>

      {/* Subject mastery */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Subject Mastery</Text>
        <Text style={{ paddingHorizontal: 0, paddingBottom: 4, fontSize: 11, color: t.textTertiary }}>
          scope: {activeSlug === 'overall' ? 'Overall' : (focusListings.find(l => l.slug === activeSlug)?.title ?? activeSlug)}
        </Text>
        <SubjectAccordion
          groups={subjectGroups}
          emptyText={
            analytics.topicMastery.length > 0
              ? "Practice individual topics to see subject-grouped mastery"
              : "Start practicing to see mastery analytics"
          }
          initiallyExpanded="first"
          keyExtractor={(topic) => topic.id}
          renderRow={(row) => (
            <View style={s.masteryRow}>
              <Text style={s.masteryLabel} numberOfLines={1}>{row.name}</Text>
              <View style={s.masteryBarBg}>
                <View style={[s.masteryBarFill, { width: `${row.accuracy}%` as any, backgroundColor: row.accuracy != null && row.accuracy >= 80 ? '#4ade80' : row.accuracy != null && row.accuracy >= 50 ? '#fbbf24' : '#f87171' }]} />
              </View>
              <Text style={s.masteryPct}>{row.accuracy ?? 0}%</Text>
            </View>
          )}
        />
      </View>

      {/* Recent sessions */}
      {analytics.recentSessions.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent Sessions</Text>
          {analytics.recentSessions.map((rs, i) => (
            <View key={rs.id} style={[s.recentRow, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.recentTitle} numberOfLines={1}>{rs.title}</Text>
                <Text style={s.recentDate}>{fmtDate(rs.completedAt)}</Text>
              </View>
              <View style={[s.recentBadge, { backgroundColor: rs.accuracy >= 80 ? 'rgba(34,197,94,0.12)' : rs.accuracy >= 60 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)', borderColor: rs.accuracy >= 80 ? 'rgba(34,197,94,0.25)' : rs.accuracy >= 60 ? 'rgba(245,158,11,0.22)' : 'rgba(239,68,68,0.22)' }]}>
                <Text style={[s.recentBadgeTxt, { color: rs.accuracy >= 80 ? '#4ade80' : rs.accuracy >= 60 ? '#fbbf24' : '#f87171' }]}>{rs.accuracy}%</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {analytics.sessionCount === 0 && !analytics.isLoading && (
        <View style={s.emptyState}>
          <Text style={s.emptyTitle}>No sessions yet</Text>
          <Text style={s.emptySub}>Complete a quiz to see your analytics here.</Text>
        </View>
      )}
    </>
  )

  if (scrollable) {
    return (
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.accent}
            colors={[t.accent]}
            progressBackgroundColor={t.surface}
          />
        }
      >
        {content}
        <View style={{ height: 120 }} />
      </ScrollView>
    )
  }

  return <View>{content}</View>
}
