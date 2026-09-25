import { useState, useEffect } from 'react'
import { View, Text, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined, FileQuestionOutlined } from '@lineiconshq/free-icons'
import { useDb } from '../../../hooks/useDb'
import { getExamBlueprint, listPublishedBlueprintSlugs, type ExamBlueprint } from '../../../services/examBlueprints'
import { getListingMockBest, getListingAccuracy } from '../../../services/homeAggregates'
import { Screen } from '../../../components/ui/Screen'
import { ListRow } from '../../../components/ui/ListRow'
import { StatNumber } from '../../../components/ui/StatNumber'
import { Skeleton } from '../../../components/ui/Skeleton'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { focusRing, type WebPressableState } from '../../../components/ui/a11y'
import { useTheme } from '../../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../../theme/tokens'

type Row = { bp: ExamBlueprint; best: number | null }
type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: Row[] }

function length(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 10) / 10} h`
}

/**
 * Every published mock exam (Practice → Mock exams → See all). Best score is a
 * plain number in the same neutral style for every exam: no red/amber/green
 * verdict (the same rule PR #28 applied to results).
 */
export default function ExamPicker() {
  const db = useDb()
  const { theme: t } = useTheme()
  const [state, setState] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void (async () => {
      try {
        const [slugs, mockBestRows, accuracyRows] = await Promise.all([
          listPublishedBlueprintSlugs(db),
          getListingMockBest(db),
          getListingAccuracy(db),
        ])
        const loaded = (await Promise.all(slugs.map(slug => getExamBlueprint(db, slug))))
          .filter((b): b is ExamBlueprint => b !== null)
        // Readiness: best mock %, falling back to listing accuracy (blueprint.slug IS the listing slug).
        const best = new Map(mockBestRows.map(r => [r.listingSlug, r.bestPct]))
        const acc = new Map(accuracyRows.filter(r => r.total > 0).map(r => [r.listingSlug, Math.round((r.ok / r.total) * 100)]))
        if (!cancelled) setState({ status: 'ready', rows: loaded.map(bp => ({ bp, best: best.get(bp.slug) ?? acc.get(bp.slug) ?? null })) })
      } catch (e) {
        console.warn('[practice/exam] load failed:', e)
        if (!cancelled) setState({ status: 'error' })
      }
    })()
    return () => { cancelled = true }
  }, [db, attempt])

  const back = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={(s) => {
        const { pressed, focused } = s as WebPressableState
        return [
          { width: 44, height: 44, marginLeft: -spacing.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent' },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <Lineicons icon={ChevronLeftOutlined} size={24} color={t.textSecondary} />
    </Pressable>
  )

  return (
    <Screen header={<View style={{ paddingTop: spacing.sm }}>{back}</View>}>
      <View style={{ gap: spacing.lg, paddingTop: spacing.xs }}>
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.4}>Mock exams</Text>
          <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.8}>
            Full-length, timed practice. Each one also has a 30-minute Study Sprint.
          </Text>
        </View>

        {state.status === 'loading' ? (
          <View accessible accessibilityLabel="Loading mock exams" accessibilityState={{ busy: true }} style={{ gap: spacing.sm }}>
            {[0, 1, 2].map(i => <Skeleton key={i} height={64} radius={radius.lg} />)}
          </View>
        ) : state.status === 'error' ? (
          <ErrorState title="Couldn't load mock exams" onRetry={() => setAttempt(n => n + 1)} />
        ) : state.rows.length === 0 ? (
          <EmptyState
            icon={<Lineicons icon={FileQuestionOutlined} size={24} color={t.textSecondary} />}
            title="No mock exams yet"
            body="Mock exams appear here as soon as they are published. Subjects and drills are ready in the meantime."
          />
        ) : (
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' }}>
            {state.rows.map(({ bp, best }, i) => (
              <View key={bp.slug} style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: t.divider }}>
                <ListRow
                  title={bp.name}
                  subtitle={`${bp.totalItems} items · ${length(bp.totalTimeMinutes)}`}
                  accessibilityLabel={`${bp.name}, ${bp.totalItems} items, ${length(bp.totalTimeMinutes)}, ${best == null ? 'not taken yet' : `best ${best}%`}`}
                  trailing={<StatNumber value={best == null ? '–' : `${best}%`} label={best == null ? 'New' : 'Best'} />}
                  onPress={() => router.push(`/practice/exam/${bp.slug}`)}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  )
}
