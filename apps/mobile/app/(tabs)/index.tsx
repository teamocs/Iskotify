import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, RefreshControl, Platform } from 'react-native'
// logo.svg has no viewBox attribute (2048×2048 canvas) — pass viewBox explicitly at the call site so it scales.
import Logo from '../../assets/images/logo.svg'
import { Screen } from '../../components/ui/Screen'
import { TwoColumn } from '../../components/ui/TwoColumn'
import { WebRefreshButton } from '../../components/ui/WebRefreshButton'
import { decorative } from '../../components/ui/a11y'
import { TodayHeader } from '../../components/home/TodayHeader'
import { RemindersSheet } from '../../components/home/RemindersSheet'
import { NextStepCard } from '../../components/home/NextStepCard'
import { TodaysPlanFold } from '../../components/home/TodaysPlanFold'
import { FocusExamsFold } from '../../components/home/FocusExamsFold'
import { NewsAndDates } from '../../components/home/NewsAndDates'
import { ScholarshipProfilePrompt } from '../../components/home/ScholarshipProfilePrompt'
import { spacing, textStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useHomeStats } from '../../hooks/useHomeStats'
import { usePracticeData } from '../../hooks/usePracticeData'
import { useFocusListings } from '../../hooks/useFocusListings'
import { useHomeCatalog } from '../../hooks/useHomeCatalog'
import { useNotifications } from '../../hooks/useNotifications'
import { useStudyPlan } from '../../hooks/useStudyPlan'
import { useDb } from '../../hooks/useDb'
import { useSyncStatus } from '../../hooks/useSyncStatus'
import { pickNextStep } from '../../utils/todayNextStep'
import { reviewContentSlugs } from '../../services/practiceSignals'
import { invalidate } from '../../services/queryCache'
import { syncOnLaunch } from '../../services/sync'
import { admissionsUpdates as admissionsUpdatesTable } from '../../db/schema'
import type { FeedItem } from '../../utils/admissionsFeed'

type LoadStatus = 'loading' | 'ready' | 'error'

/**
 * Today (redesign M2, direction C "One Next Step"). Answers "what should I do
 * now?" before anything else: one hero next step carrying the screen's only
 * primary action, then the plan, the exam countdown and what's coming up.
 * On expanded widths the plan and the exams sit side by side.
 *
 * Owned elsewhere now: readiness → Progress, scholarships and quick links →
 * Explore, the Estimated Admission Score → Practice, settings → Profile.
 */
