import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { admissionsUpdates, notes as notesTable, listings as listingsTable, focusListings } from '../../db/schema'
import {
  sortBySeverityThenDate,
  upcomingEvents,
  daysUntil,
  type FeedItem,
} from '../../utils/admissionsFeed'
import { NewsDetailModal } from '../../components/updates/NewsDetailModal'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { Badge } from '../../components/ui/Badge'
import { ListCard } from '../../components/ui/ListCard'
import { CalendarStrip } from '../../components/calendar/CalendarStrip'
import { DateActionSheet } from '../../components/calendar/DateActionSheet'
import { MonthSheet } from '../../components/calendar/MonthSheet'
import { spacing, radius } from '../../theme/tokens'
import { useHomeStats } from '../../hooks/useHomeStats'
import { scheduleNoteReminder, cancelNoteReminder } from '../../services/notifications'
import type { QuickReminderPayload } from '../../components/calendar/QuickReminderForm'

// ── Changelog ─────────────────────────────────────────────────────────────────

const CHANGELOG: { version: string; date: string; notes: string[] }[] = [
  {
    version: '1.5.0',
    date: '2026-06-07',
    notes: [
      'UPCAT mock exam + 320-question bank',
      'Scholarship directory + eligibility matcher',
      'Reworked exam flow (no auto-advance, Quick/Full)',
      'Admission Score Estimator',
      'AI Career Advisor + AI-Safe-Score',
      'School & Course Finder',
      'Admissions News feed',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-05-20',
    notes: [
      'Google Calendar sync for reminders',
      'Settings > Google Calendar connect/disconnect',
    ],
  },
]

// ── Severity badge config ──────────────────────────────────────────────────────

type SeverityKey = 'urgent' | 'important' | 'info' | 'no_change'

const SEVERITY_CONFIG: Record<
  SeverityKey,
  { label: string; tone: 'accent' | 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  urgent:    { label: 'Urgent', tone: 'danger' },
  important: { label: 'Important', tone: 'warning' },
  info:      { label: 'Info', tone: 'accent' },
  no_change: { label: 'No Change', tone: 'success' },
}

function getSeverityConfig(severity: string) {
  return SEVERITY_CONFIG[severity as SeverityKey] ?? SEVERITY_CONFIG.info
}

// ── Upcoming Events section ────────────────────────────────────────────────────

function UpcomingEventsSection({ items }: { items: FeedItem[] }) {
  const { theme: t, typo } = useTheme()
  const events = upcomingEvents(items).slice(0, 8)

  if (events.length === 0) return null

  return (
    <View style={styles.section}>
      <SectionHeader title="UPCOMING EVENTS" />
      <View style={styles.cardStack}>
        {events.map((item) => {
          const days = daysUntil(item.eventDate!)
          const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`
          return (
            <Card key={item.id} elevated>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  {item.schoolName != null && item.schoolName.length > 0 ? (
                    <Text style={[styles.schoolName, { color: t.textSecondary, fontSize: typo.xs }]}>
                      {item.schoolName}
                    </Text>
                  ) : null}
                  <Text style={[styles.cardTitle, { color: t.textPrimary, fontSize: typo.base }]}>
                    {item.title}
                  </Text>
                </View>
                {item.eventType != null && item.eventType.length > 0 ? (
                  <Badge label={item.eventType} tone="accent" />
                ) : null}
              </View>
              <View style={styles.row}>
                <Text style={[styles.dateText, { color: t.textTertiary, fontSize: typo.xs }]}>
                  {item.eventDate}
                </Text>
                <Text style={[styles.daysLabel, { color: t.accentText, fontSize: typo.xs }]}>
                  {daysLabel}
                </Text>
              </View>
            </Card>
          )
        })}
      </View>
    </View>
  )
}

// ── News section ───────────────────────────────────────────────────────────────

function NewsSection({ items }: { items: FeedItem[] }) {
  const { theme: t, typo } = useTheme()
  const [selected, setSelected] = useState<FeedItem | null>(null)
  const sorted = sortBySeverityThenDate(items).slice(0, 12)

  return (
    <View style={styles.section}>
      <SectionHeader title="ADMISSIONS NEWS" />
      <View style={styles.cardStack}>
        {sorted.map((item) => {
          const cfg = getSeverityConfig(item.severity)
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => setSelected(item)}
              style={({ pressed }) => [styles.pressableCard, pressed ? { opacity: 0.7 } : null]}
            >
              <Card elevated>
                <View style={styles.row}>
                  <Badge label={cfg.label} tone={cfg.tone} />
                  {item.schoolName != null && item.schoolName.length > 0 ? (
                    <Text
                      style={[styles.schoolName, { color: t.textSecondary, fontSize: typo.xs, marginLeft: spacing.sm }]}
                      numberOfLines={1}
                    >
                      {item.schoolName}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[styles.cardTitle, { color: t.textPrimary, fontSize: typo.base, marginTop: spacing.xs }]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                <Text
                  style={[styles.bodyPreview, { color: t.textSecondary, fontSize: typo.xs }]}
                  numberOfLines={1}
                >
                  {item.body}
                </Text>
              </Card>
            </Pressable>
          )
        })}
      </View>
      {selected !== null ? (
        <NewsDetailModal item={selected} onClose={() => setSelected(null)} />
      ) : null}
    </View>
  )
}

// ── Iskotify Updates (Changelog) section ──────────────────────────────────────

function ChangelogSection() {
  const { theme: t, typo } = useTheme()
  return (
    <View style={styles.section}>
      <SectionHeader title="ISKOTIFY UPDATES" />
      <View style={styles.cardStack}>
        {CHANGELOG.map((entry) => (
          <Card key={entry.version} elevated>
            <View style={styles.row}>
              <Text style={[styles.cardTitle, { color: t.textPrimary, fontSize: typo.base }]}>
                v{entry.version}
              </Text>
              <Text style={[styles.dateText, { color: t.textTertiary, fontSize: typo.xs }]}>
                {entry.date}
              </Text>
            </View>
            {entry.notes.map((note) => (
              <View key={`${entry.version}-${note}`} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: t.textSecondary }]}>{'•'}</Text>
                <Text style={[styles.bulletText, { color: t.textSecondary, fontSize: typo.xs }]}>
                  {note}
                </Text>
              </View>
            ))}
          </Card>
        ))}
      </View>
    </View>
  )
}

// ── Results Tracker entry card ─────────────────────────────────────────────────

function ResultsTrackerCard() {
  return (
    <ListCard
      icon={<Text style={{ fontSize: 22 }}>📋</Text>}
      iconBg="rgba(128,0,0,0.18)"
      title="Results Tracker"
      subtitle="Track school results you're waiting on"
      onPress={() => router.push('/results-tracker')}
    />
  )
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function UpdatesScreen() {
  const { theme: t, typo } = useTheme()
  const db = useDb()
  const [items, setItems] = useState<FeedItem[]>([])

  // Calendar state (moved from Home)
  const [activeDayMs, setActiveDayMs] = useState<number | null>(null)
  const [showMonth, setShowMonth] = useState(false)

  // Use cached home stats for calendar data (cheap — same 'home:stats' cache)
  const { importantDayIndices, practiceDayIndices, noteReminders, refresh } = useHomeStats()

  // Derive important/practice/reminder day sets
  const importantDays = useMemo(() => new Set(importantDayIndices), [importantDayIndices])
  const practiceDays = useMemo(() => new Set(practiceDayIndices), [practiceDayIndices])
  const reminderDays = useMemo(
    () => new Set(noteReminders.map(r => Math.floor(r.reminderAt / 86_400_000))),
    [noteReminders]
  )

  // ── Reminder handlers (moved from Home) ──────────────────────────────────────

  async function handleSaveReminder(payload: QuickReminderPayload) {
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
      console.warn('[updates/reminder] schedule failed:', err)
    }
    setActiveDayMs(null)
    void refresh()
  }

  async function handleSaveAndOpenEditor(payload: QuickReminderPayload) {
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
      console.warn('[updates/reminder] schedule failed:', err)
    }
    setActiveDayMs(null)
    void refresh()
    router.push(`/notes/${id}`)
  }

  async function handleDeleteReminder(noteId: string) {
    await db.update(notesTable)
      .set({ reminderAt: null, updatedAt: Date.now() })
      .where(eq(notesTable.id, noteId))
    try { await cancelNoteReminder(noteId) } catch {}
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

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const rows = await db.select().from(admissionsUpdates)
        if (cancelled) return
        const mapped: FeedItem[] = rows.map((r) => {
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
        })
        setItems(mapped)
      } catch {
        // table not yet migrated — show empty state gracefully
      }
    }
    void load()
    return () => { cancelled = true }
  }, [db])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.textPrimary, fontSize: typo.h2 }]}>Updates</Text>
        <Text style={[styles.subtitle, { color: t.textTertiary, fontSize: typo.sm }]}>
          Events, news &amp; app updates
        </Text>
      </View>

      <ScreenScroll tabBarInset padded contentContainerStyle={styles.content}>
        {/* Calendar strip — moved from Home */}
        <View style={styles.calendarWrap} testID="updates-calendar-strip">
          <CalendarStrip
            importantDays={importantDays}
            practiceDays={practiceDays}
            reminderDays={reminderDays}
            onDayPress={setActiveDayMs}
            onHeaderPress={() => setShowMonth(true)}
          />
        </View>

        <ResultsTrackerCard />
        <UpcomingEventsSection items={items} />
        {items.length > 0 ? <NewsSection items={items} /> : null}
        <ChangelogSection />
      </ScreenScroll>

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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontWeight: '400',
  },
  content: {
    paddingTop: spacing.sm,
    gap: spacing.xl,
  },
  calendarWrap: {
    paddingVertical: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  cardStack: {
    gap: spacing.md,
  },
  cardTitle: {
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  schoolName: {
    fontWeight: '500',
    fontFamily: 'Lexend_500Medium',
    flexShrink: 1,
  },
  dateText: {
    fontWeight: '400',
    fontFamily: 'Lexend_400Regular',
  },
  daysLabel: {
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    marginLeft: 'auto',
  },
  bodyPreview: {
    fontWeight: '400',
    fontFamily: 'Lexend_400Regular',
  },
  pressableCard: {
    borderRadius: radius.xl,
    borderCurve: 'continuous',
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  bullet: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Lexend_400Regular',
  },
  bulletText: {
    flex: 1,
    lineHeight: 18,
    fontFamily: 'Lexend_400Regular',
  },
})
