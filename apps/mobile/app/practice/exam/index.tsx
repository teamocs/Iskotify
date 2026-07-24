import { useState, useEffect } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { getExamBlueprint, listPublishedBlueprintSlugs, type ExamBlueprint } from '../../../services/examBlueprints'
import { getListingMockBest, getListingAccuracy } from '../../../services/homeAggregates'
import { readinessTone, type ReadinessTone } from '../../../utils/readinessTone'
import { ScreenScroll } from '../../../components/ui/ScreenScroll'
import { ListCard } from '../../../components/ui/ListCard'
import { Badge } from '../../../components/ui/Badge'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing } from '../../../theme/tokens'

// Mirrors FocusExamsFold's / the Lists screen's tone→Badge mapping so the same
// readiness % reads the same color everywhere in the app.
const TONE_TO_BADGE: Record<ReadinessTone, 'success' | 'warning' | 'danger' | 'neutral'> = {
  strong: 'success', fair: 'warning', weak: 'danger', none: 'neutral',
}

export default function ExamPicker() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const [loading, setLoading] = useState(true)
  const [blueprints, setBlueprints] = useState<ExamBlueprint[]>([])
  // Per-exam readiness (Global Constraints: getListingMockBest, falling back to
  // listingAccuracy) — blueprint.slug IS the listing slug, so this keys directly.
  const [listingMockBest, setListingMockBest] = useState<Map<string, number>>(new Map())
  const [listingAccuracy, setListingAccuracy] = useState<Record<string, number>>({})

  useEffect(() => {
    void (async () => {
      try {
        const [slugs, mockBestRows, accuracyRows] = await Promise.all([
          listPublishedBlueprintSlugs(db),
          getListingMockBest(db),
          getListingAccuracy(db),
        ])
        const loaded = await Promise.all(slugs.map(slug => getExamBlueprint(db, slug)))
        setBlueprints(loaded.filter((b): b is ExamBlueprint => b !== null))
        setListingMockBest(new Map(mockBestRows.map(r => [r.listingSlug, r.bestPct])))
        setListingAccuracy(Object.fromEntries(
          accuracyRows.filter(r => r.total > 0).map(r => [r.listingSlug, Math.round((r.ok / r.total) * 100)]),
        ))
      } finally {
        setLoading(false)
      }
    })()
  }, [db])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <WebTopSpacer />
      <ScreenScroll tabBarInset={false}>
        <Text
          style={{
            fontSize: typo.h2, fontWeight: '700', color: t.textPrimary,
            fontFamily: 'Outfit_700Bold', marginTop: spacing.md, marginBottom: spacing.lg,
          }}
        >
          Mock Exams
        </Text>

        {loading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : blueprints.length === 0 ? (
          <Text style={{ fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' }}>
            No mock exams are available yet — check back soon.
          </Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {blueprints.map(bp => {
              const hours = Math.round((bp.totalTimeMinutes / 60) * 10) / 10
              const pct = listingMockBest.get(bp.slug) ?? listingAccuracy[bp.slug] ?? null
              return (
                <ListCard
                  key={bp.slug}
                  icon={<Text style={{ fontSize: 20 }}>📝</Text>}
                  title={bp.name}
                  subtitle={`${bp.totalItems} items · ${hours}h`}
                  trailing={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Badge label={pct != null ? `${pct}%` : '—'} tone={TONE_TO_BADGE[readinessTone(pct)]} />
                      <Text style={{ fontSize: 20, color: t.textTertiary }}>›</Text>
                    </View>
                  }
                  onPress={() => router.push(`/practice/exam/${bp.slug}`)}
                />
              )
            })}
          </View>
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
