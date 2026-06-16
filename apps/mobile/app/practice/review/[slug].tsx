import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import { listings as listingsTable } from '../../../db/schema'
import { usePracticeData, type Strength, type TopicRow } from '../../../hooks/usePracticeData'
import { groupTopicsBySubject } from '../../../utils/groupTopicsBySubject'
import { SubjectAccordion } from '../../../components/SubjectAccordion'
import { ListCard } from '../../../components/ui/ListCard'
import { Badge } from '../../../components/ui/Badge'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing } from '../../../theme/tokens'

// Maps a topic strength to a design-system Badge tone (mirrors practice.tsx).
const STRENGTH_TONE: Record<Strength, 'accent' | 'neutral' | 'success' | 'warning' | 'danger'> = {
  New: 'accent', Weak: 'danger', Review: 'warning', Strong: 'success',
}

// ── Topic row (mirrors practice.tsx's TopicCard) ────────────────────────────────

function TopicCard({ row }: { row: TopicRow }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <ListCard
        icon={<Text style={{ color: t.accentText, fontSize: 15 }}>📖</Text>}
        title={row.topic.name}
        subtitle={`${row.cardCount} cards`}
        trailing={<Badge label={row.strength} tone={STRENGTH_TONE[row.strength]} />}
        onPress={() => router.push(`/practice/${row.topic.id}`)}
      />
    </View>
  )
}

// ── Screen: exam subjects → topics → review ─────────────────────────────────────
// "Take a Review" destination. Shows ONLY this exam's subjects/topics; tapping a
// topic launches that topic's per-topic review (the existing /practice/[topicId] route).

export default function PracticeReviewScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const { subjects, topicRows, topicIdsByListingSlug } = usePracticeData()

  const [listingTitle, setListingTitle] = useState('')

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
    backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    subHint: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    emptyWrap: { paddingHorizontal: spacing.xxxl, paddingTop: 64, alignItems: 'center' },
    emptyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: spacing.xs },
    emptySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 20 },
  }), [t, typo])

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

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>{listingTitle}</Text>
      </View>

      {examTopicRows.length > 0 ? (
        <>
          <Text style={s.subHint} maxFontSizeMultiplier={1.4}>Pick a subject, then a topic to review.</Text>
          <View style={s.body}>
            <SubjectAccordion
              groups={subjectGroups}
              emptyText="No review topics for this exam yet."
              initiallyExpanded="focused"
              keyExtractor={(row) => row.topic.id}
              renderRow={(row) => {
                if (!row) return null
                return <TopicCard row={row} />
              }}
            />
          </View>
        </>
      ) : (
        <View style={s.emptyWrap}>
          <Text style={s.emptyTitle} maxFontSizeMultiplier={1.4}>No review topics yet</Text>
          <Text style={s.emptySub} maxFontSizeMultiplier={1.4}>
            No review topics for this exam yet — try a mock exam or check back after syncing.
          </Text>
        </View>
      )}
    </SafeAreaView>
  )
}
