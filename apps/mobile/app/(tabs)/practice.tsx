import { useState, useCallback, useMemo, useEffect } from 'react'
import { View, Text, Pressable, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Search1Outlined, Calculator1Outlined, Notebook1Outlined, ClipboardOutlined,
  FileQuestionOutlined, Books2Outlined,
} from '@lineiconshq/free-icons'
import { TabHeader } from '../../components/TabHeader'
import { usePracticeData, type TopicRow } from '../../hooks/usePracticeData'
import { useFocusListings } from '../../hooks/useFocusListings'
import { useDb } from '../../hooks/useDb'
import { useSavedDecks, type SavedDeck } from '../../hooks/useSavedDecks'
import { useExamRunPersistence } from '../../hooks/useExamRunPersistence'
import { listPublishedBlueprints, type PublishedBlueprint } from '../../services/examBlueprints'
import { cachedQuery, invalidate, subscribe } from '../../services/queryCache'
import { getTopicBestSessionPercentages, getSubjectSessionPercentages } from '../../services/homeAggregates'
import { getDueCounts, type DueCounts } from '../../services/srsAggregates'
import { syncOnLaunch } from '../../services/sync'
import { orderBlueprintsForUser } from '../../utils/examBuilder'
import { subjectsToImprove } from '../../utils/subjectsToImprove'
import { runKeyFor } from '../../utils/examRunPersistence'
import { pickNextPractice, nextPracticeCopy, type NextPracticeInput } from '../../utils/nextPracticeAction'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Screen } from '../../components/ui/Screen'
import { TwoColumn } from '../../components/ui/TwoColumn'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { ListRow } from '../../components/ui/ListRow'
import { StatNumber } from '../../components/ui/StatNumber'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { WebRefreshButton } from '../../components/ui/WebRefreshButton'
import { focusRing, type WebPressableState } from '../../components/ui/a11y'
import { NextStepCard } from '../../components/practice/NextStepCard'
import { DeckRow } from '../../components/practice/DeckRow'
import { PracticeSearchSheet, NewDeckSheet, type SearchEntry } from '../../components/practice/PracticeSheets'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { confirmAction } from '../../utils/confirmAction'

// Practice tab — redesign M2, direction C ("One Next Step").
// Order of the page answers "what do I practise now?" before anything else:
//   1. Next step   — ONE action, the tab's only maroon button
//   2. Mock exams  — up to 4, focus exams first
//   3. Subjects    — A–Z, readiness as a number
//   4. Your decks  — saved topic bundles, with due counts
//   5. Tools       — Estimated Admission Score, Notes, Requirements
// Readiness grids and My Focus live on Today/Progress now (no duplication).

type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error' }

type InProgressRun = { slug: string; title: string; answered: number; total: number; updatedAt: number }

const CACHE_KEYS = ['practice:sessionReadiness', 'practice:dueCounts', 'practice:blueprints:list'] as const

function minutes(n: number): string {
  return n < 60 ? `${n} min` : `${Math.round((n / 60) * 10) / 10} h`
}

/** A bordered group for ListRows (hairline dividers, no nested cards). */
function RowGroup({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme()
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean)
  return (
    <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' }}>
      {items.map((child, i) => (
        <View key={i} style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: t.divider }}>{child}</View>
      ))}
    </View>
  )
}

function RowIcon({ icon }: { icon: Parameters<typeof Lineicons>[0]['icon'] }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Lineicons icon={icon} size={18} color={t.accentText} />
    </View>
  )
}

function SkeletonRows({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <View accessible accessibilityLabel={label} aria-busy style={{ gap: spacing.sm }}>
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} height={56} radius={radius.lg} />)}
    </View>
  )
}

