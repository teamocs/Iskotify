import { useEffect, useState, useMemo, useRef } from 'react'
import {
  View, Text, TextInput, SectionList, StyleSheet,
  Pressable, ActivityIndicator, ScrollView,
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '../services/supabase'
import { syncOnLaunch, pushUserData } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { runEnhancement } from '../hooks/useAiEnhancement'
import {
  userSettings, practiceSessions, focusListings as focusListingsTable, upcatQuestions,
} from '../db/schema'
import { eq } from 'drizzle-orm'
import { SchoolPicker } from '../components/SchoolPicker'
import { PRE_ASSESS_QUESTIONS } from '../data/preAssessment'
import type { PreAssessQuestion } from '../data/preAssessment'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, type Theme } from '../theme/tokens'
import { Card } from '../components/ui/Card'
import { AppButton } from '../components/ui/AppButton'
import type { IncomeBracket } from '../utils/scholarshipMatch'
import {
  buildExamCatalog, orderExams, searchExams, examAcronymToListingSlug,
  recommendCourses, allCourseOptions,
  type ExamOption, type CourseOption, type TaxonomyRow, type CareerCourseRow,
} from '../utils/targetExams'
import { buildPreAssessFromUpcat } from '../utils/preAssessmentSource'
import { canonicalizeRegion } from '../utils/region'

function parseJsonArray(s: string | null | undefined): string[] {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

// Supabase text[] columns arrive as JS arrays; local/JSON ones as strings. Handle both.
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string') return parseJsonArray(v)
  return []
}

const PRE_ASSESS_SUBTESTS = ['Mathematics', 'Science', 'Language Proficiency'] as const

const PH_PROVINCES = [
  'Abra','Agusan del Norte','Agusan del Sur','Aklan','Albay','Antique','Apayao',
  'Aurora','Basilan','Bataan','Batanes','Batangas','Benguet','Biliran','Bohol',
  'Bukidnon','Bulacan','Cagayan','Camarines Norte','Camarines Sur','Camiguin',
  'Capiz','Catanduanes','Cavite','Cebu','Compostela Valley','Cotabato',
  'Davao del Norte','Davao del Sur','Davao Occidental','Davao Oriental',
  'Dinagat Islands','Eastern Samar','Guimaras','Ifugao','Ilocos Norte',
  'Ilocos Sur','Iloilo','Isabela','Kalinga','La Union','Laguna','Lanao del Norte',
  'Lanao del Sur','Leyte','Maguindanao','Marinduque','Masbate','Metro Manila',
  'Misamis Occidental','Misamis Oriental','Mountain Province','Negros Occidental',
  'Negros Oriental','Northern Samar','Nueva Ecija','Nueva Vizcaya','Occidental Mindoro',
  'Oriental Mindoro','Palawan','Pampanga','Pangasinan','Quezon','Quirino',
  'Rizal','Romblon','Samar','Sarangani','Siquijor','Sorsogon','South Cotabato',
  'Southern Leyte','Sultan Kudarat','Sulu','Surigao del Norte','Surigao del Sur',
  'Tarlac','Tawi-Tawi','Zambales','Zamboanga del Norte','Zamboanga del Sur',
  'Zamboanga Sibugay',
] as const

const INCOME_OPTIONS: { label: string; value: IncomeBracket | null }[] = [
  { label: '₱100k or below / yr', value: '<=100k' },
  { label: '₱100k–₱300k', value: '100k-300k' },
  { label: '₱300k–₱600k', value: '300k-600k' },
  { label: '₱600k–₱1.2M', value: '600k-1.2M' },
  { label: 'Above ₱1.2M', value: '>1.2M' },
  { label: 'Prefer not to say', value: null },
]

interface ListingRow { id: string; slug: string; title: string; type: string; exam_date: string | null }

const GRADES = [9, 10, 11, 12] as const

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

// Step progress indicator (token-driven). `active` = which of the 4 steps is current.
function StepDots({ active, t }: { active: 0 | 1 | 2 | 3; t: Theme }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {[0, 1, 2, 3].map(i => (
        <View
          key={i}
          style={{
            width: i === active ? 24 : 8,
            height: 4,
            borderRadius: radius.pill,
            backgroundColor: i === active ? t.accent : t.surface2,
          }}
        />
      ))}
    </View>
  )
}

