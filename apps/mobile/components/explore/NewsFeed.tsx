import { useState, useEffect, useMemo, useCallback } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ClipboardOutlined, Megaphone1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { useBreakpoint, columnCount } from '../../hooks/useBreakpoint'
import { admissionsUpdates, notes as notesTable } from '../../db/schema'
import {
  sortBySeverityThenDate,
  upcomingEvents,
  daysUntil,
  type FeedItem,
} from '../../utils/admissionsFeed'
import { NewsDetailModal } from '../updates/NewsDetailModal'
import { ScreenScroll } from '../ui/ScreenScroll'
import { Card } from '../ui/Card'
import { InsetGroup, InsetRow } from '../ui/InsetGroup'
import { SectionHeader } from '../ui/SectionHeader'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { CalendarStrip } from '../calendar/CalendarStrip'
import { DateActionSheet } from '../calendar/DateActionSheet'
import { MonthSheet } from '../calendar/MonthSheet'
import { spacing } from '../../theme/tokens'
import { useHomeStats } from '../../hooks/useHomeStats'
import { scheduleNoteReminder, cancelNoteReminder } from '../../services/notifications'
import type { QuickReminderPayload } from '../calendar/QuickReminderForm'
import { fmtShortDate, sourceHost, type BadgeSpec } from './exploreModel'
import { DateTile } from './DateTile'
import { newsSources } from '../../utils/newsSources'
import { useLatestRequest } from './useLatestRequest'
import { reminderDayIndices } from '../../utils/localDay'
import { schedulePushUserData } from '../../services/pushScheduler'

// ── Severity ───────────────────────────────────────────────────────────────────

type SeverityKey = 'urgent' | 'important' | 'info' | 'no_change'

const SEVERITY: Record<SeverityKey, BadgeSpec> = {
  urgent:    { label: 'Urgent', tone: 'danger' },
  important: { label: 'Important', tone: 'warning' },
  info:      { label: 'Info', tone: 'neutral' },
  no_change: { label: 'No change', tone: 'success' },
}

function severityBadge(severity: string): BadgeSpec {
  return SEVERITY[severity as SeverityKey] ?? SEVERITY.info
}

/** How soon an ISO event date is. Red only for today/tomorrow; amber within a week. */
function eventWhen(days: number): BadgeSpec {
  if (days === 0) return { label: 'Today', tone: 'danger' }
  if (days === 1) return { label: 'Tomorrow', tone: 'danger' }
  return { label: `In ${days} days`, tone: days <= 7 ? 'warning' : 'neutral' }
}

/** Local midnight of an ISO yyyy-mm-dd date. */
function isoToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime()
}

// ── Sections ───────────────────────────────────────────────────────────────────

function UpcomingDates({ items }: { items: FeedItem[] }) {
  const events = upcomingEvents(items).slice(0, 8)
  if (events.length === 0) return null
  return (
    <View>
      <SectionHeader title="Upcoming dates" subtitle="Exam days, deadlines and result releases" />
      <InsetGroup inset={false} testID="upcoming-dates">
        {events.map(item => {
          const when = eventWhen(daysUntil(item.eventDate!))
          // The trust rule: the exact date, and where it comes from when the feed names a source.
          const exact = fmtShortDate(isoToMs(item.eventDate!))
          const host = sourceHost(newsSources(item.sources)[0]?.url)
          const sub = [exact, item.schoolName, item.eventType, host ? `Source: ${host}` : null].filter(Boolean).join(' · ')
          return (
            <InsetRow
              key={item.id}
              leading={<DateTile date={item.eventDate!} />}
              title={item.title}
              subtitle={sub}
              trailing={<Badge label={when.label} tone={when.tone} />}
              accessibilityLabel={`${item.title}, ${sub}, ${when.label}`}
            />
          )
        })}
      </InsetGroup>
    </View>
  )
}

