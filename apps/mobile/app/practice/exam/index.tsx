import { useState, useEffect } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { getExamBlueprint, listPublishedBlueprintSlugs, type ExamBlueprint } from '../../../services/examBlueprints'
import { ScreenScroll } from '../../../components/ui/ScreenScroll'
import { ListCard } from '../../../components/ui/ListCard'
import { WebTopSpacer } from '../../../components/ui/WebTopSpacer'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing } from '../../../theme/tokens'

export default function ExamPicker() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const [loading, setLoading] = useState(true)
  const [blueprints, setBlueprints] = useState<ExamBlueprint[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const slugs = await listPublishedBlueprintSlugs(db)
        const loaded = await Promise.all(slugs.map(slug => getExamBlueprint(db, slug)))
        setBlueprints(loaded.filter((b): b is ExamBlueprint => b !== null))
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
              return (
                <ListCard
                  key={bp.slug}
                  icon={<Text style={{ fontSize: 20 }}>📝</Text>}
                  title={bp.name}
                  subtitle={`${bp.totalItems} items · ${hours}h`}
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