export default function OnboardingScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()

  // Step 1
  const [step, setStep] = useState<1 | 2 | 'matcher' | 'courses' | 3>(1)
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [schoolRegion, setSchoolRegion] = useState('')
  const [gradeLevel, setGradeLevel] = useState<number | null>(null)

  // Target University Exams step
  const [examCatalog, setExamCatalog] = useState<ExamOption[]>([])
  const [examQuery, setExamQuery] = useState('')
  const [loadingExams, setLoadingExams] = useState(false)
  const [selectedExams, setSelectedExams] = useState<ExamOption[]>([])

  // Target Courses step
  const [allCourses, setAllCourses] = useState<CourseOption[]>([])
  const [courseQuery, setCourseQuery] = useState('')
  const [selectedCourses, setSelectedCourses] = useState<CourseOption[]>([])

  // Pre-assessment questions (dynamic: from the exam-tagged bank when available)
  const [preAssessQuestions, setPreAssessQuestions] = useState<PreAssessQuestion[]>(PRE_ASSESS_QUESTIONS)

  // Raw course taxonomy / career rows (used only to compute recommendations).
  const taxonomyRef = useRef<TaxonomyRow[]>([])
  const careerRef = useRef<CareerCourseRow[]>([])

  // Courses recommended from the selected exams' universities. Computed here (never
  // in the Continue handler) so it can never throw and stall navigation.
  const recommendedCourses = useMemo(() => {
    try { return recommendCourses(selectedExams, taxonomyRef.current, careerRef.current) }
    catch { return [] }
  }, [selectedExams, allCourses])

  // Matcher step state
  const [incomeBracket, setIncomeBracket] = useState<IncomeBracket | null>(null)
  // "Prefer not to say" is an explicit, selectable choice — distinct from "not yet
  // answered". Both leave incomeBracket null (no income filter), but this flag lets
  // the chip show as selected so the option is actually pickable.
  const [incomePreferNotToSay, setIncomePreferNotToSay] = useState(false)
  const [gwaText, setGwaText] = useState('')
  const [gwaError, setGwaError] = useState<string | null>(null)
  const [province, setProvince] = useState('')
  const [provinceQuery, setProvinceQuery] = useState('')

  // Step 2 state
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loadingListings, setLoadingListings] = useState(false)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState('')  // kept for assessment

  // Step 3 — pre-assessment (static 20 questions)
  const [assessIdx, setAssessIdx] = useState(0)
  const [assessAnswers, setAssessAnswers] = useState<Array<{ q: PreAssessQuestion; correct: boolean }>>([])
  const [assessDone, setAssessDone] = useState(false)

  // Pre-fill profile from Google sign-in data (seeded into DB by auth/callback.tsx)
  useEffect(() => {
    async function prefill() {
      try {
        const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
        const s = rows[0]
        if (!s) return
        if (s.fullName) setFullName(s.fullName)
        if (s.school) setSchool(s.school)
        if (s.schoolRegion) setSchoolRegion(s.schoolRegion)
        if (s.gradeLevel) setGradeLevel(s.gradeLevel)
      } catch (e) {
        console.warn('[onboarding] prefill error:', e)
      }
    }
    void prefill()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assessStyle = useMemo(() => StyleSheet.create({
    questionCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.xl, marginBottom: spacing.xs },
    questionLabel: { fontSize: typo.xs, letterSpacing: 1, textTransform: 'uppercase', color: t.textTertiary, marginBottom: spacing.sm, fontFamily: 'Lexend_600SemiBold' },
    questionText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 23, fontFamily: 'Outfit_600SemiBold' },
    optionBtn: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 13, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
    optionLetter: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: 'rgba(128,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.40)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    optionLetterTxt: { fontSize: typo.sm, fontWeight: '700', color: t.accentText, fontFamily: 'Outfit_700Bold' },
    optionText: { fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', flex: 1, lineHeight: 19 },
    resultPct: { fontSize: typo.display, fontWeight: '700', color: t.accentText, letterSpacing: -2, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
    resultTitle: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm, textAlign: 'center' },
    resultSub: { fontSize: typo.md, color: t.textSecondary, fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 20, marginBottom: spacing.xxl },
    resultCounts: { flexDirection: 'row', gap: 40, marginBottom: spacing.xxxl },
    resultCount: { alignItems: 'center' },
    resultNum: { fontSize: typo.h2, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
    resultLbl: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
    primaryBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%', minHeight: 44, justifyContent: 'center' },
    primaryBtnTxt: { fontSize: typo.base, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  }), [t, typo])

  const labelStyle = { fontFamily: 'Lexend_500Medium' as const, fontSize: typo.sm, color: t.textSecondary, marginBottom: spacing.sm }
  const inputStyle = { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous' as const, paddingHorizontal: spacing.lg as number, paddingVertical: 13 as number, fontFamily: 'Lexend_400Regular' as const, fontSize: typo.base, color: t.textPrimary }

  useEffect(() => {
    if (step !== 2) return
    setLoadingListings(true)
    supabase
      .from('listings')
      .select('id,slug,title,type,exam_date')
      .eq('type', 'scholarship')
      .in('status', ['active', 'upcoming'])
      .order('title')
      .then(({ data, error }) => {
        if (error) console.error('[onboarding] fetch scholarships:', error)
        setListings(data ?? [])
        setLoadingListings(false)
      })
  }, [step])

  // Build the searchable, region-ordered exam catalog + course data when entering
  // step 2. Fetched from Supabase because the catalog tables (university_profiles /
  // tertiary_schools) aren't synced into the local DB until after the first sync,
  // which only runs once focus listings are chosen (i.e. after this step).
  useEffect(() => {
    // Load on step 2 and, as a fallback, on the courses step too — so the course
    // list/recommendations still populate even if the step-2 fetch was missed.
    if ((step !== 2 && step !== 'courses') || examCatalog.length > 0) return
    setLoadingExams(true)
    void (async () => {
      try {
        const [profRes, schoolRes, taxRes, ccRes] = await Promise.all([
          supabase.from('university_profiles').select('school_id,data_tier,entrance_exam_acronym,entrance_exam_name,exam_month,known_for_courses,prc_top_courses'),
          supabase.from('tertiary_schools').select('id,name,acronym,region,province,rank_in_province'),
          supabase.from('course_taxonomy_map').select('course_tab,career_course_id,label'),
          supabase.from('career_courses').select('course_id,name'),
        ])
        const profiles = (profRes.data ?? []).map((p: Record<string, unknown>) => ({
          schoolId: p.school_id as string,
          dataTier: (p.data_tier as string) ?? '',
          entranceExamAcronym: (p.entrance_exam_acronym as string) ?? '',
          entranceExamName: (p.entrance_exam_name as string) ?? null,
          examMonth: (p.exam_month as string) ?? null,
          knownForCourses: asArray(p.known_for_courses),
          prcTopCourses: asArray(p.prc_top_courses),
        }))
        const schools = (schoolRes.data ?? []).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          name: (s.name as string) ?? '',
          acronym: (s.acronym as string) ?? null,
          region: (s.region as string) ?? null,
          province: (s.province as string) ?? null,
          rankInProvince: (s.rank_in_province as number) ?? null,
        }))
        const tax = (taxRes.data ?? []).map((r: Record<string, unknown>) => ({
          courseTab: (r.course_tab as string) ?? '',
          careerCourseId: (r.career_course_id as string) ?? '',
          label: (r.label as string) ?? '',
        }))
        const cc = (ccRes.data ?? []).map((r: Record<string, unknown>) => ({
          courseId: (r.course_id as string) ?? '',
          name: (r.name as string) ?? '',
        }))
        taxonomyRef.current = tax
        careerRef.current = cc
        setExamCatalog(buildExamCatalog(profiles, schools))
        setAllCourses(allCourseOptions(tax, cc))
      } catch (e) {
        console.warn('[onboarding] exam catalog load error:', e)
      } finally {
        setLoadingExams(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function handleNextStep() {
    if (!fullName.trim() || !gradeLevel) return
    // Advance immediately — the UI transition must never block on a DB write.
    setStep(2)
    // Persist the profile NOW — separately from step 2's focus transaction — so a new
    // user's name/grade survive even if a later step or the focus insert fails. fullName
    // is what gates landing-vs-app on launch, so this prevents the "relaunch loops back
    // to the startup screen" data-loss bug. Best-effort, fire-and-forget: the expo-sqlite
    // driver executes synchronously, so the row is written before this returns.
    const patch = {
      fullName: fullName.trim(),
      school: school.trim(),
      schoolRegion: canonicalizeRegion(schoolRegion),
      gradeLevel,
    }
    void db.insert(userSettings)
      .values({ id: 1, ...patch } as typeof userSettings.$inferInsert)
      .onConflictDoUpdate({ target: userSettings.id, set: patch })
      .catch((e: unknown) => console.warn('[onboarding] step 1 persist error:', e))
  }

  async function handleConfirmStep2() {
    // Need at least one target exam or scholarship to proceed.
    if (selectedExams.length === 0 && selectedSlugs.length === 0) return
    setSaving(true)
    // Pure computations up front (can't throw) so the persist+navigation below is simple.
    const now = Date.now()
    const examSlugs = Array.from(new Set(
      selectedExams.map(e => examAcronymToListingSlug(e.examAcronym)).filter((s): s is string => !!s),
    ))
    // Focus = chosen scholarships first, then any selected exam that maps to a
    // content slug (only UPCAT has authored cards today). De-duplicated.
    const focusSlugs = Array.from(new Set([...selectedSlugs, ...examSlugs]))
    const primarySlug = focusSlugs[0] ?? ''
    const targetExamsJson = JSON.stringify(
      selectedExams.map(e => ({ schoolId: e.schoolId, schoolName: e.schoolName, examAcronym: e.examAcronym })),
    )
    const profileFields = {
      fullName: fullName.trim(),
      school: school.trim(),
      schoolRegion: canonicalizeRegion(schoolRegion),
      gradeLevel: gradeLevel ?? undefined,
      targetExams: targetExamsJson,
    }
    // Persist profile + selection FIRST, in its own statement, so a bad focus-row
    // insert can't roll it back. selectedListingSlug + targetExams here are what gate
    // returning-user detection (hasOnboardingFocus), so they MUST survive independently.
    try {
      await db.insert(userSettings).values({
        id: 1, selectedListingSlug: primarySlug, lastSyncedAt: 0, ...profileFields,
      }).onConflictDoUpdate({
        target: userSettings.id,
        set: { selectedListingSlug: primarySlug, lastSyncedAt: 0, ...profileFields },
      })
      setSelectedSlug(primarySlug)
    } catch (e) {
      console.error('[onboarding] step 2 settings persist error:', e)
    }
    // Focus listings — best-effort, each independent so one bad row can't drop the rest
    // or the settings write above.
    for (let i = 0; i < focusSlugs.length; i++) {
      try {
        await db.insert(focusListingsTable)
          .values({ listingSlug: focusSlugs[i]!, priority: i + 1, addedAt: now })
          .onConflictDoNothing()
      } catch (e) {
        console.warn('[onboarding] focus row persist error:', e)
      }
    }
    // Best-effort cloud mirror of target exams when signed in.
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void supabase.from('profiles')
          .update({ target_exams: selectedExams.map(e => e.examAcronym) })
          .eq('id', data.user.id)
      }
    })
    // ALWAYS advance to the courses step; sync content in the background.
    setSaving(false)
    setStep('courses')
    void syncOnLaunch(db)
      .then(() => runEnhancement(db))
      .catch(e => console.warn('[onboarding] background sync error:', e))
  }

  async function handleMatcherContinue(skip = false) {
    if (!skip) {
      // Validate GWA if provided
      const gwaNum = gwaText.trim() ? parseFloat(gwaText.trim()) : null
      if (gwaText.trim() && (isNaN(gwaNum!) || gwaNum! < 75 || gwaNum! > 100)) {
        setGwaError('GWA must be between 75 and 100.')
        return
      }
      setGwaError(null)
      // Persist via inline Drizzle (matching the mechanism used for other fields in this screen)
      try {
        const patch: Record<string, unknown> = {}
        if (incomeBracket !== null) patch.incomeBracket = incomeBracket
        if (gwaNum !== null) patch.gwa = gwaNum
        if (province.trim()) patch.province = province.trim()
        if (Object.keys(patch).length > 0) {
          await db
            .insert(userSettings)
            .values({ id: 1, ...patch } as typeof userSettings.$inferInsert)
            .onConflictDoUpdate({ target: userSettings.id, set: patch })
        }
      } catch (e) {
        console.warn('[onboarding] matcher persist error:', e)
      }
    }
    setStep(3)
  }

  async function loadPreAssessment() {
    try {
      const rows = await db.select({
        questionId: upcatQuestions.questionId,
        subtest: upcatQuestions.subtest,
        questionText: upcatQuestions.questionText,
        options: upcatQuestions.options,
        correctIndex: upcatQuestions.correctIndex,
        explanation: upcatQuestions.explanation,
        setId: upcatQuestions.setId,
      }).from(upcatQuestions)
      const built = buildPreAssessFromUpcat(rows, [...PRE_ASSESS_SUBTESTS], 3)
      if (built.length >= 3) setPreAssessQuestions(built)
    } catch (e) {
      console.warn('[onboarding] pre-assessment build error:', e)
    }
  }

  async function handleCoursesContinue(skip = false) {
    if (!skip && selectedCourses.length > 0) {
      try {
        const json = JSON.stringify(
          selectedCourses.map(c => ({ id: c.id, label: c.label, careerCourseId: c.careerCourseId })),
        )
        await db.insert(userSettings)
          .values({ id: 1, targetCourses: json } as typeof userSettings.$inferInsert)
          .onConflictDoUpdate({ target: userSettings.id, set: { targetCourses: json } })
        void supabase.auth.getUser().then(({ data }) => {
          if (data.user) {
            void supabase.from('profiles')
              .update({ target_courses: selectedCourses.map(c => c.label) })
              .eq('id', data.user.id)
          }
        })
      } catch (e) {
        console.warn('[onboarding] courses persist error:', e)
      }
    }
    await loadPreAssessment()
    setStep('matcher')
  }

  function handleAssessAnswer(optionIdx: number) {
    const q = preAssessQuestions[assessIdx]
    if (!q) return
    const correct = optionIdx === q.answerIndex
    const newAnswers = [...assessAnswers, { q, correct }]

    if (assessIdx === preAssessQuestions.length - 1) {
      const now = Date.now()

      // Group by subject and count correct vs total per subject
      const grouped = new Map<string, { correct: number; total: number }>()
      for (const r of newAnswers) {
        const stats = grouped.get(r.q.subject) ?? { correct: 0, total: 0 }
        stats.total++
        if (r.correct) stats.correct++
        grouped.set(r.q.subject, stats)
      }

      // Synchronous transaction (Drizzle's expo-sqlite driver is sync — an async
      // callback would commit BEFORE the awaited inserts ran, silently dropping the
      // pre-assessment progress). Use .run() inside, matching the rest of the app.
      try {
        db.transaction(tx => {
          for (const [subject, stats] of grouped) {
            if (!stats || stats.total === 0) continue
            tx.insert(practiceSessions).values({
              listingSlug: '',
              topicId: `pre-assess-${subject}`,
              deckId: '',
              score: stats.correct,
              total: stats.total,
              durationSecs: 0,
              completedAt: now,
            }).run()
          }
        })
        // Backup the new pre-assessment data to Supabase if signed in (fire-and-forget)
        void pushUserData(db).catch(err => console.warn('[onboarding] push failed:', err))
      } catch (e) {
        console.warn('[onboarding] save assess error:', e)
      }

      setAssessAnswers(newAnswers)
      setAssessDone(true)
    } else {
      setAssessAnswers(newAnswers)
      setAssessIdx(i => i + 1)
    }
  }

  function finishOnboarding() {
    router.replace('/(tabs)')
  }

  // ── Step 1: Profile ───────────────────────────────────────────────────────

  if (step === 1) {
    const isValid = fullName.trim().length > 0 && gradeLevel !== null
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xxxl, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          bottomOffset={20}
        >

            <View style={{ marginBottom: spacing.xxl }}>
              <StepDots active={0} t={t} />
            </View>

            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, marginBottom: spacing.sm }}>
              Tell us about yourself
            </Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary, marginBottom: spacing.xxl, lineHeight: 19 }}>
              This helps us personalise your experience.
            </Text>

            <Card elevated padded>
              <Text style={labelStyle}>Full Name *</Text>
              <TextInput
                style={inputStyle}
                placeholder="e.g. Juan dela Cruz"
                placeholderTextColor={t.textTertiary}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                returnKeyType="next"
              />

              <Text style={[labelStyle, { marginTop: spacing.lg }]}>School / University</Text>
              <SchoolPicker value={school} onChange={setSchool} onSelectMeta={m => setSchoolRegion(m.region ?? '')} />

              <Text style={[labelStyle, { marginTop: spacing.lg }]}>Grade Level *</Text>
              <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginBottom: spacing.sm }}>
                Philippines K-12 curriculum — select your current grade
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {GRADES.map(g => {
                  const active = gradeLevel === g
                  return (
                    <Pressable
                      key={g}
                      onPress={() => setGradeLevel(g)}
                      style={({ pressed }) => [{
                        flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', minHeight: 44, justifyContent: 'center',
                        backgroundColor: active ? t.accent : t.surface2,
                        borderWidth: 1, borderColor: active ? t.accent : t.border,
                      }, pressed ? { opacity: 0.85 } : null]}
                    >
                      <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: active ? '#fff' : t.textSecondary }}>
                        G{g}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </Card>

            <View style={{ marginTop: spacing.xxxl }}>
              <AppButton label="Next →" onPress={handleNextStep} disabled={!isValid} />
            </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    )
  }

  // ── Step 2: Listing picker ────────────────────────────────────────────────

  if (step === 2) {
    const ordered = orderExams(examCatalog, schoolRegion)
    const q = examQuery.trim()
    const examItems = searchExams(ordered, q).slice(0, q ? 60 : 80)
    const scholarshipItems = q
      ? listings.filter(l => l.title.toLowerCase().includes(q.toLowerCase()))
      : listings
    type Step2Item = ExamOption | ListingRow
    const sections: { key: string; title: string; data: Step2Item[] }[] = [
      { key: 'exams', title: 'University Entrance Exams', data: examItems },
      { key: 'sch', title: 'Scholarships', data: scholarshipItems },
    ].filter(s => s.data.length > 0)
    const selectedCount = selectedExams.length + selectedSlugs.length
    const loadingStep2 = loadingExams || loadingListings

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl }}>
          <StepDots active={1} t={t} />
        </View>

        <View style={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: spacing.sm }}>
          <Pressable onPress={() => setStep(1)} hitSlop={8} style={({ pressed }) => [{ marginBottom: spacing.md }, pressed ? { opacity: 0.6 } : null]}>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>← Back</Text>
          </Pressable>
          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, marginBottom: spacing.xs }}>
            What are you{'\n'}preparing for?
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary }}>
            Search and pick your target entrance exams{schoolRegion ? ` — top national schools first, then ${canonicalizeRegion(schoolRegion)}` : ''}, plus any scholarships.
          </Text>
          <TextInput
            style={[inputStyle, { marginTop: spacing.md }]}
            placeholder="Search exam, university, or scholarship…"
            placeholderTextColor={t.textTertiary}
            value={examQuery}
            onChangeText={setExamQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        {loadingStep2 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.textPrimary} size="large" />
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, i) => ('schoolId' in item ? item.schoolId : item.id) + ':' + i}
            contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xs, paddingBottom: 170 }}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, textAlign: 'center', paddingTop: 40 }}>
                No matches found.
              </Text>
            }
            renderSectionHeader={({ section }) => (
              <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm }}>
                {section.title}
              </Text>
            )}
            renderItem={({ item, section }) => {
              if (section.key === 'exams') {
                const ex = item as ExamOption
                const sel = selectedExams.some(s => s.schoolId === ex.schoolId)
                return (
                  <Pressable
                    onPress={() => setSelectedExams(prev => sel ? prev.filter(s => s.schoolId !== ex.schoolId) : [...prev, ex])}
                    style={({ pressed }) => [{ backgroundColor: sel ? 'rgba(128,0,0,0.20)' : t.surface, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.lg, marginBottom: spacing.sm, borderWidth: sel ? 2 : 1, borderColor: sel ? t.accent : t.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }, pressed ? { opacity: 0.85 } : null]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.base, color: t.textPrimary }} numberOfLines={2}>{ex.schoolName}</Text>
                      <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginTop: 2 }}>
                        {ex.examAcronym}{ex.region ? ` · ${ex.region}` : ''}{ex.national ? ' · Top PH' : ''}
                      </Text>
                    </View>
                    <Text style={{ color: sel ? t.accentText : t.textTertiary, fontSize: 18 }}>{sel ? '✓' : '＋'}</Text>
                  </Pressable>
                )
              }
              const lst = item as ListingRow
              const sel = selectedSlugs.indexOf(lst.slug) !== -1
              return (
                <Pressable
                  onPress={() => setSelectedSlugs(prev => sel ? prev.filter(s => s !== lst.slug) : [...prev, lst.slug])}
                  style={({ pressed }) => [{ backgroundColor: sel ? 'rgba(128,0,0,0.20)' : t.surface, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.lg, marginBottom: spacing.sm, borderWidth: sel ? 2 : 1, borderColor: sel ? t.accent : t.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }, pressed ? { opacity: 0.85 } : null]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.base, color: t.textPrimary }}>{lst.title}</Text>
                    {lst.exam_date ? (
                      <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginTop: 2 }}>
                        {new Date(lst.exam_date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ color: sel ? t.accentText : t.textTertiary, fontSize: 18 }}>{sel ? '✓' : '＋'}</Text>
                </Pressable>
              )
            }}
          />
        )}

        {/* Sticky bottom CTA */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.xxl, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.border }}>
          <AppButton
            label={saving ? 'Setting up…' : `Continue${selectedCount > 0 ? ` (${selectedCount})` : ''} →`}
            disabled={selectedCount === 0 || saving}
            onPress={() => void handleConfirmStep2()}
          />
        </View>

        {saving && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.textPrimary} size="large" />
            <Text style={{ color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginTop: spacing.md, fontSize: typo.sm }}>Setting up your content…</Text>
          </View>
        )}
      </SafeAreaView>
    )
  }

  // ── Matcher step: Income / GWA / Province (optional) ─────────────────────

  if (step === 'matcher') {
    const filteredProvinces = provinceQuery.trim().length > 0
      ? PH_PROVINCES.filter(p => p.toLowerCase().includes(provinceQuery.toLowerCase()))
      : PH_PROVINCES

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xxxl, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          bottomOffset={20}
        >
          {/* Step dots */}
          <View style={{ marginBottom: spacing.xxl }}>
            <StepDots active={2} t={t} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, flex: 1 }}>
              Help us match scholarships
            </Text>
            <Pressable onPress={() => void handleMatcherContinue(true)} hitSlop={{ top: 8, bottom: 8, left: 16, right: 0 }} style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}>
              <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>Skip</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary, marginBottom: spacing.xxl, lineHeight: 19 }}>
            These details let us personalise scholarship eligibility. All fields are optional.
          </Text>

          {/* Income bracket */}
          <Card elevated padded style={{ marginBottom: spacing.lg }}>
            <Text style={labelStyle}>Household Income Bracket</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {INCOME_OPTIONS.map(opt => {
                const isPreferNotToSay = opt.value === null
                const active = isPreferNotToSay
                  ? incomePreferNotToSay
                  : (!incomePreferNotToSay && incomeBracket === opt.value)
                return (
                  <Pressable
                    key={opt.label}
                    onPress={() => {
                      if (isPreferNotToSay) {
                        setIncomePreferNotToSay(true)
                        setIncomeBracket(null)
                      } else {
                        setIncomePreferNotToSay(false)
                        setIncomeBracket(prev => prev === opt.value ? null : opt.value)
                      }
                    }}
                    style={({ pressed }) => [{
                      paddingVertical: 9,
                      paddingHorizontal: spacing.lg,
                      borderRadius: radius.pill,
                      backgroundColor: active ? t.accent : t.surface2,
                      borderWidth: 1,
                      borderColor: active ? t.accent : t.border,
                    }, pressed ? { opacity: 0.85 } : null]}
                  >
                    <Text style={{
                      fontFamily: 'Lexend_500Medium',
                      fontSize: typo.sm,
                      color: active ? '#fff' : t.textSecondary,
                    }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </Card>

          {/* GWA */}
          <Card elevated padded style={{ marginBottom: spacing.lg }}>
            <Text style={labelStyle}>GWA (General Weighted Average)</Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginBottom: spacing.sm }}>
              Your latest general weighted average (percentage)
            </Text>
            <TextInput
              style={[inputStyle, gwaError ? { borderColor: '#f87171' } : {}]}
              placeholder="e.g. 90.5"
              placeholderTextColor={t.textTertiary}
              value={gwaText}
              onChangeText={text => { setGwaText(text); setGwaError(null) }}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
            {gwaError ? (
              <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: '#f87171', marginTop: spacing.xs }}>
                {gwaError}
              </Text>
            ) : null}
          </Card>

          {/* Province */}
          <Card elevated padded style={{ marginBottom: spacing.xxl }}>
            <Text style={labelStyle}>Province</Text>
            <TextInput
              style={[inputStyle, { marginBottom: spacing.xs }]}
              placeholder="Search province..."
              placeholderTextColor={t.textTertiary}
              value={provinceQuery}
              onChangeText={setProvinceQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="words"
            />
            {province.trim() ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <View style={{
                  backgroundColor: 'rgba(128,0,0,0.20)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.40)',
                  borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                }}>
                  <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.accentText }}>
                    {province}
                  </Text>
                </View>
                <Pressable onPress={() => { setProvince(''); setProvinceQuery('') }} hitSlop={8} style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}>
                  <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary }}>clear</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={{
              maxHeight: 200, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous',
              overflow: 'hidden',
            }}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filteredProvinces.map(p => (
                  <Pressable
                    key={p}
                    onPress={() => { setProvince(p); setProvinceQuery(p) }}
                    style={({ pressed }) => [{
                      paddingHorizontal: spacing.lg, paddingVertical: 11, minHeight: 44, justifyContent: 'center',
                      backgroundColor: province === p ? 'rgba(128,0,0,0.12)' : 'transparent',
                      borderBottomWidth: 1, borderBottomColor: t.border,
                    }, pressed ? { opacity: 0.7 } : null]}
                  >
                    <Text style={{
                      fontFamily: 'Lexend_400Regular', fontSize: typo.sm,
                      color: province === p ? t.accentText : t.textPrimary,
                    }}>
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Card>

          {/* CTA */}
          <AppButton label="Next →" onPress={() => void handleMatcherContinue(false)} />
          <Pressable
            onPress={() => void handleMatcherContinue(true)}
            style={({ pressed }) => [{ alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.md, minHeight: 44, justifyContent: 'center' }, pressed ? { opacity: 0.6 } : null]}
          >
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>
              Skip for now
            </Text>
          </Pressable>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    )
  }

  // ── Target Courses step ───────────────────────────────────────────────────

  if (step === 'courses') {
    const cq = courseQuery.trim().toLowerCase()
    const searchResults = cq ? allCourses.filter(c => c.label.toLowerCase().includes(cq)).slice(0, 40) : []
    const isCourseSelected = (c: CourseOption) => selectedCourses.some(s => s.id === c.id)
    const MAX_COURSES = 3
    const toggleCourse = (c: CourseOption) =>
      setSelectedCourses(prev => {
        if (isCourseSelected(c)) return prev.filter(s => s.id !== c.id)
        if (prev.length >= MAX_COURSES) return prev  // cap selection at 3
        return [...prev, c]
      })

    // Render helper (called, not used as <CourseRow/>) so it is not re-created as a
    // new component type on every render — that would remount every row.
    const renderCourseRow = (c: CourseOption) => {
      const sel = isCourseSelected(c)
      return (
        <Pressable
          key={c.id}
          onPress={() => toggleCourse(c)}
          style={({ pressed }) => [{
            backgroundColor: sel ? 'rgba(128,0,0,0.20)' : t.surface,
            borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
            borderWidth: sel ? 2 : 1, borderColor: sel ? t.accent : t.border,
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44,
          }, pressed ? { opacity: 0.85 } : null]}
        >
          <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.base, color: t.textPrimary, flex: 1 }}>{c.label}</Text>
          <Text style={{ color: sel ? t.accentText : t.textTertiary, fontSize: 18 }}>{sel ? '✓' : '＋'}</Text>
        </Pressable>
      )
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: spacing.sm }}>
          <Pressable onPress={() => setStep(2)} hitSlop={8} style={({ pressed }) => [{ marginBottom: spacing.md }, pressed ? { opacity: 0.6 } : null]}>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>← Back</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, flex: 1 }}>Target Courses</Text>
            <Pressable onPress={() => void handleCoursesContinue(true)} hitSlop={{ top: 8, bottom: 8, left: 16, right: 0 }} style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}>
              <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>Skip</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary, marginTop: spacing.xs }}>
            Pick up to 3 courses ({selectedCourses.length}/3). Recommendations are based on your target exams.
          </Text>
          <TextInput
            style={[inputStyle, { marginTop: spacing.md }]}
            placeholder="Search courses (e.g. Nursing, Civil Engineering)…"
            placeholderTextColor={t.textTertiary}
            value={courseQuery}
            onChangeText={setCourseQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
        >
          {cq ? (
            searchResults.length > 0
              ? searchResults.map(renderCourseRow)
              : <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, paddingTop: spacing.lg }}>No courses found.</Text>
          ) : (
            <>
              {recommendedCourses.length > 0 && (
                <>
                  <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.sm, marginBottom: spacing.sm }}>
                    Recommended for you
                  </Text>
                  {recommendedCourses.map(renderCourseRow)}
                </>
              )}
              {selectedCourses.filter(c => !recommendedCourses.some(r => r.id === c.id)).length > 0 && (
                <>
                  <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm }}>
                    Also selected
                  </Text>
                  {selectedCourses.filter(c => !recommendedCourses.some(r => r.id === c.id)).map(renderCourseRow)}
                </>
              )}
              {recommendedCourses.length === 0 && selectedCourses.length === 0 && (
                <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, paddingTop: spacing.lg }}>
                  Search above to add the courses you&apos;re considering.
                </Text>
              )}
            </>
          )}
        </ScrollView>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.xxl, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.border }}>
          <AppButton
            label={`Continue${selectedCourses.length > 0 ? ` (${selectedCourses.length})` : ''} →`}
            onPress={() => void handleCoursesContinue(false)}
          />
        </View>
      </SafeAreaView>
    )
  }

  // ── Step 3: Pre-assessment ────────────────────────────────────────────────

  if (assessDone) {
    const correct = assessAnswers.filter(r => r.correct).length

    const subjects = Array.from(new Set(assessAnswers.map(r => r.q.subject)))
    const bySubject = subjects.map(sub => {
      const qs = assessAnswers.filter(r => r.q.subject === sub)
      const c = qs.filter(r => r.correct).length
      return { sub, correct: c, total: qs.length }
    })

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: 40, paddingBottom: 48 }}>
          <Text style={assessStyle.resultTitle}>Assessment Complete!</Text>
          <Text style={assessStyle.resultSub}>
            {correct} of {assessAnswers.length} correct.{'\n'}We've calibrated your starting level.
          </Text>

          <View style={{ marginBottom: spacing.xxl, gap: spacing.sm }}>
            {bySubject.filter(s => s.total > 0).map(({ sub, correct: c, total }) => {
              const pctSub = Math.round((c / total) * 100)
              return (
                <Card key={sub} padded={false} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                    <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.sm, color: t.textPrimary }}>{sub}</Text>
                    <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: typo.sm, color: pctSub >= 60 ? '#4ade80' : '#f87171' }}>
                      {c}/{total} ({pctSub}%)
                    </Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: t.surface2, borderRadius: radius.pill }}>
                    <View style={{ height: 4, borderRadius: radius.pill, width: `${pctSub}%` as any, backgroundColor: pctSub >= 60 ? '#4ade80' : '#f87171' }} />
                  </View>
                </Card>
              )
            })}
          </View>

          {selectedSlugs.length > 0 && (
            <View style={{ marginBottom: spacing.xxl }}>
              <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm }}>
                Your Focus List
              </Text>
              {selectedSlugs.map((slug, i) => {
                const listing = listings.find(l => l.slug === slug)
                return (
                  <View key={slug} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: 'rgba(128,0,0,0.82)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.sm, color: '#fff' }}>#{i + 1}</Text>
                    </View>
                    <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.md, color: t.textPrimary, flex: 1 }}>
                      {listing?.title ?? slug}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}

          <View style={{ marginTop: spacing.sm }}>
            <AppButton label="Start Learning →" onPress={finishOnboarding} />
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  const q = preAssessQuestions[assessIdx]
  if (!q) return null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xl }}>
        <StepDots active={3} t={t} />
      </View>

      <View style={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h3, color: t.textPrimary }}>
            Pre-Assessment
          </Text>
          <Pressable onPress={finishOnboarding} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>Skip</Text>
          </Pressable>
        </View>
        <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary, marginBottom: spacing.sm }}>
          {q.subject} · Question {assessIdx + 1} of {preAssessQuestions.length}
        </Text>
        <View style={{ height: 3, backgroundColor: t.surface2, borderRadius: radius.pill }}>
          <View style={{
            height: 3, backgroundColor: t.accent, borderRadius: radius.pill,
            width: `${((assessIdx + 1) / preAssessQuestions.length) * 100}%` as any,
          }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={assessStyle.questionCard}>
          <Text style={assessStyle.questionLabel}>{q.subject.toUpperCase()}</Text>
          <Text style={assessStyle.questionText}>{q.stem}</Text>
        </View>

        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {q.options.map((opt, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [assessStyle.optionBtn, pressed ? { opacity: 0.75 } : null]}
              onPress={() => handleAssessAnswer(i)}
            >
              <View style={assessStyle.optionLetter}>
                <Text style={assessStyle.optionLetterTxt}>{(['A', 'B', 'C', 'D'] as const)[i]}</Text>
              </View>
              <Text style={assessStyle.optionText}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
