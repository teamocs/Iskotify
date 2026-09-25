import { useCallback, useState } from 'react'
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bell1Outlined } from '@lineiconshq/free-icons'
import { useDb } from '../hooks/useDb'
import { resultWatches, listings as listingsTable } from '../db/schema'
import { useTheme } from '../theme/ThemeContext'
import { ScreenScroll } from '../components/ui/ScreenScroll'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { DetailTopBar } from '../components/explore/DetailTopBar'
import { LinkRow } from '../components/explore/LinkRow'
import { daysUntilDate, fmtLongDate } from '../components/explore/exploreModel'
import { radius, spacing, textStyle } from '../theme/tokens'

interface WatchedExam {
  slug: string
  addedAt: number
  title: string | null
  resultsDate: number | null
  externalUrl: string | null
}

type Status = 'loading' | 'ready' | 'error'

/** One watched exam: status first, then the one relevant action. */
function WatchCard({ w, onRemove }: { w: WatchedExam; onRemove: (slug: string) => void }) {
  const { theme: t } = useTheme()
  const name = w.title ?? w.slug
  const days = daysUntilDate(w.resultsDate)
  const pending = days !== null && days > 0

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={1.6}>{name}</Text>
        <Badge label={pending ? 'Waiting for results' : w.resultsDate ? 'Results may be out' : 'No results date yet'} tone={pending ? 'neutral' : w.resultsDate ? 'success' : 'neutral'} />
      </View>

      {pending ? (
        <View
          accessible
          accessibilityLabel={`${days} days to go, results expected ${fmtLongDate(w.resultsDate!)}`}
          style={{ gap: 2 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
            <Text style={textStyle('numericLg', t.textPrimary)} maxFontSizeMultiplier={1.3}>{String(days)}</Text>
            <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.6}>days to go</Text>
          </View>
          <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>
            Expected {fmtLongDate(w.resultsDate!)}
          </Text>
        </View>
      ) : w.resultsDate ? (
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>
          Expected {fmtLongDate(w.resultsDate)}. Check the official site for your result.
        </Text>
      ) : (
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>
          We'll show a countdown once the school announces a results date.
        </Text>
      )}

      {!pending && w.externalUrl ? (
        <LinkRow
          label="Check results on the official site"
          accessibilityLabel={`Check ${name} results on the official site`}
          url={w.externalUrl}
        />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button
          label="Stop tracking"
          accessibilityLabel={`Stop tracking ${name}`}
          variant="ghost"
          size="sm"
          onPress={() => onRemove(w.slug)}
        />
      </View>
    </Card>
  )
}

export default function ResultsTrackerScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const [watches, setWatches] = useState<WatchedExam[]>([])
  const [status, setStatus] = useState<Status>('loading')

  const load = useCallback(async () => {
    try {
      const rows = await db
        .select({
          slug: resultWatches.slug,
          addedAt: resultWatches.addedAt,
          title: listingsTable.title,
          resultsDate: listingsTable.resultsDate,
          externalUrl: listingsTable.externalUrl,
        })
        .from(resultWatches)
        .leftJoin(listingsTable, eq(listingsTable.slug, resultWatches.slug))
      setWatches(rows as WatchedExam[])
      setStatus('ready')
    } catch (e) {
      console.warn('[ResultsTracker] load failed:', e)
      setStatus('error')
    }
  }, [db])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const removeWatch = useCallback(async (slug: string) => {
    try {
      await db.delete(resultWatches).where(eq(resultWatches.slug, slug))
      setWatches(prev => prev.filter(w => w.slug !== slug))
    } catch (e) {
      console.warn('[ResultsTracker] removeWatch failed:', e)
    }
  }, [db])

  // Soonest results first; undated last.
  const sorted = [...watches].sort((a, b) => (a.resultsDate ?? Infinity) - (b.resultsDate ?? Infinity))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <DetailTopBar title="Results Tracker" fallbackHref="/explore?section=news" />
      <ScreenScroll tabBarInset={false} contentContainerStyle={{ paddingTop: spacing.xs, gap: spacing.md }}>
        {status === 'loading' ? (
          <View testID="results-skeleton" accessible accessibilityLabel="Loading tracked results" aria-busy style={{ gap: spacing.md }}>
            <Skeleton height={140} radius={radius.xl} />
            <Skeleton height={140} radius={radius.xl} />
          </View>
        ) : status === 'error' ? (
          <ErrorState title="Couldn't load your tracked results" onRetry={() => { setStatus('loading'); void load() }} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<Lineicons icon={Bell1Outlined} size={26} color={t.textSecondary} />}
            title="No results tracked yet"
            body="Open an entrance exam and tap Watch results. We'll count down to its results date here."
            actionLabel="Find an exam"
            onAction={() => router.push('/explore?section=universities')}
          />
        ) : (
          <>
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>
              Results dates are estimates from past years.
            </Text>
            {sorted.map(w => <WatchCard key={w.slug} w={w} onRemove={removeWatch} />)}
          </>
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