function AdmissionsNews({ items, onOpen }: { items: FeedItem[]; onOpen: (item: FeedItem) => void }) {
  const { theme: t } = useTheme()
  const sorted = useMemo(() => sortBySeverityThenDate(items).slice(0, 12), [items])
  return (
    <View>
      <SectionHeader title="Admissions news" subtitle="From schools and scholarship offices, most urgent first" />
      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Lineicons icon={Megaphone1Outlined} size={26} color={t.textSecondary} />}
            title="No admissions news yet"
            body="School announcements, exam dates and result releases show up here as they are published."
          />
        </Card>
      ) : (
        <InsetGroup inset={false}>
          {sorted.map(item => {
            const sev = severityBadge(item.severity)
            const sub = [item.schoolName, item.body].filter(Boolean).join(' · ')
            return (
              <InsetRow
                key={item.id}
                title={item.title}
                subtitle={sub || undefined}
                trailing={<Badge label={sev.label} tone={sev.tone} />}
                onPress={() => onOpen(item)}
                accessibilityLabel={`${sev.label}: ${item.title}${item.schoolName ? `, ${item.schoolName}` : ''}`}
                accessibilityHint="Opens the full announcement"
              />
            )
          })}
        </InsetGroup>
      )}
    </View>
  )
}

function NewsSkeleton() {
  return (
    <View testID="news-skeleton" accessible accessibilityLabel="Loading admissions news" aria-busy style={{ gap: spacing.md }}>
      <Skeleton width="40%" height={18} />
      {[0, 1, 2].map(i => (
        <View key={i} style={{ gap: spacing.sm }}>
          <Skeleton width="85%" height={16} />
          <Skeleton width="60%" height={12} />
        </View>
      ))}
    </View>
  )
}

// ── Explore › News & dates ─────────────────────────────────────────────────────

/**
 * The former Updates tab, now Explore's "News & dates" section: calendar
 * strip, results tracker, upcoming dates and admissions news. Explore owns the
 * screen header and safe area; this renders the body only. On desktop the
 * dates column sits beside the news column.
 */
