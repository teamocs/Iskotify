import { useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useFocusListings } from '../../hooks/useFocusListings'
import { useSubjectReadiness } from '../../hooks/useSubjectReadiness'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { isSchoolFocusSlug } from '../../utils/focusSlug'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing, textStyle } from '../../theme/tokens'
import { Card } from '../ui/Card'
import { FilterChip } from '../ui/Chip'
import { StatNumber } from '../ui/StatNumber'
import { ProgressBar } from '../ui/ProgressBar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { TwoColumn } from '../ui/TwoColumn'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { ProgressSection } from './ProgressSection'
import { SubjectReadinessList } from './SubjectReadinessList'
import { WeeklyChart } from './WeeklyChart'
import { TrendLineChart } from './TrendLineChart'
import type { ResolvedMissedTopic, MockAttemptScore } from '../../services/analyticsAggregates'

/** Formats elapsedMs as "42s" or "1m 08s" for the Pace section. */
function fmtDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function missedTopicHref(topicId: string, listingSlug: string): string {
  return listingSlug ? `/practice/${topicId}?listingSlug=${encodeURIComponent(listingSlug)}` : `/practice/${topicId}`
}

const SHORT_DATE = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
const fmtDate = (ts: number) => SHORT_DATE.format(new Date(ts))

function accuracyTone(pct: number): 'success' | 'warning' | 'danger' {
  return pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'danger'
}

/** A row that separates itself from the one above with a hairline. */
function Row({ first, children }: { first: boolean; children: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingVertical: spacing.sm,
        borderTopWidth: first ? 0 : 1, borderTopColor: t.divider,
      }}
    >
      {children}
    </View>
  )
}

interface Props {
  initialFilter?: string | 'overall'
  /** When true (default), wraps in its own ScrollView with pull-to-refresh. */
  scrollable?: boolean
}

/**
 * Progress: readiness and analytics (redesign M2). Summary numbers first as
 * tabular StatNumbers, then the charts and readiness side by side on
 * expanded widths; secondary detail sits behind disclosures.
 */
