import { View } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Book1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing } from '../../../theme/tokens'
import { Screen } from '../../../components/ui/Screen'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { EmptyState } from '../../../components/ui/EmptyState'
import { DetailTopBar } from '../../../components/explore/DetailTopBar'
import { ListingCard } from '../../../components/explore/ListingCard'
import { ExploreGrid, GridSkeleton, StaticGrid } from '../../../components/explore/ExploreGrid'
import { useCourseTabOptions } from '../../../hooks/useCourseTabOptions'
import type { CourseTabOption } from '../../../utils/courseTabs'

// ---------------------------------------------------------------------------
// Course picker — data from the shared useCourseTabOptions hook (the same
// cachedQuery-backed source as Explore → Courses).
// ---------------------------------------------------------------------------

const courseKey = (c: CourseTabOption) => c.courseTab
const renderCourse = (opt: CourseTabOption) => (
  <ListingCard
    icon={Book1Outlined}
    title={opt.label}
    onPress={() => router.push(('/schools/course/' + opt.courseTab) as never)}
    accessibilityHint="Opens the top schools for this course"
  />
)

export default function CoursePickerScreen() {
  const { theme: t } = useTheme()
  const { targetOptions: targetTabs, allOptions: allCourseOptions, loading, dbEmpty } = useCourseTabOptions()

  return (
    <Screen
      scroll={false}
      width="wide"
      header={<DetailTopBar bare title="Top Universities by Course" fallbackHref="/explore?section=courses" />}
    >
      {loading ? (
        <GridSkeleton label="Loading courses" />
      ) : dbEmpty ? (
        <EmptyState
          icon={<Lineicons icon={Book1Outlined} size={26} color={t.textSecondary} />}
          title="Courses are still syncing"
          body="Course list is still loading — try again in a moment."
        />
      ) : (
        <ExploreGrid
          data={allCourseOptions}
          keyExtractor={courseKey}
          renderItem={renderCourse}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ListHeaderComponent={(
            <View style={{ gap: spacing.sm }}>
              {targetTabs.length > 0 ? (
                <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                  <SectionHeader title="Your target courses" />
                  <StaticGrid items={targetTabs} keyExtractor={courseKey} renderItem={renderCourse} />
                </View>
              ) : null}
              <SectionHeader title="All courses" subtitle="Schools ranked by PRC board-exam results" />
            </View>
          )}
        />
      )}
    </Screen>
  )
}
