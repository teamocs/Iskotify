import { useState, useCallback } from 'react'
import { View, ScrollView, RefreshControl, Platform } from 'react-native'
import Animated, { useAnimatedRef } from 'react-native-reanimated'
import { useScrollToTopOnReselect, useTabBarScrollHandler } from '../navigation/TabBarScrollContext'
import { useBandScrollY } from '../navigation/LargeTitleHeader'
import { usesSystemTabBar } from '../navigation/systemTabBar'
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
import { layout, spacing } from '../../theme/tokens'
import { Card } from '../ui/Card'
import { FilterChip } from '../ui/Chip'
import { StatNumber } from '../ui/StatNumber'
import { ProgressBar } from '../ui/ProgressBar'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { TwoColumn } from '../ui/TwoColumn'
import { Text } from '../ui/Text'
import { PressableScale } from '../ui/Pressable'
import { decorative, focusRing } from '../ui/a11y'
import { ProgressSection } from './ProgressSection'
import { SubjectReadinessList } from './SubjectReadinessList'
import { WeeklyChart } from './WeeklyChart'
import { TrendLineChart } from './TrendLineChart'
import { ExamReadinessCard } from './ExamReadinessCard'
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

/** A row that separates itself from the one above with a hairline. */
function Row({ first, children }: { first: boolean; children: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: layout.rowMinHeight + 4, paddingVertical: spacing.sm,
        borderTopWidth: first ? 0 : 1, borderTopColor: t.divider,
      }}
    >
      {children}
    </View>
  )
}

/** A trailing number in a row: tabular, so a column of them lines up. */
function RowNumber({ children }: { children: React.ReactNode }) {
  return (
    <Text role="headline" maxFontSizeMultiplier={1.5} style={{ fontVariant: ['tabular-nums'] }}>
      {children}
    </Text>
  )
}

interface Props {
  initialFilter?: string | 'overall'
  /** When true (default), wraps in its own ScrollView with pull-to-refresh. */
  scrollable?: boolean
  /** A large-title header scrolled with the content (Progress), so it
   *  collapses into the screen band like Today does. */
  header?: React.ReactNode
}

/**
 * Progress: readiness and analytics (redesign M2, iOS language P4). Exam
 * readiness rings first, then the habit tiles (tabular StatNumbers), study
 * time and readiness side by side on expanded widths; secondary detail sits
 * behind disclosures. Every figure is a neutral number: no verdict, no
 * pass/fail band, no pace status (owner, 2026-10-13).
 */
