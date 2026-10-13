import { useState, useEffect, useMemo } from 'react'
import { View, Text } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { listings as listingsTable } from '../../../db/schema'
import { usePracticeData, type TopicRow } from '../../../hooks/usePracticeData'
import { groupTopicsBySubject } from '../../../utils/groupTopicsBySubject'
import { SubjectAccordion } from '../../../components/SubjectAccordion'
import { ListRow } from '../../../components/ui/ListRow'
import { Text as RoleText } from '../../../components/ui/Text'
import { Screen } from '../../../components/ui/Screen'
import { TwoColumn } from '../../../components/ui/TwoColumn'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { PageTitle } from '../../../components/ui/PageTitle'
import { heading } from '../../../components/ui/a11y'
import { DetailTopBar } from '../../../components/explore/DetailTopBar'
import { SessionEmpty, SessionLoading } from '../../../components/practice/SessionStates'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import { useTheme } from '../../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Book1Outlined } from '@lineiconshq/free-icons'
import { spacing, iosTextStyle } from '../../../theme/tokens'

// ── Topic row ───────────────────────────────────────────────────────────────────
// iOS redesign P4: a topic shows its accuracy as a neutral number (the same
// ink at any score), or "New" before it is practised. Never a Weak / Strong
// verdict badge or a tone keyed to the score.

function TopicCard({ row }: { row: TopicRow }) {
  const { theme: t } = useTheme()
  const practised = row.accuracy != null
  return (
    <ListRow
      leading={<Lineicons icon={Book1Outlined} size={18} color={t.textSecondary} />}
      title={row.topic.name}
      subtitle={`${row.cardCount} cards`}
      trailing={(
        <RoleText role="headline" color={t.textSecondary} style={{ fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.6}>
          {practised ? `${row.accuracy}%` : 'New'}
        </RoleText>
      )}
      accessibilityLabel={`${row.topic.name}, ${row.cardCount} cards, ${practised ? `${row.accuracy}% so far` : 'not practised yet'}`}
      onPress={() => router.push(`/practice/${row.topic.id}`)}
    />
  )
}

// ── Screen: exam subjects → topics → review ─────────────────────────────────────
// "Take a Review" destination. Shows ONLY this exam's subjects/topics; tapping a
// topic launches that topic's per-topic review (the existing /practice/[topicId] route).

export default function PracticeReviewScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t } = useTheme()
  const { subjects, topicRows, topicIdsByListingSlug, loaded } = usePracticeData()
  const twoUp = useBreakpoint() === 'expanded'

  const [listingTitle, setListingTitle] = useState('')


  useEffect(() => {
    let alive = true
    void (async () => {
      const rows = await db.select({ title: listingsTable.title }).from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1)
      if (!alive) return
      setListingTitle(rows[0]?.title ?? slug)
    })()
    return () => { alive = false }
  }, [db, slug])

  // Scope to THIS exam: keep only topic rows whose id is tagged to this listing.
  const examTopicRows = useMemo(() => {
    const examTopicIds = new Set(topicIdsByListingSlug[slug] ?? [])
    return topicRows.filter(r => examTopicIds.has(r.topic.id))
  }, [topicRows, topicIdsByListingSlug, slug])

  const topicRowById = useMemo(
    () => new Map(examTopicRows.map(r => [r.topic.id, r])),
    [examTopicRows],
  )

  // Group the FILTERED rows by subject — same shape practice.tsx uses, scoped to one slug.
  const subjectGroups = useMemo(() => {
    function avgAccuracy(items: Array<{ accuracy?: number | null }>): number {
      const practiced = items.filter(i => i.accuracy != null) as Array<{ accuracy: number }>
      if (practiced.length === 0) return 0
      return Math.round(practiced.reduce((sum, i) => sum + i.accuracy, 0) / practiced.length)
    }
    return groupTopicsBySubject(
      {
        topics: examTopicRows.map(r => ({
          id: r.topic.id,
          name: r.topic.name,
          subjectId: r.topic.subjectId,
          accuracy: r.accuracy,
        })),
        subjects,
        focusListingSlugs: [slug],
        topicIdsByListingSlug,
      },
      (topic) => topicRowById.get(topic.id)!,
      (rows, raws) => {
        const allNew = raws.every(r => r.accuracy == null)
        return allNew ? `${rows.length} topics · New` : `${rows.length} topics · ${avgAccuracy(raws)}% avg`
      },
      'accuracy-asc',
    )
  }, [examTopicRows, topicRowById, subjects, slug, topicIdsByListingSlug])

  // One next step: the weakest practised topic, else the first new one.
  const nextTopic = useMemo(() => {
    const practised = examTopicRows.filter(r => r.accuracy != null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    return practised[0] ?? examTopicRows[0] ?? null
  }, [examTopicRows])

  if (!loaded) return <SessionLoading label="Loading review topics" />

  if (examTopicRows.length === 0) {
    return (
      <SessionEmpty
        title="No review topics yet"
        body="No review topics for this exam yet. Try a mock exam, or check back after syncing."
      />
    )
  }

  const hero = nextTopic ? (
    <Card elevated testID="review-next-step" style={{ padding: spacing.xl, gap: spacing.md }}>
      <Text {...heading(2)} style={iosTextStyle('headline', t.textSecondary)} maxFontSizeMultiplier={2}>
        {nextTopic.accuracy != null ? 'Focus here next' : 'Start here'}
      </Text>
      <View style={{ gap: spacing.xs }}>
        <Text style={iosTextStyle('title3', t.textPrimary)} maxFontSizeMultiplier={1.6}>{nextTopic.topic.name}</Text>
        <Text style={iosTextStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>
          {nextTopic.accuracy != null
            ? `${nextTopic.accuracy}% so far · ${nextTopic.cardCount} cards`
            : `${nextTopic.cardCount} cards · not practised yet`}
        </Text>
      </View>
      <Button
        label={`Review ${nextTopic.topic.name}`}
        size="lg"
        fullWidth={!twoUp}
        style={twoUp ? { alignSelf: 'flex-start' } : undefined}
        onPress={() => router.push(`/practice/${nextTopic.topic.id}`)}
      />
    </Card>
  ) : null

  const topicsList = (
    <View style={{ gap: spacing.sm }}>
      <Text {...heading(2)} style={iosTextStyle('headline', t.textPrimary)} maxFontSizeMultiplier={2}>All topics</Text>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <SubjectAccordion
          groups={subjectGroups}
          emptyText="No review topics for this exam yet."
          initiallyExpanded="focused"
          keyExtractor={(row) => row.topic.id}
          renderRow={(row) => (row ? <TopicCard row={row} /> : null)}
        />
      </Card>
    </View>
  )

  return (
    <Screen header={<DetailTopBar bare fallbackHref="/practice" />} width={twoUp ? 'wide' : 'reading'}>
      <PageTitle title={listingTitle} lead="Pick a subject, then a topic to review." />
      {twoUp ? (
        <TwoColumn primary={topicsList} secondary={hero} />
      ) : (
        <View style={{ gap: spacing.xxl }}>
          {hero}
          {topicsList}
        </View>
      )}
    </Screen>
  )
}
