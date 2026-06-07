import { useState, useEffect } from 'react'
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { admissionsUpdates } from '../../db/schema'
import {
  sortBySeverityThenDate,
  upcomingEvents,
  daysUntil,
  type FeedItem,
} from '../../utils/admissionsFeed'
import { NewsDetailModal } from '../../components/updates/NewsDetailModal'

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
  { emoji: string; bg: string; text: string; label: string }
> = {
  urgent:    { emoji: '🔴', bg: '#fee2e2', text: '#991b1b', label: 'Urgent' },
  important: { emoji: '🟠', bg: '#ffedd5', text: '#9a3412', label: 'Important' },
  info:      { emoji: '🟡', bg: '#fef9c3', text: '#854d0e', label: 'Info' },
  no_change: { emoji: '✅', bg: '#dcfce7', text: '#166534', label: 'No Change' },
}

function getSeverityConfig(severity: string) {
  return SEVERITY_CONFIG[severity as SeverityKey] ?? SEVERITY_CONFIG.info
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  const { theme: t, typo } = useTheme()
  return (
    <Text style={[styles.sectionHeader, { color: t.textSecondary, fontSize: typo.xs }]}>
      {title}
    </Text>
  )
}

// ── Upcoming Events section ────────────────────────────────────────────────────

function UpcomingEventsSection({ items }: { items: FeedItem[] }) {
  const { theme: t, typo } = useTheme()
  const events = upcomingEvents(items).slice(0, 8)

  if (events.length === 0) return null

  return (
    <View>
      <SectionHeader title="UPCOMING EVENTS" />
      {events.map((item) => {
        const days = daysUntil(item.eventDate!)
        const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`
        return (
          <View
            key={item.id}
            style={[styles.card, { backgroundColor: t.surface, borderColor: t.divider }]}
          >
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                {item.schoolName != null && item.schoolName.length > 0 ? (
                  <Text style={[styles.schoolName, { color: t.textSecondary, fontSize: typo.xs }]}>
                    {item.schoolName}
                  </Text>
                ) : null}
                <Text style={[styles.cardTitle, { color: t.textPrimary, fontSize: typo.sm }]}>
                  {item.title}
                </Text>
              </View>
              {item.eventType != null && item.eventType.length > 0 ? (
                <View style={[styles.chip, { backgroundColor: t.accentSurface }]}>
                  <Text style={[styles.chipText, { color: t.accentText, fontSize: typo.xs }]}>
                    {item.eventType}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.row}>
              <Text style={[styles.dateText, { color: t.textSecondary, fontSize: typo.xs }]}>
                {item.eventDate}
              </Text>
              <Text style={[styles.daysLabel, { color: t.accent, fontSize: typo.xs }]}>
                {daysLabel}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ── News section ───────────────────────────────────────────────────────────────

function NewsSection({ items }: { items: FeedItem[] }) {
  const { theme: t, typo } = useTheme()
  const [selected, setSelected] = useState<FeedItem | null>(null)
  const sorted = sortBySeverityThenDate(items).slice(0, 12)

  return (
    <View>
      <SectionHeader title="ADMISSIONS NEWS" />
      {sorted.map((item) => {
        const cfg = getSeverityConfig(item.severity)
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.7}
            onPress={() => setSelected(item)}
            style={[styles.card, { backgroundColor: t.surface, borderColor: t.divider }]}
          >
            <View style={styles.row}>
              <View
                style={[
                  styles.severityBadge,
                  { backgroundColor: cfg.bg },
                ]}
              >
                <Text style={[styles.severityEmoji]}>{cfg.emoji}</Text>
                <Text style={[styles.severityText, { color: cfg.text, fontSize: typo.xs }]}>
                  {cfg.label}
                </Text>
              </View>
              {item.schoolName != null && item.schoolName.length > 0 ? (
                <Text
                  style={[styles.schoolName, { color: t.textSecondary, fontSize: typo.xs, marginLeft: 8 }]}
                  numberOfLines={1}
                >
                  {item.schoolName}
                </Text>
              ) : null}
            </View>
            <Text
              style={[styles.cardTitle, { color: t.textPrimary, fontSize: typo.sm, marginTop: 4 }]}
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
          </TouchableOpacity>
        )
      })}
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
    <View>
      <SectionHeader title="ISKOTIFY UPDATES" />
      {CHANGELOG.map((entry) => (
        <View
          key={entry.version}
          style={[styles.card, { backgroundColor: t.surface, borderColor: t.divider }]}
        >
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { color: t.textPrimary, fontSize: typo.sm }]}>
              v{entry.version}
            </Text>
            <Text style={[styles.dateText, { color: t.textSecondary, fontSize: typo.xs }]}>
              {entry.date}
            </Text>
          </View>
          {entry.notes.map((note, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: t.textSecondary }]}>{'•'}</Text>
              <Text style={[styles.bulletText, { color: t.textSecondary, fontSize: typo.xs }]}>
                {note}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

// ── Results Tracker entry card ─────────────────────────────────────────────────

function ResultsTrackerCard() {
  const { theme: t, typo } = useTheme()
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => router.push('/results-tracker')}
      style={[styles.card, styles.trackerCard, { backgroundColor: t.accentSurface, borderColor: t.accent }]}
    >
      <Text style={[styles.trackerEmoji]}>{'📋'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: t.textPrimary, fontSize: typo.sm }]}>
          Results Tracker
        </Text>
        <Text style={[styles.bodyPreview, { color: t.textSecondary, fontSize: typo.xs }]}>
          Track school results you&apos;re waiting on
        </Text>
      </View>
      <Text style={[{ color: t.accent, fontSize: typo.base }]}>{'›'}</Text>
    </TouchableOpacity>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function UpdatesScreen() {
  const { theme: t, typo } = useTheme()
  const db = useDb()
  const [items, setItems] = useState<FeedItem[]>([])

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
        <Text style={[styles.title, { color: t.textPrimary, fontSize: typo.xl }]}>Updates</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary, fontSize: typo.sm }]}>
          Events, news &amp; app updates
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ResultsTrackerCard />
        <UpcomingEventsSection items={items} />
        {items.length > 0 ? <NewsSection items={items} /> : null}
        <ChangelogSection />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontWeight: '400',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 12,
  },
  sectionHeader: {
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 6,
    marginBottom: 10,
  },
  cardTitle: {
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  schoolName: {
    fontWeight: '500',
    flexShrink: 1,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  chipText: {
    fontWeight: '600',
  },
  dateText: {
    fontWeight: '400',
  },
  daysLabel: {
    fontWeight: '600',
    marginLeft: 'auto',
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  severityEmoji: {
    fontSize: 11,
  },
  severityText: {
    fontWeight: '600',
  },
  bodyPreview: {
    fontWeight: '400',
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  bullet: {
    fontSize: 11,
    lineHeight: 18,
  },
  bulletText: {
    flex: 1,
    lineHeight: 18,
  },
  trackerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
  },
  trackerEmoji: {
    fontSize: 24,
  },
})
