import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { View, Text } from 'react-native'
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
import { SectionHeader } from '../ui/SectionHeader'
import { Badge } from '../ui/Badge'
import { ListRow } from '../ui/ListRow'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { CalendarStrip } from '../calendar/CalendarStrip'
import { DateActionSheet } from '../calendar/DateActionSheet'
import { MonthSheet } from '../calendar/MonthSheet'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useHomeStats } from '../../hooks/useHomeStats'
import { scheduleNoteReminder, cancelNoteReminder } from '../../services/notifications'
import type { QuickReminderPayload } from '../calendar/QuickReminderForm'
import type { BadgeSpec } from './exploreModel'

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A small calendar leaf — month over a tabular day number. Decorative (ListRow hides it). */
function DateTile({ iso }: { iso: string }) {
  const { theme: t } = useTheme()
  const [, m, d] = iso.split('-').map(Number)
  return (
    <View
      style={{
        width: 44, minHeight: 48, borderRadius: radius.sm, borderCurve: 'continuous',
        borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
        alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xs,
      }}
    >
      <Text style={[textStyle('caption', t.accentText), { textTransform: 'uppercase' }]} maxFontSizeMultiplier={1.2}>
        {MONTHS[(m ?? 1) - 1]}
      </Text>
      <Text style={textStyle('numeric', t.textPrimary)} maxFontSizeMultiplier={1.2}>{d}</Text>
    </View>
  )
}

/** Rows grouped in one card with hairlines between them. */
function RowGroup({ children }: { children: React.ReactNode[] }) {
  const { theme: t } = useTheme()
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {children.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={{ height: 1, backgroundColor: t.divider, marginLeft: spacing.lg }} /> : null}
          {row}
        </Fragment>
      ))}
    </Card>
  )
}

// ── Sections ───────────────────────────────────────────────────────────────────

function UpcomingDates({ items }: { items: FeedItem[] }) {
  const events = upcomingEvents(items).slice(0, 8)
  if (events.length === 0) return null
  return (
    <View>
      <SectionHeader title="Upcoming dates" subtitle="Exam days, deadlines and result releases" />
      <RowGroup>
        {events.map(item => {
          const when = eventWhen(daysUntil(item.eventDate!))
          const sub = [item.schoolName, item.eventType].filter(Boolean).join(' · ')
          return (
            <ListRow
              key={item.id}
              leading={<DateTile iso={item.eventDate!} />}
              title={item.title}
              subtitle={sub || undefined}
              trailing={<Badge label={when.label} tone={when.tone} />}
              accessibilityLabel={`${item.title}, ${item.eventDate}, ${when.label}${sub ? `, ${sub}` : ''}`}
            />
          )
        })}
      </RowGroup>
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
        <RowGroup>
          {sorted.map(item => {
            const sev = severityBadge(item.severity)
            const sub = [item.schoolName, item.body].filter(Boolean).join(' · ')
            return (
              <ListRow
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
        </RowGroup>
      )}
    </View>
  )
}

function NewsSkeleton() {
  return (
    <View testID="news-skeleton" accessible accessibilityLabel="Loading admissions news" accessibilityState={{ busy: true }} style={{ gap: spacing.md }}>
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
  const { theme: t } = useTheme()
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
  const reminderDays = useMemo(
    () => new Set(noteReminders.map(r => Math.floor(r.reminderAt / 86_400_000))),
    [noteReminders],
  )

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

  const loadFeed = useCallback(async () => {
    try {
      const rows = await db.select().from(admissionsUpdates)
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
      console.warn('[news] feed load failed:', e)
      setStatus('error')
    }
  }, [db])

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
      <RowGroup>
        {[
          <ListRow
            key="tracker"
            leading={(
              <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Lineicons icon={ClipboardOutlined} size={20} color={t.textSecondary} />
              </View>
            )}
            title="Results Tracker"
            subtitle="Track school results you're waiting on"
            onPress={() => router.push('/results-tracker')}
          />,
        ]}
      </RowGroup>
      {status === 'ready' ? <UpcomingDates items={items} /> : null}
    </View>
  )

  const newsColumn = status === 'loading' ? <NewsSkeleton />
    : status === 'error' ? <ErrorState title="Couldn't load admissions news" onRetry={retry} />
    : <AdmissionsNews items={items} onOpen={setSelected} />

  return (
    <View style={{ flex: 1 }}>
      <ScreenScroll tabBarInset padded={false} contentContainerStyle={{ paddingTop: spacing.xs }}>
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