export default function TodayScreen() {
  const stats = useHomeStats()
  const { fullName, focusedListings, noteReminders, listingAccuracy, streakDays } = stats
  const { topicRows } = usePracticeData()
  const { addListing } = useFocusListings()
  const catalog = useHomeCatalog()
  const db = useDb()
  const studyPlan = useStudyPlan()
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const topicNameById = useMemo(
    () => new Map(topicRows.map(r => [r.topic.id, r.topic.name])),
    [topicRows],
  )
  // Exams with flashcard topics to review: practice exists even without a mock.
  // From the DB (hasReviewContent), the same source the listing, school and
  // diagnostic pages use. null until known.
  const reviewCandidates = useMemo(
    () => [...new Set([...focusedListings.map(l => l.slug), ...catalog.examListings.map(l => l.slug)])].sort().join('|'),
    [focusedListings, catalog.examListings],
  )
  const [reviewSlugs, setReviewSlugs] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => {
    let cancelled = false
    // A new set of exams: availability is unknown again until it loads (never the old set's answer).
    setReviewSlugs(null)
    reviewContentSlugs(db, reviewCandidates ? reviewCandidates.split('|') : [])
      .then(set => { if (!cancelled) setReviewSlugs(set) })
      .catch(e => {
        console.warn('[today/reviewSlugs] load failed:', e)
        if (!cancelled) setReviewSlugs(new Set())
      })
    return () => { cancelled = true }
  }, [db, reviewCandidates])

  // ── Admissions feed (for "Coming up") ───────────────────────────────────────
  const [admissionItems, setAdmissionItems] = useState<FeedItem[]>([])
  const [admissionsStatus, setAdmissionsStatus] = useState<LoadStatus>('loading')
  const [admissionsKey, setAdmissionsKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await db.select().from(admissionsUpdatesTable)
        if (cancelled) return
        setAdmissionItems(rows.map(r => ({
          id: r.id,
          reportDate: r.reportDate ?? '',
          severity: r.severity,
          title: r.title,
          body: r.body,
          eventDate: r.eventDate ?? null,
          eventType: r.eventType ?? null,
          schoolSlug: r.schoolSlug ?? null,
          schoolName: r.schoolName ?? null,
          actionRequired: r.actionRequired ?? null,
          sources: r.sources,
        })))
        setAdmissionsStatus('ready')
      } catch (e) {
        console.warn('[today/admissions] load failed:', e)
        if (!cancelled) setAdmissionsStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [db, admissionsKey])
  const reloadAdmissions = useCallback(() => {
    setAdmissionsStatus('loading')
    setAdmissionsKey(k => k + 1)
  }, [])

  const { refresh: refreshStats } = stats
  const { refresh: refreshCatalog } = catalog
  const { refresh: refreshPlan } = studyPlan
  const reloadAll = useCallback(async () => {
    invalidate('home:')
    reloadAdmissions()
    await Promise.all([refreshStats(), refreshCatalog(), refreshPlan()])
  }, [refreshStats, refreshCatalog, refreshPlan, reloadAdmissions])

  // Native pull-to-refresh re-reads local data; the web button also syncs
  // first (RefreshControl is dead on web).
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await reloadAll() } finally { setRefreshing(false) }
  }, [reloadAll])

  const sync = useSyncStatus()
  const webRefresh = useCallback(async () => {
    if (refreshing || sync.isSyncing) return
    setRefreshing(true)
    try {
      await syncOnLaunch(db)
      await reloadAll()
    } catch (e) {
      console.warn('[today] webRefresh error:', e)
    } finally {
      setRefreshing(false)
    }
  }, [db, refreshing, sync.isSyncing, reloadAll])

  const retryExams = useCallback(() => { void Promise.all([refreshStats(), refreshCatalog()]) }, [refreshStats, refreshCatalog])

  // ── Study reminders ─────────────────────────────────────────────────────────
  const { enabled: remindersOn, schedule: scheduleReminders, toggle: toggleReminders } = useNotifications()
  const [remindersOpen, setRemindersOpen] = useState(false)

  // Reminder copy is fixed (services/notifications.ts) — it must not depend on
  // the plan or streak, so it only reschedules when the focus list changes.
  useEffect(() => {
    if (focusedListings.length === 0) return
    void scheduleReminders(focusedListings)
  }, [focusedListings, scheduleReminders])

  const nextStep = pickNextStep({
    items: studyPlan.items,
    loading: studyPlan.loading,
    error: !!studyPlan.error,
    tomorrowItemCount: studyPlan.tomorrowItemCount,
    topicNameById,
  })

  const isDesktopWeb = Platform.OS === 'web' && bp === 'expanded'

  return (
    <Screen
      tabBarInset
      width={bp === 'expanded' ? 'wide' : 'reading'}
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
      <TodayHeader
        fullName={fullName}
        streakDays={streakDays}
        remindersOn={remindersOn}
        onOpenReminders={() => setRemindersOpen(true)}
        refreshControl={<WebRefreshButton onRefresh={webRefresh} refreshing={refreshing} iconOnly={bp === 'compact'} />}
      />

      <TwoColumn
        gap={spacing.xxl}
        primary={
          <View style={{ gap: spacing.xxl }}>
            <NextStepCard step={nextStep} onRetry={() => void refreshPlan()} />
            {studyPlan.loading ? null : (
              <TodaysPlanFold
                items={studyPlan.items}
                topicNameById={topicNameById}
                onMarkComplete={(id) => void studyPlan.markComplete(id)}
              />
            )}
          </View>
        }
        secondary={
          <View style={{ gap: spacing.xxl }}>
            <FocusExamsFold
              focusedListings={focusedListings}
              examListings={catalog.examListings}
              blueprintSlugs={catalog.blueprintSlugs}
              reviewSlugs={reviewSlugs ?? undefined}
              availabilityKnown={catalog.loaded && reviewSlugs !== null}
              blueprintInfo={catalog.blueprintInfo}
              listingMockBest={catalog.listingMockBest}
              listingAccuracy={listingAccuracy}
              onAddListing={addListing}
              loading={!!stats.loading}
              error={!!stats.error || !!catalog.error}
              onRetry={retryExams}
            />
            <NewsAndDates
              focusedListings={focusedListings}
              noteReminders={noteReminders}
              admissionItems={admissionItems}
              hasAnyFocus={focusedListings.length > 0}
              admissionsStatus={admissionsStatus}
              onRetry={reloadAdmissions}
            />
            {/* Last, and quiet: what the short onboarding no longer asks (P4). */}
            <ScholarshipProfilePrompt />
          </View>
        }
      />

      {/* Sign-off: the brand lives here (and in the desktop sidebar), not as a header tile. */}
      <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxxl, paddingBottom: spacing.lg }}>
        {isDesktopWeb ? null : (
          <View {...decorative} style={{ opacity: 0.9 }}>
            <Logo width={28} height={28} viewBox="0 0 2048 2048" />
          </View>
        )}
        <Text style={[textStyle('bodySm', t.textSecondary), { textAlign: 'center' }]} maxFontSizeMultiplier={2}>
          Para sa mga Iskolar ng Bayan
        </Text>
      </View>

      <RemindersSheet
        visible={remindersOpen}
        enabled={remindersOn}
        onToggle={() => void toggleReminders(focusedListings)}
        onClose={() => setRemindersOpen(false)}
      />
    </Screen>
  )
}