export function NewsFeed({ refreshKey = 0 }: { refreshKey?: number } = {}) {
  const db = useDb()
  const twoUp = columnCount(useBreakpoint()) === 2
  const [items, setItems] = useState<FeedItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selected, setSelected] = useState<FeedItem | null>(null)

  // Calendar state
  const [activeDayMs, setActiveDayMs] = useState<number | null>(null)
  const [showMonth, setShowMonth] = useState(false)
  const { importantDayIndices, practiceDayIndices, noteReminders, refresh } = useHomeStats()
  const importantDays = useMemo(() => new Set(importantDayIndices), [importantDayIndices])
  const practiceDays = useMemo(() => new Set(practiceDayIndices), [practiceDayIndices])
  const reminderDays = useMemo(() => reminderDayIndices(noteReminders), [noteReminders])

  // ── Reminders ────────────────────────────────────────────────────────────────

  async function insertReminder(payload: QuickReminderPayload): Promise<string> {
    const id = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    await db.insert(notesTable).values({
      id,
      title: payload.title,
      content: payload.content,
      type: payload.type,
      isPinned: false,
      isArchived: false,
      isTrashed: false,
      reminderAt: payload.reminderAt,
      createdAt: now,
      updatedAt: now,
    })
    schedulePushUserData(db)
    try {
      await scheduleNoteReminder(id, payload.title, new Date(payload.reminderAt))
    } catch (err) {
      console.warn('[news/reminder] schedule failed:', err)
    }
    setActiveDayMs(null)
    void refresh()
    return id
  }

  async function handleSaveReminder(payload: QuickReminderPayload) {
    await insertReminder(payload)
  }

  async function handleSaveAndOpenEditor(payload: QuickReminderPayload) {
    const id = await insertReminder(payload)
    router.push(`/notes/${id}`)
  }

  async function handleDeleteReminder(noteId: string) {
    await db.update(notesTable)
      .set({ reminderAt: null, updatedAt: Date.now() })
      .where(eq(notesTable.id, noteId))
    schedulePushUserData(db)
    try { await cancelNoteReminder(noteId) } catch { /* already cancelled */ }
    void refresh()
  }

  function handleOpenNoteEditor(noteId: string) {
    setActiveDayMs(null)
    router.push(`/notes/${noteId}`)
  }

  function handleOpenListing(slug: string) {
    setActiveDayMs(null)
    router.push(`/listings/${slug}`)
  }

  // ── Admissions feed ───────────────────────────────────────────────────────────

  // Mount, header refresh and retry can overlap: apply only the newest read,
  // and nothing after unmount.
  const beginLoad = useLatestRequest()
  const loadFeed = useCallback(async () => {
    const isCurrent = beginLoad()
    try {
      const rows = await db.select().from(admissionsUpdates)
      if (!isCurrent()) return
      setItems(rows.map((r): FeedItem => {
        let sources: { label?: string; url: string }[] = []
        try {
          const parsed = JSON.parse(r.sources ?? '[]')
          sources = Array.isArray(parsed) ? parsed : []
        } catch {
          sources = []
        }
        return {
          id: r.id,
          reportDate: r.reportDate ?? '',
          severity: r.severity,
          title: r.title,
          body: r.body,
          eventDate: r.eventDate ?? null,
          eventType: r.eventType ?? null,
          schoolName: r.schoolName ?? null,
          actionRequired: r.actionRequired ?? null,
          sources,
        }
      }))
      setStatus('ready')
    } catch (e) {
      if (!isCurrent()) return
      console.warn('[news] feed load failed:', e)
      setStatus('error')
    }
  }, [db, beginLoad])

  useEffect(() => { void loadFeed() }, [loadFeed])

  // Explore's header refresh runs the sync and bumps refreshKey; reload the
  // feed and the cached calendar stats when it changes.
  useEffect(() => {
    if (refreshKey === 0) return
    void Promise.all([loadFeed(), refresh()])
  }, [refreshKey, loadFeed, refresh])

  const retry = useCallback(() => {
    setStatus('loading')
    void loadFeed()
  }, [loadFeed])

  const datesColumn = (
    <View style={{ gap: spacing.xl }}>
      <View testID="updates-calendar-strip">
        <CalendarStrip
          importantDays={importantDays}
          practiceDays={practiceDays}
          reminderDays={reminderDays}
          onDayPress={setActiveDayMs}
          onHeaderPress={() => setShowMonth(true)}
        />
      </View>
      <InsetGroup inset={false}>
        <InsetRow
          icon={ClipboardOutlined}
          iconTone="neutral"
          title="Results Tracker"
          subtitle="Track school results you're waiting on"
          onPress={() => router.push('/results-tracker')}
        />
      </InsetGroup>
      {status === 'ready' ? <UpcomingDates items={items} /> : null}
    </View>
  )

  const newsColumn = status === 'loading' ? <NewsSkeleton />
    : status === 'error' ? <ErrorState title="Couldn't load admissions news" onRetry={retry} />
    : <AdmissionsNews items={items} onOpen={setSelected} />

  return (
    <View style={{ flex: 1 }}>
      <ScreenScroll testID="news-scroll" tabBarInset padded={false} contentContainerStyle={{ paddingTop: spacing.xs }}>
        <View
          testID="news-columns"
          style={twoUp
            ? { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxl }
            : { flexDirection: 'column', gap: spacing.xl }}
        >
          <View style={twoUp ? { flex: 2, minWidth: 0 } : undefined}>{datesColumn}</View>
          <View style={twoUp ? { flex: 3, minWidth: 0 } : undefined}>{newsColumn}</View>
        </View>
      </ScreenScroll>

      {selected !== null ? <NewsDetailModal item={selected} onClose={() => setSelected(null)} /> : null}
      <DateActionSheet
        visible={activeDayMs != null}
        dayStartMs={activeDayMs ?? 0}
        onClose={() => setActiveDayMs(null)}
        onSaveReminder={handleSaveReminder}
        onSaveAndOpenEditor={handleSaveAndOpenEditor}
        onOpenNoteEditor={handleOpenNoteEditor}
        onOpenListing={handleOpenListing}
        onDeleteReminder={handleDeleteReminder}
      />
      <MonthSheet
        visible={showMonth}
        onClose={() => setShowMonth(false)}
        onDayPress={(ms) => {
          setShowMonth(false)
          setActiveDayMs(ms)
        }}
        importantDays={importantDays}
        reminderDays={reminderDays}
        practiceDays={practiceDays}
      />
    </View>
  )
}