export function AnalyticsDashboard({ initialFilter = 'overall', scrollable = true, header }: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const insets = useSafeInsets()
  // The floating bar shows everywhere but beside the desktop sidebar.
  const bottomBar = !(Platform.OS === 'web' && bp === 'expanded')
  // The band host's scrollY (Progress's Screen) drives the collapsed title.
  const bandY = useBandScrollY()
  const onScroll = useTabBarScrollHandler({ localY: bandY })
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  useScrollToTopOnReselect(scrollRef)
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
  const weekMinutes = analytics.weeklyData.reduce((sum, d) => sum + (d.minutes ?? 0), 0)

  const trendKnown = analytics.accuracyTrend.filter(p => p.accuracy !== null)
  const paceSummary = analytics.avgTime.overallAvgMs !== null
    ? `${fmtDuration(analytics.avgTime.overallAvgMs)} per question`
    : 'No timed questions yet'
  const mistakesSummary = analytics.mostMissedTopics.length > 0
    ? `${analytics.mostMissedTopics.length} area${analytics.mostMissedTopics.length !== 1 ? 's' : ''} to review`
    : 'No mistakes tracked yet'
  const latestMock = analytics.mockAttemptHistory[analytics.mockAttemptHistory.length - 1]
  const examAccuracy = analytics.examAccuracy ?? {}
  const examRings = examFilters.map(fl => ({ slug: fl.slug, title: fl.title, pct: examAccuracy[fl.slug] ?? null }))

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
    const tile = { flexBasis: twoUp ? '22%' : '45%', flexGrow: 1 } as const
    content = (
      <View style={{ gap: spacing.xxl }}>
        {examRings.length > 0 ? <ExamReadinessCard items={examRings} /> : null}

        {/* Habit tiles: real counts only, tabular so they don't jitter. */}
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, columnGap: spacing.md }}>
            <View testID="habit-tile" style={tile}>
              <StatNumber
                value={analytics.streak}
                unit={analytics.streak === 1 ? 'day' : 'days'}
                label="Day streak"
              />
            </View>
            <View testID="habit-tile" style={tile}><StatNumber value={analytics.sessionCount} label="Sessions" /></View>
            <View testID="habit-tile" style={tile}><StatNumber value={activeDays} label="Active days this week" /></View>
            <View testID="habit-tile" style={tile}>
              <StatNumber value={analytics.avgAccuracy !== null ? `${analytics.avgAccuracy}%` : '–'} label="Average accuracy" />
            </View>
          </View>
        </Card>

        <TwoColumn
          primary={
            <View style={{ gap: spacing.xxl }}>
              <ProgressSection
                title="Study time"
                summary={weekMinutes > 0 ? `${weekMinutes} minute${weekMinutes === 1 ? '' : 's'} in the last 7 days` : 'No practice yet this week'}
              >
                <WeeklyChart data={analytics.weeklyData} />
              </ProgressSection>

              <ProgressSection title="Readiness by subject" summary="Lowest first. Tap one to take its diagnostic.">
                <SubjectReadinessList {...readiness} />
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
                        <Text role="body" numberOfLines={2} style={{ flex: 1 }}>
                          {m.label}
                        </Text>
                        <RowNumber>{`${m.accuracy}%`}</RowNumber>
                      </View>
                      <ProgressBar value={m.accuracy / 100} label={`${m.label} accuracy`} tone="accent" />
                    </View>
                  ))
                ) : (
                  <Text role="footnote" color={t.textSecondary}>
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
                    <Text role="caption" color={t.textSecondary}>
                      Includes time spent revisiting a question.
                    </Text>
                    {analytics.avgTime.bySubject.map((sub, i) => (
                      <Row key={sub.subject} first={i === 0}>
                        <Text role="body" numberOfLines={1} style={{ flex: 1 }}>{sub.subject}</Text>
                        <RowNumber>{fmtDuration(sub.avgMs)}</RowNumber>
                      </Row>
                    ))}
                  </View>
                ) : (
                  <Text role="footnote" color={t.textSecondary}>
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
                          <Text role="headline" numberOfLines={2}>{m.label}</Text>
                          <Text role="footnote" color={t.textSecondary}>{detail}</Text>
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
                      <PressableScale
                        key={m.groupKey}
                        onPress={() => router.push(missedTopicHref(dest.topicId, dest.listingSlug) as never)}
                        accessibilityRole="button"
                        accessibilityLabel={`Review ${m.label}, ${detail}`}
                        style={({ pressed, hovered, focused }) => [
                          {
                            flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: layout.rowMinHeight + 12, paddingVertical: spacing.sm,
                            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
                            backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                          },
                          focusRing(t.focusRing, focused),
                        ]}
                      >
                        {inner}
                      </PressableScale>
                    )
                  })
                ) : (
                  <Text role="footnote" color={t.textSecondary}>
                    No mistakes tracked yet. Keep practicing.
                  </Text>
                )}
              </ProgressSection>

              {/* Mock score history: raw % correct per full mock. No band, no percentile, no verdict. */}
              {latestMock ? (
                <ProgressSection
                  title="Mock score history"
                  summary={`Latest ${latestMock.pct}%`}
                  collapsible
                >
                  {analytics.mockAttemptHistory.slice(-8).reverse().map((mh: MockAttemptScore, i: number) => (
                    <Row key={`${mh.listingSlug}-${mh.completedAt}`} first={i === 0}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text role="headline" numberOfLines={1}>Full mock</Text>
                        <Text role="footnote" color={t.textSecondary}>{fmtDate(mh.completedAt)}</Text>
                      </View>
                      <RowNumber>{`${mh.pct}%`}</RowNumber>
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
                        <Text role="headline" numberOfLines={1}>{rs.title}</Text>
                        <Text role="footnote" color={t.textSecondary}>{fmtDate(rs.completedAt)}</Text>
                      </View>
                      <RowNumber>{`${rs.accuracy}%`}</RowNumber>
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
      {header}
      {filters}
      {content}
    </>
  )

  if (!scrollable) return <View>{body}</View>

  return (
    <Animated.ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      // Feeds the floating tab bar (minimize on scroll).
      onScroll={onScroll}
      scrollEventThrottle={16}
      // iOS: the system tab bar insets this (the tab's first) scroll view.
      contentContainerStyle={{
        paddingBottom: usesSystemTabBar() ? spacing.xxl : insets.bottom + (bottomBar ? layout.capsuleClearance : spacing.xxl),
      }}
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
    </Animated.ScrollView>
  )
}
