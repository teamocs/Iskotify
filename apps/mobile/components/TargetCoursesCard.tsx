import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckOutlined, PlusOutlined, XmarkOutlined } from '@lineiconshq/free-icons'
import { eq } from 'drizzle-orm'
import { useDb } from '../hooks/useDb'
import { useTheme } from '../theme/ThemeContext'
import { layout, radius, spacing, weight } from '../theme/tokens'
import { userSettings, courseTaxonomyMap, careerCourses } from '../db/schema'
import { allCourseOptions, type CourseOption } from '../utils/targetExams'
import { supabase } from '../services/supabase'
import { schedulePushUserData } from '../services/pushScheduler'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { InsetGroup } from './ui/InsetGroup'
import { PressableScale } from './ui/Pressable'
import { SearchField } from './ui/SearchField'
import { Sheet } from './ui/Sheet'
import { Text } from './ui/Text'
import { decorative, focusRing, heading } from './ui/a11y'

const MAX_COURSES = 3

function parseCourses(raw: string | null | undefined): CourseOption[] {
  try {
    const v = JSON.parse(raw ?? '[]')
    if (!Array.isArray(v)) return []
    return v.filter((x): x is CourseOption => !!x && typeof x.id === 'string' && typeof x.label === 'string')
  } catch {
    return []
  }
}

/**
 * Profile card to view/add/remove the user's target courses (up to 3). Lets users
 * who onboarded on an older version (focus-list only, no course picker) add courses
 * later. Reads the course catalog from the local DB (synced on launch) and persists
 * to user_settings.target_courses + profiles.target_courses (best-effort).
 */
