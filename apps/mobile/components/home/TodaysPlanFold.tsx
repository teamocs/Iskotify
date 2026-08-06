import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { ProgressRing } from '../ui/ProgressRing'
import type { StudyPlanItem } from '../../hooks/useStudyPlan'
import type { StudyPlanItemKind } from '../../utils/studyPlan'

interface Props {
  items: StudyPlanItem[]
  loading: boolean
  allDone: boolean
  tomorrowItemCount: number
  streakDays: number
  /** topicId → display name, from the Home screen's already-loaded topic catalog. */
  topicNameById: Map<string, string>
  onMarkComplete: (id: number) => void
}

const KIND_ICON: Record<StudyPlanItemKind, string> = {
  srs_review: '🗂️',
  topic_practice: '📘',
  mock_section: '⏱️',
  diagnostic: '🧭',
}

function itemTitle(item: StudyPlanItem, topicNameById: Map<string, string>): string {
  switch (item.kind) {
    case 'srs_review':
      return `Review ${item.targetCount} due flashcard${item.targetCount === 1 ? '' : 's'}`
    case 'topic_practice':
      return `Practice ${topicNameById.get(item.refId) ?? 'this topic'}`
    case 'mock_section':
      return 'Timed mock section'
    case 'diagnostic':
      return 'Quick diagnostic'
  }
}

function itemSubtitle(item: StudyPlanItem): string {
  switch (item.kind) {
    case 'srs_review':
      return 'Keeps your spaced-repetition schedule on track'
    case 'topic_practice':
      return `${item.targetCount} questions · your weakest area`
    case 'mock_section':
      return 'Dress rehearsal for the real exam'
    case 'diagnostic':
      return 'Find your baseline in a few minutes'
  }
}

function routeFor(item: StudyPlanItem): string {
  switch (item.kind) {
    case 'srs_review':
      return '/practice/due'
    case 'topic_practice':
      return `/practice/${item.refId}`
    case 'mock_section':
      return `/practice/exam/${item.refId}`
    case 'diagnostic':
      return '/practice/diagnostic'
  }
}

export function TodaysPlanFold({
  items, loading, allDone, tomorrowItemCount, streakDays, topicNameById, onMarkComplete,
}: Props) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => makeStyles(), [])

  const completedCount = items.filter(i => i.completedAt != null).length
  const progress = items.length > 0 ? completedCount / items.length : 0

  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={s.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.title, { color: t.textPrimary }]} maxFontSizeMultiplier={1.4}>Today's Plan</Text>
          <Text style={[s.subtitle, { color: t.textTertiary }]} maxFontSizeMultiplier={1.4}>
            Picked for you, based on how you're doing
          </Text>
        </View>
        {streakDays > 0 ? (
          <View style={[s.streakChip, { backgroundColor: t.warningSurface, borderColor: t.warning }]}>
            <Text style={s.streakEmoji}>🔥</Text>
            <Text style={[s.streakTxt, { color: t.warning }]} maxFontSizeMultiplier={1.4}>{streakDays}</Text>
          </View>
        ) : null}
        {items.length > 0 ? (
          <ProgressRing
            progress={progress}
            size={38}
            strokeWidth={4}
            label={`${completedCount}/${items.length}`}
            color={t.success}
            trackColor={t.surfaceSubtle}
          />
        ) : null}
      </View>

      {loading ? (
        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[s.emptyTxt, { color: t.textTertiary }]} maxFontSizeMultiplier={1.4}>Building today's plan…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={[s.card, s.doneCard, { backgroundColor: t.successSurface, borderColor: t.success }]}>
          <Text style={s.doneEmoji}>✅</Text>
          <Text style={[s.doneTitle, { color: t.textPrimary }]} maxFontSizeMultiplier={1.4}>You're all caught up!</Text>
          <Text style={[s.doneSub, { color: t.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {tomorrowItemCount > 0
              ? `Nothing due right now — check back tomorrow for ${tomorrowItemCount} more.`
              : 'Nothing due right now. Nice work staying ahead.'}
          </Text>
        </View>
      ) : allDone ? (
        <View style={[s.card, s.doneCard, { backgroundColor: t.successSurface, borderColor: t.success }]}>
          <Text style={s.doneEmoji}>🎉</Text>
          <Text style={[s.doneTitle, { color: t.textPrimary }]} maxFontSizeMultiplier={1.4}>Plan complete for today!</Text>
          <Text style={[s.doneSub, { color: t.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {tomorrowItemCount > 0
              ? `Come back tomorrow for ${tomorrowItemCount} more item${tomorrowItemCount === 1 ? '' : 's'}.`
              : 'Come back tomorrow for your next plan.'}
          </Text>
        </View>
      ) : (
        <View style={s.list}>
          {items.map(item => {
            const done = item.completedAt != null
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [s.card, { backgroundColor: t.surface, borderColor: t.border, boxShadow: t.shadowSm }, pressed && { opacity: 0.85 }, done && { opacity: 0.6 }]}
                onPress={() => router.push(routeFor(item) as never)}
                accessibilityRole="button"
                accessibilityLabel={itemTitle(item, topicNameById)}
              >
                <Pressable
                  onPress={(e) => { e.stopPropagation(); if (!done) onMarkComplete(item.id) }}
                  hitSlop={8}
                  style={[s.checkbox, { borderColor: done ? t.success : t.border, backgroundColor: done ? t.success : 'transparent' }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={done ? 'Marked done' : 'Mark done'}
                >
                  {done ? <Text style={s.checkmark}>✓</Text> : null}
                </Pressable>
                <Text style={s.kindIcon}>{KIND_ICON[item.kind]}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[s.itemTitle, { color: t.textPrimary }, done && { textDecorationLine: 'line-through' }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.4}
                  >
                    {itemTitle(item, topicNameById)}
                  </Text>
                  <Text style={[s.itemSub, { color: t.textTertiary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                    {itemSubtitle(item)}
                  </Text>
                </View>
                {!done ? <Text style={[s.chevron, { color: t.textTertiary }]}>›</Text> : null}
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}

function makeStyles() {
  return StyleSheet.create({
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    title: { fontSize: 20, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -0.2 },
    subtitle: { fontSize: 12, fontFamily: 'Lexend_400Regular', marginTop: 2 },
    streakChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
    streakEmoji: { fontSize: 12 },
    streakTxt: { fontSize: 12, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    list: { gap: spacing.sm },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      padding: spacing.md,
    },
    checkbox: {
      width: 22, height: 22, borderRadius: 11, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
    kindIcon: { fontSize: 18 },
    itemTitle: { fontSize: 14, fontWeight: '600', fontFamily: 'Outfit_600SemiBold' },
    itemSub: { fontSize: 11, fontFamily: 'Lexend_400Regular', marginTop: 1 },
    chevron: { fontSize: 20 },
    emptyTxt: { fontSize: 13, fontFamily: 'Lexend_400Regular', textAlign: 'center', paddingVertical: spacing.sm },
    doneCard: { flexDirection: 'column', alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
    doneEmoji: { fontSize: 28, marginBottom: 4 },
    doneTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    doneSub: { fontSize: 13, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
  })
}
