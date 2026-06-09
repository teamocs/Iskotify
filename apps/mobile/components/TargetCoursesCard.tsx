import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, Pressable, Modal, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native'
import { eq } from 'drizzle-orm'
import { useDb } from '../hooks/useDb'
import { useTheme } from '../theme/ThemeContext'
import { userSettings, courseTaxonomyMap, careerCourses } from '../db/schema'
import { allCourseOptions, type CourseOption } from '../utils/targetExams'
import { supabase } from '../services/supabase'

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
// eslint-disable-next-line react-doctor/prefer-useReducer
export function TargetCoursesCard() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
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

  const s = useMemo(() => StyleSheet.create({
    card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    secTitle: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    addLink: { fontFamily: 'Lexend_500Medium', fontSize: 12, color: t.accentText },
    empty: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginTop: 4 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)', borderRadius: 980, paddingHorizontal: 12, paddingVertical: 6 },
    chipText: { fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: t.accentText },
    chipX: { fontFamily: 'Outfit_700Bold', fontSize: typo.sm, color: t.accentText },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '78%', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24 },
    handle: { width: 36, height: 4, backgroundColor: t.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    sheetTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.lg, color: t.textPrimary, flex: 1 },
    closeTxt: { fontFamily: 'Lexend_400Regular', fontSize: 18, color: t.textSecondary, padding: 4 },
    input: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textPrimary, marginBottom: 10 },
    countHint: { fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1 },
    rowLabel: { flex: 1, fontFamily: 'Outfit_600SemiBold', fontSize: typo.base, color: t.textPrimary },
    rowMark: { fontSize: 18 },
    emptyResults: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, textAlign: 'center', paddingTop: 30 },
  }), [t, typo])

  const atMax = selected.length >= MAX_COURSES

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.secTitle}>Target Courses</Text>
        <Pressable onPress={openModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={s.addLink}>{selected.length > 0 ? 'Edit' : '+ Add courses'}</Text>
        </Pressable>
      </View>

      {selected.length === 0 ? (
        <Text style={s.empty}>No target courses yet. Add up to 3 to personalise your recommendations.</Text>
      ) : (
        <View style={s.chipWrap}>
          {selected.map(c => (
            <View key={c.id} style={s.chip}>
              <Text style={s.chipText}>{c.label}</Text>
              <Pressable onPress={() => toggle(c)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }} accessibilityLabel={`Remove ${c.label}`} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.5 }}>
                <Text style={s.chipX}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setModalOpen(false)} accessibilityLabel="Close" />
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Target Courses</Text>
              <Pressable onPress={() => setModalOpen(false)} accessibilityLabel="Close" accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.5 }}>
                <Text style={s.closeTxt}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              style={s.input}
              placeholder="Search courses (e.g. Nursing, Civil Engineering)…"
              placeholderTextColor={t.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <Text style={s.countHint}>{selected.length}/{MAX_COURSES} selected{atMax ? ' — remove one to swap' : ''}</Text>
            {loadingAll ? (
              <View style={{ paddingTop: 30, alignItems: 'center' }}><ActivityIndicator color={t.accentText} /></View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {results.length === 0 ? (
                  <Text style={s.emptyResults}>{all.length === 0 ? 'Course list not synced yet. Pull to refresh on Profile, then try again.' : 'No courses found.'}</Text>
                ) : (
                  results.map(c => {
                    const sel = selected.some(x => x.id === c.id)
                    const disabled = !sel && atMax
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => toggle(c)}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityState={{ disabled, selected: sel }}
                        style={({ pressed }) => [s.row, {
                          backgroundColor: sel ? 'rgba(128,0,0,0.20)' : t.surface,
                          borderColor: sel ? '#831626' : t.border,
                          opacity: disabled ? 0.4 : 1,
                        }, pressed && !disabled && { opacity: 0.7 }]}
                      >
                        <Text style={s.rowLabel}>{c.label}</Text>
                        <Text style={[s.rowMark, { color: sel ? t.accentText : t.textTertiary }]}>{sel ? '✓' : '＋'}</Text>
                      </Pressable>
                    )
                  })
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}
