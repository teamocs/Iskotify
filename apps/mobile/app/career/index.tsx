import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, Pressable,
  ActivityIndicator, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDb } from '../../hooks/useDb'
import { careerCourses as coursesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseRow {
  courseId: string
  name: string | null
  cluster: string | null
  demand: string | null
  topCountries: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function demandColor(demand: string | null): string {
  switch ((demand ?? '').toLowerCase()) {
    case 'very high': return '#4ade80'
    case 'high':      return '#86efac'
    case 'moderate':  return '#fbbf24'
    case 'low':       return '#f87171'
    default:          return 'rgba(255,255,255,0.38)'
  }
}

// Group courses by cluster
function groupByCluster(courses: CourseRow[]): Array<{ cluster: string; items: CourseRow[] }> {
  const map = new Map<string, CourseRow[]>()
  for (const c of courses) {
    const key = c.cluster ?? 'Other'
    const arr = map.get(key) ?? []
    arr.push(c)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cluster, items]) => ({ cluster, items }))
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CareerPathsScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState('')

  useEffect(() => {
    async function load() {
      const rows = await db.select({
        courseId:     coursesTable.courseId,
        name:         coursesTable.name,
        cluster:      coursesTable.cluster,
        demand:       coursesTable.demand,
        topCountries: coursesTable.topCountries,
      }).from(coursesTable)
      setCourses(rows as CourseRow[])
      setLoading(false)
    }
    void load()
  }, [db])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return courses
    return courses.filter(c =>
      (c.name ?? '').toLowerCase().includes(q) ||
      (c.cluster ?? '').toLowerCase().includes(q)
    )
  }, [courses, query])

  const groups = useMemo(() => groupByCluster(filtered), [filtered])

  const s = useMemo(() => StyleSheet.create({
    root:         { flex: 1, backgroundColor: t.bg },
    topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn:      { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    backArrow:    { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    title:        { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    subtitle:     { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: spacing.xs },
    headerBlock:  { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md },
    searchWrap:   { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    searchInput:  { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: typo.base, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    clusterSection: { marginBottom: spacing.lg },
    courseRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
    courseDivider:{ borderTopWidth: 1, borderTopColor: t.divider },
    courseIcon:   { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    courseIconTxt: { fontSize: 16 },
    courseBody:   { flex: 1, minWidth: 0 },
    courseName:   { fontSize: typo.base, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    courseSub:    { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    demandBadge:  { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
    demandTxt:    { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    chevron:      { color: t.textTertiary, fontSize: 18, flexShrink: 0 },
    empty:        { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60, fontSize: typo.base },
    disclaimer:   { marginTop: spacing.md, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md },
    disclaimerTxt:{ fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 17 },
  }), [t, typo])

  // ── Loading ──────────────────────────────────────────────────────────────────

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
        <View style={s.headerBlock}>
          <Text style={s.title}>Career Paths</Text>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>

      {/* Nav row */}
      <View style={s.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
      </View>

      {/* Title */}
      <View style={s.headerBlock}>
        <Text style={s.title}>Career Paths</Text>
        <Text style={s.subtitle}>Explore courses by cluster and global demand</Text>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search courses..."
          placeholderTextColor={t.textTertiary}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScreenScroll tabBarInset={false} keyboardShouldPersistTaps="handled">

        {groups.length === 0 ? (
          <Text style={s.empty}>No courses found.</Text>
        ) : (
          groups.map(group => (
            <View key={group.cluster} style={s.clusterSection}>
              <SectionHeader title={group.cluster} />

              {/* Courses */}
              <Card elevated>
                {group.items.map((course, idx) => {
                  const topCountries = safeParseArray(course.topCountries)
                  const dc = demandColor(course.demand)
                  return (
                    <Pressable
                      key={course.courseId}
                      style={({ pressed }) => [
                        s.courseRow,
                        idx > 0 && s.courseDivider,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => router.push(`/career/${course.courseId}` as never)}
                      accessibilityRole="button"
                    >
                      <View style={s.courseIcon}>
                        <Text style={s.courseIconTxt}>🎓</Text>
                      </View>
                      <View style={s.courseBody}>
                        <Text style={s.courseName} numberOfLines={1}>{course.name ?? course.courseId}</Text>
                        <Text style={s.courseSub} numberOfLines={1}>
                          {topCountries.length > 0 ? topCountries.slice(0, 3).join(' · ') : 'No destination data'}
                        </Text>
                      </View>
                      {course.demand ? (
                        <View style={[s.demandBadge, { backgroundColor: `${dc}18`, borderColor: `${dc}40` }]}>
                          <Text style={[s.demandTxt, { color: dc }]}>{course.demand}</Text>
                        </View>
                      ) : null}
                      <Text style={s.chevron}>›</Text>
                    </Pressable>
                  )
                })}
              </Card>
            </View>
          ))
        )}

        {/* Disclaimer */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTxt}>
            AI-Safe-Score · Verify demand, salaries & pathways with DMW/POEA and official sources.
          </Text>
        </View>

      </ScreenScroll>
    </SafeAreaView>
  )
}
