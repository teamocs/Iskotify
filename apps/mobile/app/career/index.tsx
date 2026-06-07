import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDb } from '../../hooks/useDb'
import { careerCourses as coursesTable } from '../../db/schema'
import { useTheme } from '../../theme/ThemeContext'

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
    topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
    backBtn:      { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    backArrow:    { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
    topTitle:     { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    searchWrap:   { marginHorizontal: 14, marginBottom: 10 },
    searchInput:  { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    scroll:       { paddingBottom: 32 },
    clusterHdr:   { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
    clusterTitle: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.9, fontFamily: 'Lexend_600SemiBold' },
    courseCard:   { marginHorizontal: 14, marginBottom: 8, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    courseIcon:   { width: 36, height: 36, borderRadius: 10, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    courseIconTxt: { fontSize: 16 },
    courseBody:   { flex: 1, minWidth: 0 },
    courseName:   { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    courseSub:    { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', lineHeight: 15 },
    demandBadge:  { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
    demandTxt:    { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    chevron:      { color: t.textTertiary, fontSize: 18, flexShrink: 0 },
    empty:        { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60, fontSize: typo.sm },
    disclaimer:   { marginHorizontal: 14, marginTop: 8, marginBottom: 16, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: 12, padding: 12 },
    disclaimerTxt:{ fontSize: typo.xs, color: '#fbbf24', fontFamily: 'Lexend_400Regular', lineHeight: 17 },
  }), [t, typo])

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Career Paths</Text>
        </View>
        <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>Career Paths</Text>
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

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {groups.length === 0 ? (
          <Text style={s.empty}>No courses found.</Text>
        ) : (
          groups.map(group => (
            <View key={group.cluster}>
              {/* Cluster header */}
              <View style={s.clusterHdr}>
                <Text style={s.clusterTitle}>{group.cluster}</Text>
              </View>

              {/* Courses */}
              {group.items.map(course => {
                const topCountries = safeParseArray(course.topCountries)
                const dc = demandColor(course.demand)
                return (
                  <TouchableOpacity
                    key={course.courseId}
                    style={s.courseCard}
                    onPress={() => router.push(`/career/${course.courseId}` as never)}
                    activeOpacity={0.8}
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
                  </TouchableOpacity>
                )
              })}
            </View>
          ))
        )}

        {/* Disclaimer */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTxt}>
            AI-Safe-Score · Verify demand, salaries & pathways with DMW/POEA and official sources.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
