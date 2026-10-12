import { useMemo } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Megaphone1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { layout, radius, spacing } from '../../theme/tokens'
import { InsetGroup, InsetRow, IconTile } from '../ui/InsetGroup'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Text } from '../ui/Text'
import { TodaySectionHeader } from './TodaySectionHeader'
import {
  buildNewsAndDatesFeed, entryDaysAway, type FocusedListingLike, type NoteReminderLike, type MergedFeedEntry,
} from '../../utils/newsAndDatesFeed'
import type { FeedItem } from '../../utils/admissionsFeed'

/** Today shows only what's next; Explore owns the full list of dates and news. */
export const COMING_UP_LIMIT = 3

/** At or under this many days, the relative time reads in warningStrong. */
export const SOON_DAYS = 14

// Hoisted: building an Intl formatter is slow. Listing and admissions dates
// are date-only values at UTC midnight, so they format in UTC; a note
// reminder is a real instant and formats in the device's zone.
const MONTH_UTC = new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' })
const MONTH_LOCAL = new Intl.DateTimeFormat('en-PH', { month: 'short' })
const DATE_UTC = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const DATE_LOCAL = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })

/** "Today", "Tomorrow", "In 8 days". */
export function relativeDay(days: number): string {
  if (days < 1) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

interface Props {
  focusedListings: FocusedListingLike[]
  noteReminders: NoteReminderLike[]
  admissionItems: FeedItem[]
  hasAnyFocus: boolean
  admissionsStatus: 'loading' | 'ready' | 'error'
  onRetry: () => void
}

/** An iOS Calendar-style date tile: the month in danger red over the day. Decorative. */
function DateTile({ date, local }: { date: number; local: boolean }) {
  const { theme: t } = useTheme()
  const d = new Date(date)
  const day = local ? d.getDate() : d.getUTCDate()
  return (
    <View
      testID="date-tile"
      style={{
        minWidth: layout.rowMinHeight, minHeight: layout.rowMinHeight, paddingVertical: 2,
        borderRadius: radius.chip, borderCurve: 'continuous', backgroundColor: t.bg,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text role="caption" color={t.danger} maxFontSizeMultiplier={1.4} style={{ fontWeight: '600' }}>
        {(local ? MONTH_LOCAL : MONTH_UTC).format(d)}
      </Text>
      <Text role="title3" maxFontSizeMultiplier={1.4}>{String(day)}</Text>
    </View>
  )
}

/**
 * "Coming up": the next few deadlines, dates and admissions news, soonest
 * first, on one inset group. A dated row leads with a calendar date tile and
 * ends with a calm relative time ("In 8 days"; warningStrong only within two
 * weeks). Every row names its official source host when the data has one.
 */
export function NewsAndDates({ focusedListings, noteReminders, admissionItems, hasAnyFocus, admissionsStatus, onRetry }: Props) {
  const { theme: t } = useTheme()

  const feed = useMemo(
    () => buildNewsAndDatesFeed({ focusedListings, noteReminders, admissionItems, now: Date.now(), limit: COMING_UP_LIMIT }),
    [focusedListings, noteReminders, admissionItems],
  )

  function onPressEntry(item: MergedFeedEntry) {
    if (item.kind === 'reminder') {
      router.push(`/notes/${item.slug}` as never)
    } else if (item.kind === 'admission') {
      if (item.slug === 'upcat' || /upcat/i.test(item.title)) {
        router.push('/practice/exam/upcat' as never)
      } else {
        router.push('/(tabs)/explore?section=news' as never)
      }
    } else if (item.kind === 'listing') {
      router.push(`/listings/${item.slug}` as never)
    } else {
      router.push('/(tabs)/explore?section=news' as never)
    }
  }

  const rows: React.ReactNode[] = []
  if (admissionsStatus === 'loading' && feed.length === 0) {
    rows.push(
      <View key="loading" style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton accessible label="Loading dates and news" height={40} />
        <Skeleton height={40} />
      </View>,
    )
  } else {
    for (const item of feed) {
      const source = item.sourceHost ? `Source: ${item.sourceHost}` : null
      if (item.date == null) {
        rows.push(
          <InsetRow
            key={item.key}
            title={item.title}
            subtitle={[item.label, source].filter(Boolean).join(' · ')}
            leading={<IconTile icon={Megaphone1Outlined} tone="neutral" />}
            onPress={() => onPressEntry(item)}
          />,
        )
        continue
      }
      const local = item.kind === 'reminder'
      const days = entryDaysAway({ kind: item.kind, date: item.date })
      const when = relativeDay(days)
      const date = (local ? DATE_LOCAL : DATE_UTC).format(new Date(item.date))
      rows.push(
        <InsetRow
          key={item.key}
          title={item.title}
          subtitle={[item.label, source].filter(Boolean).join(' · ')}
          leading={<DateTile date={item.date} local={local} />}
          trailing={
            <Text role="footnote" color={days <= SOON_DAYS ? t.warningStrong : t.textSecondary} style={{ fontWeight: '600' }}>
              {when}
            </Text>
          }
          onPress={() => onPressEntry(item)}
          accessibilityLabel={`${item.title}, ${item.label} on ${date}, ${when.toLowerCase()}${item.sourceHost ? `, source ${item.sourceHost}` : ''}`}
        />,
      )
    }
    if (feed.length === 0 && admissionsStatus !== 'error') {
      rows.push(
        <EmptyState
          key="empty"
          title="Nothing coming up yet"
          body={hasAnyFocus
            ? 'No dates or news for your exams right now. Check back soon.'
            : 'Add exams or scholarships to your focus to track their dates here.'}
        />,
      )
    }
    if (admissionsStatus === 'error') {
      rows.push(
        <ErrorState
          key="error"
          title="Couldn't load admissions news"
          body="Your exam dates and reminders still show. Check your connection, then try again."
          onRetry={onRetry}
        />,
      )
    }
  }

  return (
    <View testID="coming-up">
      <TodaySectionHeader
        title="Coming up"
        actionLabel="See all"
        actionAccessibilityLabel="See all dates and news"
        onAction={() => router.push('/(tabs)/explore?section=news')}
      />
      <InsetGroup inset={false}>{rows}</InsetGroup>
    </View>
  )
}
