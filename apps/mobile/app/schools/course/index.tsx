import { useState, useEffect, useMemo } from 'react'
import {
  StyleSheet, View, Text, Pressable, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../hooks/useDb'
import {
  userSettings,
  courseTaxonomyMap as taxonomyTable,
} from '../../../db/schema'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing } from '../../../theme/tokens'
import { ScreenScroll } from '../../../components/ui/ScreenScroll'
import { SectionHeader } from '../../../components/ui/SectionHeader'
import { ListCard } from '../../../components/ui/ListCard'
import { resolveCourseTabs, type CourseTabOption } from '../../../utils/courseTabs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseOption {
  id: string
  label: string
  careerCourseId: string | null
}

interface TaxonomyRow {
  courseTab: string
  careerCourseId: string | null
  label: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCourses(raw: string | null | undefined): CourseOption[] {
  try {
    const v = JSON.parse(raw ?? '[]')
    if (!Array.isArray(v)) return []
    return v.filter(
      (x): x is CourseOption =>
        !!x && typeof x.id === 'string' && typeof x.label === 'string',
    )
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CoursePickerScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()

  const [targetTabs, setTargetTabs]   = useState<CourseTabOption[]>([])
  const [allTaxonomy, setAllTaxonomy] = useState<TaxonomyRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [dbEmpty, setDbEmpty]         = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [settingsRows, taxRows] = await Promise.all([
          db.select({ targetCourses: userSettings.targetCourses })
            .from(userSettings)
            .where(eq(userSettings.id, 1))
            .limit(1),

          db.select({
            courseTab: taxonomyTable.courseTab,
            careerCourseId: taxonomyTable.careerCourseId,
            label: taxonomyTable.label,
          }).from(taxonomyTable),
        ])

        if (!active) return

        const raw = settingsRows[0]?.targetCourses ?? null
        const parsed = parseCourses(raw)

        if (taxRows.length === 0) {
          setDbEmpty(true)
        } else {
          const resolved = resolveCourseTabs(parsed, taxRows as TaxonomyRow[])
          setTargetTabs(resolved)
          setAllTaxonomy(taxRows as TaxonomyRow[])
        }
      } catch (e) {
        console.warn('[course-picker] load:', e)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [db])

  // Dedupe + sort all taxonomy rows for the "All courses" section
  const allCourseOptions = useMemo<CourseTabOption[]>(() => {
    const seen = new Set<string>()
    const rows: CourseTabOption[] = []
    for (const row of allTaxonomy) {
      if (!seen.has(row.courseTab)) {
        seen.add(row.courseTab)
        rows.push({ courseTab: row.courseTab, label: row.label ?? row.courseTab })
      }
    }
    return rows.slice().sort((a, b) => a.label.localeCompare(b.label))
  }, [allTaxonomy])

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
