import { useMemo } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bell1Outlined, CalendarDaysOutlined, Flag1Outlined, Megaphone1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { SectionHeader } from '../ui/SectionHeader'
import { Card } from '../ui/Card'
import { ListRow } from '../ui/ListRow'
import { Badge } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import {
  buildNewsAndDatesFeed, type FocusedListingLike, type NoteReminderLike, type MergedFeedEntry,
} from '../../utils/newsAndDatesFeed'
import type { FeedItem } from '../../utils/admissionsFeed'

/** Today shows only what's next; Explore owns the full list of dates and news. */
export const COMING_UP_LIMIT = 3

const SHORT_DATE = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })

function daysFrom(ms: number): number {
  return Math.ceil((ms - Date.now()) / 86_400_000)
}

function dayLabel(days: number): string {
  if (days < 1) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

function iconFor(item: MergedFeedEntry) {
  if (item.kind === 'reminder') return Bell1Outlined
  if (item.kind === 'news') return Megaphone1Outlined
  return item.label === 'Deadline' ? Flag1Outlined : CalendarDaysOutlined
}

interface Props {
  focusedListings: FocusedListingLike[]
  noteReminders: NoteReminderLike[]
  admissionItems: FeedItem[]
  hasAnyFocus: boolean
  admissionsStatus: 'loading' | 'ready' | 'error'
  onRetry: () => void
}

/** "Coming up": the next few dates and admissions news, soonest first. */
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

  let body: React.ReactNode
  if (admissionsStatus === 'loading' && feed.length === 0) {
    body = (
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton accessible label="Loading dates and news" height={40} />
        <Skeleton height={40} />
      </View>
    )
  } else {
    body = (
      <>
        {feed.map((item, i) => {
          const icon = <Lineicons icon={iconFor(item)} size={20} color={t.accentText} />
          const divider = { borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider }
          if (item.date == null) {
            return (
              <View key={item.key} style={divider}>
                <ListRow title={item.title} subtitle={item.label} leading={icon} onPress={() => onPressEntry(item)} />
              </View>
            )
          }
          const days = daysFrom(item.date)
          const when = dayLabel(days)
          const date = SHORT_DATE.format(new Date(item.date))
          return (
            <View key={item.key} style={divider}>
              <ListRow
                title={item.title}
                subtitle={`${item.label} · ${date}`}
                leading={icon}
                trailing={<Badge label={when} tone={days < 7 ? 'warning' : 'neutral'} />}
                onPress={() => onPressEntry(item)}
                accessibilityLabel={`${item.title}, ${item.label} on ${date}, ${when === 'Today' || when === 'Tomorrow' ? when.toLowerCase() : `in ${when}`}`}
              />
            </View>
          )
        })}
        {feed.length === 0 && admissionsStatus !== 'error' ? (
          <EmptyState
            title="Nothing coming up yet"
            body={hasAnyFocus
              ? 'No dates or news for your exams right now. Check back soon.'
              : 'Add exams or scholarships to your focus to track their dates here.'}
          />
        ) : null}
        {admissionsStatus === 'error' ? (
          <View style={{ borderTopWidth: feed.length > 0 ? 1 : 0, borderTopColor: t.divider }}>
            <ErrorState
              title="Couldn't load admissions news"
              body="Your exam dates and reminders still show. Check your connection, then try again."
              onRetry={onRetry}
            />
          </View>
        ) : null}
      </>
    )
  }

  return (
    <View>
      <SectionHeader
        title="Coming up"
        actionLabel="All dates & news"
        onAction={() => router.push('/(tabs)/explore?section=news')}
      />
      <Card padded={false} style={{ overflow: 'hidden' }}>{body}</Card>
    </View>
  )
}