// 5 useState calls below are independent concerns (persisted selection, catalog
// cache, loading flag, modal visibility, search text) — not an interdependent
// state machine, and `toggle` fires an async persist inside the setState updater,
// so a reducer would add risk for no benefit.
// react-doctor-disable-next-line react-doctor/prefer-useReducer
export function TargetCoursesCard() {
  const db = useDb()
  const { theme: t } = useTheme()
  const [selected, setSelected] = useState<CourseOption[]>([])
  const [all, setAll] = useState<CourseOption[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const rows = await db.select({ targetCourses: userSettings.targetCourses })
          .from(userSettings).where(eq(userSettings.id, 1)).limit(1)
        if (active) setSelected(parseCourses(rows[0]?.targetCourses))
      } catch (e) {
        console.warn('[courses-card] load selected:', e)
      }
    })()
    return () => { active = false }
  }, [db])

  const loadCatalog = useCallback(async () => {
    if (all.length > 0) return
    setLoadingAll(true)
    try {
      const [tax, cc] = await Promise.all([
        db.select({ courseTab: courseTaxonomyMap.courseTab, careerCourseId: courseTaxonomyMap.careerCourseId, label: courseTaxonomyMap.label }).from(courseTaxonomyMap),
        db.select({ courseId: careerCourses.courseId, name: careerCourses.name }).from(careerCourses),
      ])
      let options = allCourseOptions(tax, cc)

      // The local catalog is populated by the fire-and-forget launch sync, so it can
      // still be empty here (sync not finished yet, or the user onboarded on an older
      // build before the course tables synced). Fall back to a direct Supabase fetch —
      // the same source the onboarding course step uses — so the picker is never empty
      // when online. Users who never set courses in onboarding can then add them here.
      if (options.length === 0) {
        const [taxRes, ccRes] = await Promise.all([
          supabase.from('course_taxonomy_map').select('course_tab,career_course_id,label'),
          supabase.from('career_courses').select('course_id,name'),
        ])
        const remoteTax = (taxRes.data ?? []).map(r => ({
          courseTab: r.course_tab as string,
          careerCourseId: (r.career_course_id ?? null) as string | null,
          label: (r.label ?? null) as string | null,
        }))
        const remoteCc = (ccRes.data ?? []).map(r => ({
          courseId: r.course_id as string,
          name: (r.name ?? null) as string | null,
        }))
        options = allCourseOptions(remoteTax, remoteCc)
      }

      setAll(options)
    } catch (e) {
      console.warn('[courses-card] load catalog:', e)
    } finally {
      setLoadingAll(false)
    }
  }, [db, all.length])

  const persist = useCallback(async (next: CourseOption[]) => {
    const json = JSON.stringify(next.map(c => ({ id: c.id, label: c.label, careerCourseId: c.careerCourseId })))
    try {
      await db.insert(userSettings)
        .values({ id: 1, targetCourses: json } as typeof userSettings.$inferInsert)
        .onConflictDoUpdate({ target: userSettings.id, set: { targetCourses: json } })
      schedulePushUserData(db)
    } catch (e) {
      console.warn('[courses-card] persist:', e)
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void supabase.from('profiles').update({ target_courses: next.map(c => c.label) }).eq('id', data.user.id)
      }
    })
  }, [db])

  const toggle = useCallback((c: CourseOption) => {
    setSelected(prev => {
      let next: CourseOption[]
      if (prev.some(s => s.id === c.id)) next = prev.filter(s => s.id !== c.id)
      else if (prev.length >= MAX_COURSES) next = prev
      else next = [...prev, c]
      void persist(next)
      return next
    })
  }, [persist])

  const openModal = useCallback(() => { setQuery(''); setModalOpen(true); void loadCatalog() }, [loadCatalog])

  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    const base = q ? all.filter(c => c.label.toLowerCase().includes(q)) : all
    return base.slice(0, 50)
  }, [all, q])

  const atMax = selected.length >= MAX_COURSES

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text role="headline" {...heading(3)} style={{ flex: 1 }}>Target courses</Text>
        <Button
          label={selected.length > 0 ? 'Edit' : 'Add courses'}
          accessibilityLabel={selected.length > 0 ? 'Edit target courses' : 'Add target courses'}
          variant="ghost"
          size="sm"
          shape="pill"
          onPress={openModal}
          icon={selected.length > 0 ? undefined : <Lineicons icon={PlusOutlined} size={16} color={t.accentText} />}
        />
      </View>

      {selected.length === 0 ? (
        <Text role="subheadline" color={t.textSecondary}>No target courses yet. Add up to 3 to personalise your recommendations.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {selected.map(c => (
            <View
              key={c.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: layout.rowMinHeight,
                paddingLeft: spacing.md, borderRadius: radius.capsule,
                backgroundColor: t.accentSurface, borderWidth: 1, borderColor: t.accentBorder,
              }}
            >
              <Text role="subheadline" color={t.accentText} style={weight('600')}>{c.label}</Text>
              <PressableScale
                onPress={() => toggle(c)}
                accessibilityLabel={`Remove ${c.label}`}
                accessibilityRole="button"
                style={({ pressed, focused }) => [
                  {
                    width: layout.headerButton.hit, height: layout.headerButton.hit, borderRadius: radius.capsule,
                    alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent',
                  },
                  focusRing(t.focusRing, focused),
                ]}
              >
                <View {...decorative}>
                  <Lineicons icon={XmarkOutlined} size={14} color={t.accentText} />
                </View>
              </PressableScale>
            </View>
          ))}
        </View>
      )}

      <Sheet visible={modalOpen} title="Target courses" onClose={() => setModalOpen(false)}>
        <View style={{ gap: spacing.md }}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. Nursing, Civil Engineering"
            accessibilityLabel="Search courses"
          />
          <Text role="footnote" color={t.textSecondary} accessibilityLiveRegion="polite">
            {`${selected.length}/${MAX_COURSES} selected${atMax ? ' — remove one to swap' : ''}`}
          </Text>
          {loadingAll ? (
            <View style={{ paddingTop: spacing.xxxl, alignItems: 'center' }}>
              <ActivityIndicator color={t.accentText} accessibilityLabel="Loading courses" />
            </View>
          ) : results.length === 0 ? (
            <Text role="subheadline" color={t.textSecondary} style={{ textAlign: 'center', paddingTop: spacing.xxl }}>
              {all.length === 0 ? 'Course list not synced yet. Pull to refresh on Profile, then try again.' : 'No courses found.'}
            </Text>
          ) : (
            <View accessibilityLabel="Courses">
              <InsetGroup inset={false}>
                {results.map(c => {
                  const sel = selected.some(x => x.id === c.id)
                  return (
                    <CourseRow key={c.id} label={c.label} selected={sel} disabled={!sel && atMax} onPress={() => toggle(c)} />
                  )
                })}
              </InsetGroup>
            </View>
          )}
        </View>
      </Sheet>
    </Card>
  )
}

/**
 * One course in the picker: a checkbox (aria-checked, a drawn check, never
 * colour alone) laid out like an inset-group row. A row stays visible at the
 * 3-course cap but cannot be picked.
 */
function CourseRow({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const { theme: t } = useTheme()
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      aria-checked={selected}
      aria-disabled={disabled}
      style={({ pressed, hovered, focused }) => [
        {
          minHeight: layout.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
          paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
          backgroundColor: selected ? t.accentSurface : pressed ? t.surface2 : hovered && !disabled ? t.surfaceSubtle : 'transparent',
          opacity: disabled ? 0.5 : 1,
          borderBottomWidth: 1, borderBottomColor: t.divider,
        },
        focusRing(t.focusRing, focused),
      ]}
    >
      <Text role="body" style={[{ flex: 1 }, selected ? weight('600') : null]}>{label}</Text>
      <View
        {...decorative}
        style={{
          width: 24, height: 24, borderRadius: radius.chip, borderCurve: 'continuous', borderWidth: 2,
          borderColor: selected ? t.accent : t.inputBorder, backgroundColor: selected ? t.accent : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {selected ? <Lineicons icon={CheckOutlined} size={14} color={t.textInverse} /> : null}
      </View>
    </PressableScale>
  )
}
