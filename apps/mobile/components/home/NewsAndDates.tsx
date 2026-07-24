import { useMemo } from 'react'
import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bell1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { SectionHeader } from '../ui/SectionHeader'
import { ListCard } from '../ui/ListCard'
import { InfoBanner } from '../ui/InfoBanner'
import {
  buildNewsAndDatesFeed, type FocusedListingLike, type NoteReminderLike, type MergedFeedEntry,
} from '../../utils/newsAndDatesFeed'
import type { FeedItem } from '../../utils/admissionsFeed'

const SEVERITY_DOT: Record<string, string> = {
  urgent: '🔴',
  important: '🟠',
  info: '🔵',
  no_change: '🟢',
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function msToDays(ms: number): number {
  return Math.ceil((ms - Date.now()) / 86_400_000)
}

interface Props {
  focusedListings: FocusedListingLike[]
  noteReminders: NoteReminderLike[]
  admissionItems: FeedItem[]
  hasAnyFocus: boolean
}

export function NewsAndDates({ focusedListings, noteReminders, admissionItems, hasAnyFocus }: Props) {
  const { theme: t, typo } = useTheme()

  const feed = useMemo(
    () => buildNewsAndDatesFeed({ focusedListings, noteReminders, admissionItems, now: Date.now() }),
    [focusedListings, noteReminders, admissionItems],
  )

  function onPressEntry(item: MergedFeedEntry) {
    if (item.kind === 'reminder') {
      router.push(`/notes/${item.slug}` as never)
    } else if (item.kind === 'admission') {
      if (item.slug === 'upcat' || item.title.toUpperCase().includes('UPCAT')) {
        router.push('/practice/exam/upcat' as never)
      } else {
        router.push('/(tabs)/updates' as never)
      }
    } else if (item.kind === 'listing') {
      router.push(`/listings/${item.slug}` as never)
    } else {
      router.push('/(tabs)/updates' as never)
    }
  }

  // Day-count trailing badge color follows the same tone bands as readiness
  // (near-term = danger, mid-term = warning, comfortable runway = success).
  function dayBadgeColor(daysLeft: number): string {
    const tone = daysLeft < 14 ? 'weak' : daysLeft < 30 ? 'fair' : 'strong'
    return tone === 'weak' ? t.danger : tone === 'fair' ? t.warning : t.success
  }

  return (
    <View style={{ marginTop: spacing.xl }}>
      <SectionHeader
        title="News & Dates"
        subtitle="Admission news, deadlines and exam dates on your radar"
        actionLabel="See all"
        onAction={() => router.push('/(tabs)/updates')}
      />
      {feed.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {feed.map(item => {
            if (item.kind === 'news') {
              return (
                <ListCard
                  key={item.key}
                  iconBg={t.surface2}
                  icon={<Text style={{ fontSize: 16 }}>{SEVERITY_DOT[item.severity ?? ''] ?? '🔵'}</Text>}
                  title={item.title}
                  subtitle={item.label}
                  onPress={() => onPressEntry(item)}
                />
              )
            }
            const d = msToDays(item.date!)
            const dayColor = dayBadgeColor(d)
            return (
              <ListCard
                key={item.key}
                iconBg={t.surface2}
                icon={
                  item.kind === 'reminder'
                    ? <Lineicons icon={Bell1Outlined} size={18} color={t.accentText} />
                    : <Text style={{ fontSize: 16 }}>{item.kind === 'admission' ? '📌' : item.label === 'Exam' ? '📝' : '🎓'}</Text>
                }
                title={item.title}
                subtitle={`${item.label} · ${formatShortDate(item.date!)}`}
                trailing={
                  <View style={{ backgroundColor: `${dayColor}18`, borderColor: `${dayColor}40`, borderWidth: 1, borderRadius: radius.sm, borderCurve: 'continuous', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
                    <Text style={{ fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', color: dayColor }}>{d < 1 ? 'Today' : `${d}d`}</Text>
                  </View>
                }
                onPress={() => onPressEntry(item)}
              />
            )
          })}
        </View>
      ) : (
        <InfoBanner
          icon={<Text style={{ fontSize: 16 }}>🗓️</Text>}
          message={
            hasAnyFocus
              ? 'No news or upcoming dates right now — check back soon.'
              : 'Add exams or scholarships to your focus to track upcoming dates and news.'
          }
          actionLabel="Lists"
          onAction={() => router.push('/(tabs)/listings')}
          tone="neutral"
        />
      )}
    </View>
  )
}
