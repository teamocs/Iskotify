import { useMemo } from 'react'
import {
  StyleSheet, View, Text, Pressable, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing } from '../../../theme/tokens'
import { ScreenScroll } from '../../../components/ui/ScreenScroll'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { ListCard } from '../../../components/ui/ListCard'
import { useCourseTabOptions } from '../../../hooks/useCourseTabOptions'

// ---------------------------------------------------------------------------
// Screen — data comes from the shared useCourseTabOptions hook (same source
// as the Lists screen's Courses tab, cachedQuery-backed).
// ---------------------------------------------------------------------------

export default function CoursePickerScreen() {
  const { theme: t, typo } = useTheme()
  const { targetOptions: targetTabs, allOptions: allCourseOptions, loading, dbEmpty } = useCourseTabOptions()

  const s = useMemo(() => StyleSheet.create({
    root:      { flex: 1, backgroundColor: t.bg },
    topBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
    backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:  { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    empty:     { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: spacing.xl, fontStyle: 'italic' },
    section:   { gap: spacing.sm },
  }), [t, typo])

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── DB-empty state ─────────────────────────────────────────────────────────

  if (dbEmpty) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={s.backArrow}>‹</Text>
          </Pressable>
          <Text style={s.topTitle} numberOfLines={1}>Top Universities by Course</Text>
        </View>
        <Text style={s.empty}>
          Course list is still loading — try again in a moment.
        </Text>
      </SafeAreaView>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
        <Text style={s.topTitle} numberOfLines={1}>Top Universities by Course</Text>
      </View>

      <ScreenScroll tabBarInset={false} contentContainerStyle={{ gap: spacing.lg, paddingTop: spacing.sm }}>

        {/* ── Your target courses ── */}
        {targetTabs.length > 0 ? (
          <View style={s.section}>
            <SectionHeader title="Your target courses" />
            {targetTabs.map(opt => (
              <ListCard
                key={opt.courseTab}
                icon={<Text style={{ fontSize: 16 }}>★</Text>}
                title={opt.label}
                onPress={() => router.push(('/schools/course/' + opt.courseTab) as never)}
              />
            ))}
          </View>
        ) : null}

        {/* ── All courses ── */}
        <View style={s.section}>
          <SectionHeader title="All courses" />
          {allCourseOptions.map(opt => (
            <ListCard
              key={opt.courseTab}
              title={opt.label}
              onPress={() => router.push(('/schools/course/' + opt.courseTab) as never)}
            />
          ))}
        </View>

      </ScreenScroll>
    </SafeAreaView>
  )
}