export function AnalyticsDashboard({ initialFilter = 'overall', scrollable = true }: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const insets = useSafeInsets()
  const { focusListings } = useFocusListings()
  const [activeSlug, setActiveSlug] = useState<string | 'overall'>(initialFilter)
  const analytics = useAnalytics(activeSlug)
  const readiness = useSubjectReadiness()
  const { refresh } = analytics
  const [showAllSessions, setShowAllSessions] = useState(false)

  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await Promise.all([refresh(), readiness.refresh()]) } finally { setRefreshing(false) }
  }, [refresh, readiness])

  const examFilters = focusListings.filter(fl => !isSchoolFocusSlug(fl.slug))
  const scopeTitle = activeSlug === 'overall'
    ? 'All exams'
    : (focusListings.find(l => l.slug === activeSlug)?.title ?? activeSlug)

  const activeDays = analytics.weeklyData.filter(d => d.sessionCount > 0).length
  const weekWithAcc = analytics.weeklyData.filter(d => d.accuracy !== null)
  const weekAvg = weekWithAcc.length > 0
    ? Math.round(weekWithAcc.reduce((sum, d) => sum + (d.accuracy ?? 0), 0) / weekWithAcc.length)
    : null

  const trendKnown = analytics.accuracyTrend.filter(p => p.accuracy !== null)
  const paceSummary = analytics.avgTime.overallAvgMs !== null
    ? `${fmtDuration(analytics.avgTime.overallAvgMs)} per question`
    : 'No timed questions yet'
  const mistakesSummary = analytics.mostMissedTopics.length > 0
    ? `${analytics.mostMissedTopics.length} area${analytics.mostMissedTopics.length !== 1 ? 's' : ''} to review`
    : 'No mistakes tracked yet'
  const latestMock = analytics.mockAttemptHistory[analytics.mockAttemptHistory.length - 1]

  const TOP_N = 3
  const sessions = showAllSessions ? analytics.recentSessions : analytics.recentSessions.slice(0, TOP_N)
  const hiddenCount = analytics.recentSessions.length - TOP_N

  const filters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Show progress for"
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
      style={{ flexGrow: 0, marginBottom: spacing.lg }}
    >
      <FilterChip label="Overall" selected={activeSlug === 'overall'} onPress={() => setActiveSlug('overall')} />
      {examFilters.map(fl => (
        <FilterChip key={fl.slug} label={fl.title} selected={activeSlug === fl.slug} onPress={() => setActiveSlug(fl.slug)} />
      ))}
    </ScrollView>
  )

  let content: React.ReactNode
  if (analytics.isLoading && analytics.sessionCount === 0) {
    content = (
      <View style={{ gap: spacing.lg }}>
        <Skeleton accessible label="Loading your progress" height={96} />
        <Skeleton height={160} />
        <Skeleton height={120} />
      </View>
    )
  } else if (analytics.error && analytics.sessionCount === 0) {
    content = <ErrorState title="Couldn't load your progress" onRetry={() => void refresh()} />
  } else if (analytics.sessionCount === 0) {
    content = (
      <Card>
        <EmptyState
          title="No practice yet"
          body="Finish a quiz or a mock exam and your accuracy, pace and readiness show up here."
          actionLabel="Start practicing"
          onAction={() => router.push('/(tabs)/practice')}
        />
      </Card>
    )
  } else {
    const twoUp = bp !== 'compact'
    const stat = { flexBasis: twoUp ? '22%' : '45%', flexGrow: 1 } as const
    content = (
      <View style={{ gap: spacing.xxl }}>
        {/* Summary: four numbers that matter, tabular so they don't jitter. */}
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, columnGap: spacing.md }}>
            <View style={stat}><StatNumber value={analytics.sessionCount} label="Sessions" /></View>
            <View style={stat}>
              <StatNumber value={analytics.avgAccuracy !== null ? `${analytics.avgAccuracy}%` : '—'} label="Average accuracy" />
            </View>
            <View style={stat}>
              <StatNumber
                value={analytics.streak}
                unit={analytics.streak === 1 ? 'day' : 'days'}
                label="Day streak"
              />
            </View>
            <View style={stat}><StatNumber value={activeDays} label="Active days this week" /></View>
          </View>
        </Card>

        <TwoColumn
          primary={
            <View style={{ gap: spacing.xxl }}>
              <ProgressSection title="Readiness by subject" summary="Lowest first. Tap one to take its diagnostic.">
                <SubjectReadinessList {...readiness} />
              </ProgressSection>

              <ProgressSection
                title="This week"
                summary={weekAvg !== null ? `Average ${weekAvg}% on ${activeDays} day${activeDays === 1 ? '' : 's'}` : 'No practice yet this week'}
              >
                <WeeklyChart data={analytics.weeklyData} />
              </ProgressSection>

              <ProgressSection
                title="Progress trend"
                summary={trendKnown.length > 0 ? `Last ${analytics.accuracyTrend.length} weeks` : 'No activity yet'}
              >
                <TrendLineChart points={analytics.accuracyTrend} />
              </ProgressSection>

              <ProgressSection title="Topics you've practiced" summary={scopeTitle}>
                {analytics.topicMastery.length > 0 ? (
                  analytics.topicMastery.map((m, i) => (
                    <View key={`${m.label}-${i}`} style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
                      <View style={{ flexDirection: 'row', gap: spacing.md }}>
                        <Text style={[textStyle('body', t.textPrimary), { flex: 1 }]} numberOfLines={2} maxFontSizeMultiplier={2}>
                          {m.label}
                        </Text>
                        <Text style={[textStyle('label', t.textPrimary), { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={1.5}>
                          {m.accuracy}%
                        </Text>
                      </View>
                      <ProgressBar value={m.accuracy / 100} label={`${m.label} accuracy`} tone={accuracyTone(m.accuracy)} />
                    </View>
                  ))
                ) : (
                  <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
                    Practice individual topics to see them here.
                  </Text>
                )}
              </ProgressSection>
            </View>
          }
          secondary={
            <View style={{ gap: spacing.xxl }}>
              <ProgressSection title="Pace" summary={paceSummary} collapsible>
                {analytics.avgTime.overallAvgMs !== null ? (
                  <View style={{ gap: spacing.sm }}>
                    <StatNumber
                      value={fmtDuration(analytics.avgTime.overallAvgMs)}
                      label={`Average per question, ${analytics.avgTime.overallCount} timed`}
                    />
                    <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={2}>
                      Includes time spent revisiting a question.
                    </Text>
                    {analytics.avgTime.bySubject.map((sub, i) => (
                      <Row key={sub.subject} first={i === 0}>
                        <Text style={[textStyle('body', t.textPrimary), { flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={2}>{sub.subject}</Text>
                        <Text style={[textStyle('label', t.textPrimary), { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={1.5}>
                          {fmtDuration(sub.avgMs)}
                        </Text>
                      </Row>
                    ))}
                  </View>
                ) : (
                  <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
                    Complete a timed quiz to see your pace here.
                  </Text>
                )}
              </ProgressSection>

              <ProgressSection title="Most common mistakes" summary={mistakesSummary} collapsible>
                {analytics.mostMissedTopics.length > 0 ? (
                  analytics.mostMissedTopics.map((m: ResolvedMissedTopic, i: number) => {
                    // Wrong answers and skips are reported separately — a skip isn't a conceptual error.
                    const detail = `${m.wrongCount} wrong${m.skipCount > 0 ? `, ${m.skipCount} skipped` : ''}`
                    const inner = (
                      <>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={2}>{m.label}</Text>
                          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{detail}</Text>
                        </View>
                        {m.destination ? (
                          <View {...decorative} style={{ transform: [{ scaleX: -1 }] }}>
                            <Lineicons icon={ChevronLeftOutlined} size={16} color={t.textTertiary} />
                          </View>
                        ) : null}
                      </>
                    )
                    if (!m.destination) return <Row key={m.groupKey} first={i === 0}>{inner}</Row>
                    const dest = m.destination
                    return (
                      <Pressable
                        key={m.groupKey}
                        onPress={() => router.push(missedTopicHref(dest.topicId, dest.listingSlug) as never)}
                        accessibilityRole="button"
                        accessibilityLabel={`Review ${m.label}, ${detail}`}
                        style={(state) => {
                          const { pressed, hovered, focused } = state as WebPressableState
                          return [
                            {
                              flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm,
                              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
                              backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                            },
                            focusRing(t.focusRing, focused),
                          ]
                        }}
                      >
                        {inner}
                      </Pressable>
                    )
                  })
                ) : (
                  <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
                    No mistakes tracked yet. Keep practicing.
                  </Text>
                )}
              </ProgressSection>

              {/* Mock score history: score bands from full mocks — no percentile, no cut-off verdict. */}
              {latestMock ? (
                <ProgressSection
                  title="Mock score history"
                  summary={`Latest: ${latestMock.band} (${latestMock.pct}% raw)`}
                  collapsible
                >
                  {analytics.mockAttemptHistory.slice(-8).reverse().map((mh: MockAttemptScore, i: number) => (
                    <Row key={`${mh.listingSlug}-${mh.completedAt}`} first={i === 0}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={1} maxFontSizeMultiplier={2}>{mh.band}</Text>
                        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{fmtDate(mh.completedAt)}</Text>
                      </View>
                      <Text style={[textStyle('label', t.textPrimary), { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={1.5}>
                        {mh.pct}% raw
                      </Text>
                    </Row>
                  ))}
                </ProgressSection>
              ) : null}

              {analytics.recentSessions.length > 0 ? (
                <ProgressSection
                  title="Recent sessions"
                  summary={`Last one ${fmtDate(analytics.recentSessions[0]!.completedAt)}`}
                  collapsible
                >
                  {sessions.map((rs, i) => (
                    <Row key={rs.id} first={i === 0}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={1} maxFontSizeMultiplier={2}>{rs.title}</Text>
                        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{fmtDate(rs.completedAt)}</Text>
                      </View>
                      <Badge label={`${rs.accuracy}%`} tone={accuracyTone(rs.accuracy)} />
                    </Row>
                  ))}
                  {!showAllSessions && hiddenCount > 0 ? (
                    <Button
                      label={`Show ${hiddenCount} more`}
                      variant="ghost"
                      size="sm"
                      onPress={() => setShowAllSessions(true)}
                    />
                  ) : null}
                </ProgressSection>
              ) : null}
            </View>
          }
        />
      </View>
    )
  }

  const body = (
    <>
      {filters}
      {content}
    </>
  )

  if (!scrollable) return <View>{body}</View>

  const bottomBar = !(bp === 'expanded')
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + (bottomBar ? layout.tabBarClearance : spacing.xxl) }}
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
      {body}
    </ScrollView>
  )
}