export default function PracticeScreen() {
  const { theme: t } = useTheme()
  const db = useDb()
  const bp = useBreakpoint()
  const { subjects, topicRows, cardCountByTopic, topicIdsByListingSlug, refresh, loaded } = usePracticeData()
  const { focusListings } = useFocusListings()
  const { decks, createDeck, deleteDeck } = useSavedDecks()
  const { loadRun } = useExamRunPersistence()

  const [searchOpen, setSearchOpen] = useState(false)
  const [deckOpen, setDeckOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // ── Data ─────────────────────────────────────────────────────────────────
  // Each section owns its load state so one failure never blanks the page.

  const [readiness, setReadiness] = useState<Load<{ perTopicBest: Map<string, number>; subjectBest: Map<string, number> }>>({ status: 'loading' })
  const [readinessTry, setReadinessTry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setReadiness({ status: 'loading' })
    cachedQuery('practice:sessionReadiness', 30_000, () => Promise.all([
      getTopicBestSessionPercentages(db),
      getSubjectSessionPercentages(db),
    ])).then(([topicBest, subjectBest]) => {
      if (!cancelled) {
        setReadiness({
          status: 'ready',
          data: {
            perTopicBest: new Map(topicBest.map(r => [r.topicId, r.bestPct])),
            subjectBest: new Map(subjectBest.map(r => [r.subject, r.bestPct])),
          },
        })
      }
    }).catch(e => {
      console.warn('[practice/sessionReadiness] load failed:', e)
      if (!cancelled) setReadiness({ status: 'error' })
    })
    return () => { cancelled = true }
  }, [db, reloadKey, readinessTry])

  // Due counts feed the next step and deck badges; a failure just hides them.
  const [dueCounts, setDueCounts] = useState<DueCounts | null>(null)
  useEffect(() => {
    let cancelled = false
    cachedQuery('practice:dueCounts', 30_000, () => getDueCounts(db))
      .then(c => { if (!cancelled) setDueCounts(c) })
      .catch(e => {
        console.warn('[practice/dueCounts] load failed:', e)
        if (!cancelled) setDueCounts({ total: 0, byTopic: {} })
      })
    return () => { cancelled = true }
  }, [db, reloadKey])

  const [blueprints, setBlueprints] = useState<Load<PublishedBlueprint[]>>({ status: 'loading' })
  const [blueprintsTry, setBlueprintsTry] = useState(0)
  useEffect(() => {
    let cancelled = false
    function pull() {
      return cachedQuery('practice:blueprints:list', 30_000, () => listPublishedBlueprints(db))
        .then(data => { if (!cancelled) setBlueprints({ status: 'ready', data }) })
        .catch(e => {
          console.warn('[practice/blueprints] load failed:', e)
          if (!cancelled) setBlueprints({ status: 'error' })
        })
    }
    setBlueprints({ status: 'loading' })
    void pull()
    // Re-pull after a sync invalidates the practice cache.
    const unsub = subscribe('practice:blueprints:', () => { void pull() })
    return () => { cancelled = true; unsub() }
  }, [db, reloadKey, blueprintsTry])

  const focusSlugs = useMemo(() => focusListings.map(f => f.slug), [focusListings])
  const orderedBlueprints = useMemo(
    () => (blueprints.status === 'ready' ? orderBlueprintsForUser(blueprints.data, focusSlugs) : []),
    [blueprints, focusSlugs],
  )
  const focusBlueprint = useMemo(
    () => orderedBlueprints.find(b => focusSlugs.includes(b.slug)) ?? null,
    [orderedBlueprints, focusSlugs],
  )

  // Unfinished runs of ANY published mock. The most recently saved one takes
  // priority over everything else in the next step; every one gets an
  // "In progress" badge on its row.
  const [inProgress, setInProgress] = useState<Map<string, InProgressRun> | undefined>(undefined)
  const blueprintSlugsKey = orderedBlueprints.map(b => b.slug).join('|')
  useEffect(() => {
    if (blueprints.status === 'loading') return
    if (orderedBlueprints.length === 0) { setInProgress(new Map()); return }
    let cancelled = false
    Promise.all(orderedBlueprints.map(b =>
      loadRun(runKeyFor('exam', b.slug))
        .then(run => (run && run.questionIds.length > 0
          ? {
            slug: b.slug,
            title: b.acronym,
            answered: Object.keys(run.answers ?? {}).length,
            total: run.questionIds.length,
            updatedAt: run.updatedAt ?? 0,
          }
          : null))
        .catch(() => null),
    )).then(runs => {
      if (cancelled) return
      setInProgress(new Map(runs.filter((r): r is InProgressRun => r !== null).map(r => [r.slug, r])))
    })
    return () => { cancelled = true }
    // loadRun is a fresh closure per render (thin hook wrapper); the slugs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueprints.status, blueprintSlugsKey, reloadKey])

  const resume = useMemo<NextPracticeInput['resume'] | undefined>(() => {
    if (inProgress === undefined) return undefined
    let latest: InProgressRun | null = null
    for (const r of inProgress.values()) {
      if (!latest || r.updatedAt > latest.updatedAt) latest = r
    }
    return latest ? { slug: latest.slug, title: latest.title, answered: latest.answered, total: latest.total } : null
  }, [inProgress])

  // Weakest practised topic in the first focus exam's scope (all topics when no focus).
  const weakTopic = useMemo(() => {
    const scope = focusSlugs[0] ? new Set(topicIdsByListingSlug[focusSlugs[0]] ?? []) : null
    const pool = topicRows.filter(r => r.strength === 'Weak' && (!scope || scope.size === 0 || scope.has(r.topic.id)))
    pool.sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101))
    const w: TopicRow | undefined = pool[0]
    return w ? { id: w.topic.id, name: w.topic.name } : null
  }, [topicRows, topicIdsByListingSlug, focusSlugs])

  const nextCopy = useMemo(() => {
    if (dueCounts === null || resume === undefined || blueprints.status === 'loading') return null
    return nextPracticeCopy(pickNextPractice({
      resume,
      dueCount: dueCounts.total,
      weakTopic,
      focusMock: focusBlueprint
        ? { slug: focusBlueprint.slug, title: focusBlueprint.acronym, items: focusBlueprint.totalItems, minutes: focusBlueprint.totalTimeMinutes }
        : null,
    }))
  }, [dueCounts, resume, blueprints.status, weakTopic, focusBlueprint])

  // Subjects A–Z with session-based readiness (same maths as Subject details).
  const subjectRows = useMemo(() => {
    if (readiness.status !== 'ready') return []
    const pctById = new Map(
      subjectsToImprove(topicRows, subjects, readiness.data.perTopicBest, readiness.data.subjectBest).map(m => [m.id, m.pct]),
    )
    const topicCount = new Map<string, number>()
    const practised = new Set<string>()
    for (const r of topicRows) {
      topicCount.set(r.topic.subjectId, (topicCount.get(r.topic.subjectId) ?? 0) + 1)
      if (r.strength !== 'New' || readiness.data.perTopicBest.has(r.topic.id)) practised.add(r.topic.subjectId)
    }
    return subjects
      .filter(s => (topicCount.get(s.id) ?? 0) > 0)
      .map(s => ({
        id: s.id,
        name: s.name,
        topics: topicCount.get(s.id) ?? 0,
        pct: practised.has(s.id) || readiness.data.subjectBest.has(s.name) ? (pctById.get(s.id) ?? null) : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [readiness, topicRows, subjects])

  const searchEntries = useMemo<SearchEntry[]>(() => [
    ...subjects.map(s => ({ key: `subject:${s.id}`, type: 'Subject' as const, name: s.name, href: `/subjects/${s.id}` })),
    ...topicRows.map(r => ({ key: `topic:${r.topic.id}`, type: 'Topic' as const, name: r.topic.name, href: `/practice/${r.topic.id}` })),
    ...orderedBlueprints.map(b => ({ key: `mock:${b.slug}`, type: 'Mock exam' as const, name: `${b.acronym} · ${b.name}`, href: `/practice/exam/${b.slug}` })),
  ], [subjects, topicRows, orderedBlueprints])

  // ── Refresh ──────────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false)
  const reloadAll = useCallback(async (withSync: boolean) => {
    if (refreshing) return
    setRefreshing(true)
    try {
      if (withSync) await syncOnLaunch(db)
      CACHE_KEYS.forEach(k => invalidate(k))
      setReloadKey(k => k + 1)
      await refresh()
    } catch (e) {
      console.warn('[practice] refresh failed:', e)
    } finally {
      setRefreshing(false)
    }
  }, [db, refresh, refreshing])

  const refreshCtl = useMemo(() => (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => { void reloadAll(false) }}
      tintColor={t.accent}
      colors={[t.accent]}
      progressBackgroundColor={t.surface}
    />
  ), [refreshing, reloadAll, t.accent, t.surface])

  const deckTotal = (d: SavedDeck) => d.topicIds.reduce((n, id) => n + (cardCountByTopic[id] ?? 0), 0)
  const deckDue = (d: SavedDeck) => d.topicIds.reduce((n, id) => n + (dueCounts?.byTopic[id] ?? 0), 0)

  const go = (href: string) => router.push(href as never)

  // ── Sections ─────────────────────────────────────────────────────────────

  const mocksSection = (
    <View testID="practice-mocks">
      <SectionHeader
        title="Mock exams"
        subtitle="Timed, full-length practice"
        actionLabel={blueprints.status === 'ready' && blueprints.data.length > 0 ? 'See all' : undefined}
        onAction={() => go('/practice/exam')}
      />
      {blueprints.status === 'loading' ? (
        <SkeletonRows label="Loading mock exams" count={2} />
      ) : blueprints.status === 'error' ? (
        <ErrorState title="Couldn't load mock exams" onRetry={() => setBlueprintsTry(n => n + 1)} />
      ) : orderedBlueprints.length === 0 ? (
        <EmptyState
          icon={<Lineicons icon={FileQuestionOutlined} size={24} color={t.textSecondary} />}
          title="No mock exams yet"
          body="Mock exams appear here once they are published for your exams."
        />
      ) : (
        <RowGroup>
          {orderedBlueprints.slice(0, 4).map(b => {
            const running = inProgress?.has(b.slug) ?? false
            return (
              <ListRow
                key={b.slug}
                title={b.acronym}
                subtitle={`${b.name} · ${b.totalItems} items · ${minutes(b.totalTimeMinutes)}`}
                accessibilityLabel={`${b.acronym}, ${b.name}, ${b.totalItems} items, ${minutes(b.totalTimeMinutes)}${running ? ', in progress' : ''}`}
                trailing={running ? <Badge label="In progress" tone="accent" /> : undefined}
                onPress={() => go(`/practice/exam/${b.slug}`)}
              />
            )
          })}
        </RowGroup>
      )}
    </View>
  )

  const subjectsSection = (
    <View testID="practice-subjects">
      <SectionHeader title="Subjects" subtitle="Drill topic by topic" />
      {!loaded || readiness.status === 'loading' ? (
        <SkeletonRows label="Loading subjects" />
      ) : readiness.status === 'error' ? (
        <ErrorState title="Couldn't load your subjects" onRetry={() => setReadinessTry(n => n + 1)} />
      ) : subjectRows.length === 0 ? (
        <EmptyState
          icon={<Lineicons icon={Books2Outlined} size={24} color={t.textSecondary} />}
          title="No subjects on this device yet"
          body="Choose an exam in Explore and its subjects download here for offline practice."
          actionLabel="Choose an exam"
          onAction={() => go('/(tabs)/explore')}
        />
      ) : (
        <RowGroup>
          {subjectRows.map(s => {
            const topics = `${s.topics} topic${s.topics === 1 ? '' : 's'}`
            return (
              <ListRow
                key={s.id}
                title={s.name}
                subtitle={topics}
                accessibilityLabel={`${s.name}, ${topics}, ${s.pct == null ? 'not practised yet' : `ready ${s.pct}%`}`}
                trailing={<StatNumber value={s.pct == null ? '–' : `${s.pct}%`} label={s.pct == null ? 'New' : 'Ready'} />}
                onPress={() => go(`/subjects/${s.id}`)}
              />
            )
          })}
        </RowGroup>
      )}
    </View>
  )

  const decksSection = (
    <View testID="practice-decks">
      <SectionHeader title="Your decks" actionLabel="New deck" onAction={() => setDeckOpen(true)} />
      {decks.length === 0 ? (
        <Text style={[textStyle('bodySm', t.textSecondary), { paddingVertical: spacing.sm }]} maxFontSizeMultiplier={1.8}>
          Bundle topics into a deck to review them together. Tap New deck to make one.
        </Text>
      ) : (
        <RowGroup>
          {decks.map(d => {
            const n = d.topicIds.length
            return (
              <DeckRow
                key={d.id}
                name={d.name}
                subtitle={`${n} topic${n === 1 ? '' : 's'} · ${deckTotal(d)} cards`}
                dueCount={deckDue(d)}
                onOpen={() => go(`/practice/deck/${d.id}`)}
                onDelete={() => confirmAction('Delete deck?', `“${d.name}” will be removed. Your progress on its cards is kept.`, 'Delete', () => { void deleteDeck(d.id) }, { destructive: true })}
              />
            )
          })}
        </RowGroup>
      )}
    </View>
  )

  const toolsSection = (
    <View testID="practice-tools">
      <SectionHeader title="Tools" />
      <RowGroup>
        <ListRow
          leading={<RowIcon icon={Calculator1Outlined} />}
          title="Estimated Admission Score"
          subtitle="An estimate based on historical cutoffs"
          onPress={() => go('/estimator')}
        />
        <ListRow leading={<RowIcon icon={Notebook1Outlined} />} title="Notes" subtitle="Your study notes and reminders" onPress={() => go('/notes')} />
        <ListRow
          leading={<RowIcon icon={ClipboardOutlined} />}
          title="Requirements"
          subtitle="Documents for your focus exams and scholarships"
          onPress={() => go('/requirements')}
        />
      </RowGroup>
    </View>
  )

  const searchButton = (
    <Pressable
      onPress={() => setSearchOpen(true)}
      accessibilityRole="button"
      accessibilityLabel="Search practice"
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent' },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <Lineicons icon={Search1Outlined} size={22} color={t.textSecondary} />
    </Pressable>
  )

  const primary = (
    <View style={{ gap: spacing.xxl }}>
      <NextStepCard copy={nextCopy} onAction={go} />
      {mocksSection}
      {subjectsSection}
    </View>
  )
  const secondary = (
    <View style={{ gap: spacing.xxl }}>
      {decksSection}
      {toolsSection}
    </View>
  )

  return (
    <>
      <Screen
        tabBarInset
        width={bp === 'expanded' ? 'wide' : 'reading'}
        refreshControl={refreshCtl}
        header={(
          <TabHeader
            title="Practice"
            subtitle="Mocks, drills and review"
            actions={(
              <>
                {searchButton}
                <WebRefreshButton onRefresh={() => reloadAll(true)} refreshing={refreshing} />
              </>
            )}
          />
        )}
      >
        <View style={{ paddingTop: spacing.sm }}>
          <TwoColumn primary={primary} secondary={secondary} />
        </View>
      </Screen>

      <PracticeSearchSheet visible={searchOpen} entries={searchEntries} onClose={() => setSearchOpen(false)} onOpen={go} />
      <NewDeckSheet visible={deckOpen} subjects={subjects} topicRows={topicRows} onClose={() => setDeckOpen(false)} onCreate={createDeck} />
    </>
  )
}

