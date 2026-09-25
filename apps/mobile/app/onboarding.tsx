import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { View, Text, SectionList, ActivityIndicator, ScrollView, Platform } from 'react-native'
// RN Image is fine for this bundled brand artwork.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '../services/supabase'
import { syncOnLaunch, pushUserData } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { invalidate } from '../services/queryCache'
import { runEnhancement } from '../hooks/useAiEnhancement'
import { capture } from '../lib/analytics'
import {
  userSettings, practiceSessions, focusListings as focusListingsTable, upcatQuestions,
} from '../db/schema'
import { eq, notInArray } from 'drizzle-orm'
import { SchoolPicker } from '../components/SchoolPicker'
import { PRE_ASSESS_QUESTIONS } from '../data/preAssessment'
import type { PreAssessQuestion } from '../data/preAssessment'
import { useTheme } from '../theme/ThemeContext'
import { spacing, textStyle } from '../theme/tokens'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { heading } from '../components/ui/a11y'
import { SearchField } from '../components/explore/SearchField'
import { StepShell } from '../components/onboarding/StepShell'
import { ChoiceRow } from '../components/onboarding/ChoiceRow'
import { QuestionView, ResultsView } from '../components/onboarding/PreAssessment'
import {
  nextStep, prevStep, resumeStep, furthestStep, type StepId, type ProgressMarker,
} from '../components/onboarding/flow'
import { restoreAnswers, examFocusSlug } from '../components/onboarding/restore'
import type { IncomeBracket } from '../utils/scholarshipMatch'
import {
  buildExamCatalog, orderExams, searchExams,
  recommendCourses, allCourseOptions,
  type ExamOption, type CourseOption, type TaxonomyRow, type CareerCourseRow,
} from '../utils/targetExams'
import { isSchoolFocusSlug } from '../utils/focusSlug'
import { buildPreAssessFromUpcat } from '../utils/preAssessmentSource'
import { prefetchSessionImages } from '../utils/prefetchQuestionImages'
import { canonicalizeRegion } from '../utils/region'
import { hasOnboardingFocus } from '../utils/onboardingStatus'

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
  { label: '₱100k or below a year', value: '<=100k' },
  { label: '₱100k to ₱300k', value: '100k-300k' },
  { label: '₱300k to ₱600k', value: '300k-600k' },
  { label: '₱600k to ₱1.2M', value: '600k-1.2M' },
  { label: 'Above ₱1.2M', value: '>1.2M' },
  { label: 'Prefer not to say', value: null },
]

interface ListingRow { id: string; slug: string; title: string; type: string; exam_date: string | null }

const GRADES = [9, 10, 11, 12] as const
const MAX_COURSES = 3

export default function OnboardingScreen() {
  const db = useDb()
  const { theme: t } = useTheme()

  // Which question is on screen. `ready` stays false until the saved profile
  // has been read, so a relaunch opens straight on the resume step instead of
  // flashing the name question first.
  const [step, setStep] = useState<StepId>('name')
  const [ready, setReady] = useState(false)

  // About you
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [schoolRegion, setSchoolRegion] = useState('')
  const [gradeLevel, setGradeLevel] = useState<number | null>(null)

  // Target University Exams
  const [examCatalog, setExamCatalog] = useState<ExamOption[]>([])
  const [examQuery, setExamQuery] = useState('')
  const [loadingExams, setLoadingExams] = useState(false)
  const [selectedExams, setSelectedExams] = useState<ExamOption[]>([])

  // Target Courses
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExams, allCourses])

  // Scholarship match (all optional)
  const [incomeBracket, setIncomeBracket] = useState<IncomeBracket | null>(null)
  // "Prefer not to say" is an explicit, selectable choice — distinct from "not yet
  // answered". Both leave incomeBracket null (no income filter).
  const [incomePreferNotToSay, setIncomePreferNotToSay] = useState(false)
  const [gwaText, setGwaText] = useState('')
  const [gwaError, setGwaError] = useState<string | undefined>(undefined)
  const [province, setProvince] = useState('')
  const [provinceQuery, setProvinceQuery] = useState('')

  // Scholarships (shown with the exams on the goal step)
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loadingListings, setLoadingListings] = useState(false)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Quick check
  const [assessIdx, setAssessIdx] = useState(0)
  const [assessAnswers, setAssessAnswers] = useState<Array<{ q: PreAssessQuestion; correct: boolean }>>([])
  const [assessDone, setAssessDone] = useState(false)

  // Readiness gate — tracks background sync started when the goal is confirmed
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [gateVisible, setGateVisible] = useState(false)

  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  // Re-entry guard for the sync chain (a ref, so promise callbacks see the live value).
  const syncRunningRef = useRef(false)

  // Furthest step completed, as persisted in user_settings.onboarding_step.
  // Only moves forward (see furthestStep), so Back + Continue never rewinds it.
  const furthestRef = useRef<string>('')

  // Resume: prefill every saved answer (Google sign-in seeds the name; an
  // interrupted onboarding saved each answer as it went) and open on the step
  // after the furthest one reached. A finished onboarding goes to the app.
  useEffect(() => {
    async function prefill() {
      try {
        const [rows, focusRows] = await Promise.all([
          db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
          db.select().from(focusListingsTable).orderBy(focusListingsTable.priority),
        ])
        const s = rows[0]
        if (!aliveRef.current) return
        const focusSlugs = (focusRows ?? []).map(r => r.listingSlug)
        if (s) {
          if (s.fullName) setFullName(s.fullName)
          if (s.school) setSchool(s.school)
          if (s.schoolRegion) setSchoolRegion(s.schoolRegion)
          if (s.gradeLevel) setGradeLevel(s.gradeLevel)
          const restored = restoreAnswers(s, focusSlugs)
          setSelectedExams(restored.selectedExams)
          setSelectedSlugs(restored.selectedSlugs)
          setSelectedCourses(restored.selectedCourses)
          setIncomeBracket(restored.incomeBracket)
          setGwaText(restored.gwaText)
          setProvince(restored.province)
          furthestRef.current = s.onboardingStep ?? ''
        }
        const resume = resumeStep({
          fullName: s?.fullName,
          gradeLevel: s?.gradeLevel,
          hasFocus: hasOnboardingFocus({
            selectedListingSlug: s?.selectedListingSlug,
            focusCount: focusSlugs.length,
            targetExams: s?.targetExams,
          }),
          furthest: s?.onboardingStep,
        })
        if (resume === 'done') {
          // Finished before: stay blank (never flash a question) and leave.
          router.replace('/(tabs)')
          return
        }
        setStep(resume)
        setReady(true)
      } catch (e) {
        console.warn('[onboarding] prefill error:', e)
        if (aliveRef.current) setReady(true)
      }
    }
    void prefill()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Best-effort upsert of profile fields. The UI never waits on it: the
  // expo-sqlite driver runs synchronously, so the row is written before the
  // next question renders, and a failure only logs.
  const saveProfile = useCallback((patch: Partial<typeof userSettings.$inferInsert>) => {
    void Promise.resolve(
      db.insert(userSettings)
        .values({ id: 1, ...patch } as typeof userSettings.$inferInsert)
        .onConflictDoUpdate({ target: userSettings.id, set: patch }),
    )
      .then(() => invalidate('settings:'))
      .catch((e: unknown) => console.warn('[onboarding] persist error:', e))
  }, [db])

  /** Record `id` as completed; returns the marker to persist with that step's answer. */
  function reached(id: ProgressMarker): ProgressMarker {
    const f = furthestStep(furthestRef.current, id)
    furthestRef.current = f
    return f
  }

  useEffect(() => {
    if (step !== 'goals') return
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
  // the goal step. Fetched from Supabase because the catalog tables aren't synced
  // into the local DB until after the first sync, which only runs once a goal is
  // chosen (i.e. after this step). The courses step retries if it was missed.
  useEffect(() => {
    if ((step !== 'goals' && step !== 'courses') || examCatalog.length > 0) return
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
        const catalog = buildExamCatalog(profiles, schools)
        setExamCatalog(catalog)
        // Exams restored on resume are stubs (id, name, acronym); swap in the
        // catalog entries so course recommendations see their course lists.
        setSelectedExams(prev => prev.map(e => catalog.find(c => c.schoolId === e.schoolId) ?? e))
        setAllCourses(allCourseOptions(tax, cc))
      } catch (e) {
        console.warn('[onboarding] exam catalog load error:', e)
      } finally {
        setLoadingExams(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Build the quick check from the synced question bank when it is reached.
  useEffect(() => {
    if (step !== 'check') return
    void loadPreAssessment()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ── Deduplicated sync chain (initial + retry) ─────────────────────────────
  const startContentSync = useCallback((_reason: 'initial' | 'retry') => {
    if (syncRunningRef.current) return
    syncRunningRef.current = true
    if (aliveRef.current) setSyncStatus('running')
    syncOnLaunch(db)
      .then(() => {
        syncRunningRef.current = false
        if (aliveRef.current) setSyncStatus('done')
        void runEnhancement(db).catch(e => console.warn('[onboarding] enhancement error:', e))
      })
      .catch(e => {
        syncRunningRef.current = false
        console.warn('[onboarding] sync error:', e)
        if (aliveRef.current) setSyncStatus('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  function go(to: StepId | null) {
    if (to) setStep(to)
  }

  // ── About you ────────────────────────────────────────────────────────────

  function continueFromName() {
    const name = fullName.trim()
    if (!name) return
    go(nextStep('name'))
    // Persist NOW: fullName is what gates landing-vs-app on launch.
    saveProfile({ fullName: name, onboardingStep: reached('name') })
  }

  function continueFromGrade() {
    if (!gradeLevel) return
    go(nextStep('grade'))
    saveProfile({ fullName: fullName.trim(), gradeLevel, onboardingStep: reached('grade') })
  }

  function continueFromSchool(skip: boolean) {
    go(nextStep('school'))
    const onboardingStep = reached('school')
    saveProfile(skip
      ? { onboardingStep }
      : { school: school.trim(), schoolRegion: canonicalizeRegion(schoolRegion), onboardingStep })
  }

  // ── Your goal ────────────────────────────────────────────────────────────

  async function confirmGoals() {
    if (selectedExams.length === 0 && selectedSlugs.length === 0) return
    setSaving(true)
    const now = Date.now()
    // Exams that map to a content-backed listing keep their slug; any other
    // picked school becomes a school-level focus ("school:<id>") so the choice
    // is never silently dropped — its practice resolves to general-cet.
    const examSlugs = Array.from(new Set(
      selectedExams.map(examFocusSlug),
    ))
    const focusSlugs = Array.from(new Set([...selectedSlugs, ...examSlugs]))
    // selectedListingSlug is consumed app-wide as a CONTENT slug — never store
    // a school: pseudo-slug; school-only selections fall back to general-cet.
    const primarySlug = focusSlugs.find(s => !isSchoolFocusSlug(s))
      ?? (focusSlugs.length > 0 ? 'general-cet' : '')
    const targetExamsJson = JSON.stringify(
      selectedExams.map(e => ({ schoolId: e.schoolId, schoolName: e.schoolName, examAcronym: e.examAcronym })),
    )
    const profileFields = {
      fullName: fullName.trim(),
      school: school.trim(),
      schoolRegion: canonicalizeRegion(schoolRegion),
      gradeLevel: gradeLevel ?? undefined,
      targetExams: targetExamsJson,
      onboardingStep: reached('goals'),
    }
    // Persist profile + selection FIRST, in its own statement, so a bad focus-row
    // insert can't roll it back (these gate returning-user detection).
    try {
      await db.insert(userSettings).values({
        id: 1, selectedListingSlug: primarySlug, lastSyncedAt: 0, ...profileFields,
      }).onConflictDoUpdate({
        target: userSettings.id,
        set: { selectedListingSlug: primarySlug, lastSyncedAt: 0, ...profileFields },
      })
      invalidate('settings:')
    } catch (e) {
      console.error('[onboarding] goal settings persist error:', e)
    }
    // A resumed goal step starts from the saved picks; drop any the student
    // un-picked so they don't come back on the next resume.
    try {
      await db.delete(focusListingsTable).where(notInArray(focusListingsTable.listingSlug, focusSlugs))
    } catch (e) {
      console.warn('[onboarding] focus row cleanup error:', e)
    }
    for (let i = 0; i < focusSlugs.length; i++) {
      try {
        await db.insert(focusListingsTable)
          .values({ listingSlug: focusSlugs[i]!, priority: i + 1, addedAt: now })
          .onConflictDoNothing()
      } catch (e) {
        console.warn('[onboarding] focus row persist error:', e)
      }
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void supabase.from('profiles')
          .update({ target_exams: selectedExams.map(e => e.examAcronym) })
          .eq('id', data.user.id)
      }
    })
    // ALWAYS advance; sync content in the background.
    setSaving(false)
    go(nextStep('goals'))
    startContentSync('initial')
  }

  function continueFromCourses(skip: boolean) {
    const onboardingStep = reached('courses')
    if (!skip && selectedCourses.length > 0) {
      const json = JSON.stringify(
        selectedCourses.map(c => ({ id: c.id, label: c.label, careerCourseId: c.careerCourseId })),
      )
      saveProfile({ targetCourses: json, onboardingStep })
      void supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          void supabase.from('profiles')
            .update({ target_courses: selectedCourses.map(c => c.label) })
            .eq('id', data.user.id)
        }
      })
    } else {
      saveProfile({ onboardingStep })
    }
    go(nextStep('courses'))
  }

  // ── Scholarship match ────────────────────────────────────────────────────

  function continueFromIncome(skip: boolean) {
    const onboardingStep = reached('income')
    // "Prefer not to say" is an answer too: it clears a bracket restored on resume.
    const answered = !skip && (incomeBracket !== null || incomePreferNotToSay)
    saveProfile(answered ? { incomeBracket, onboardingStep } : { onboardingStep })
    go(nextStep('income'))
  }

  function continueFromGwa(skip: boolean) {
    let gwaNum: number | null = null
    if (!skip && gwaText.trim()) {
      gwaNum = parseFloat(gwaText.trim())
      if (isNaN(gwaNum) || gwaNum < 75 || gwaNum > 100) {
        setGwaError('Enter a GWA from 75 to 100, like 90.5.')
        return
      }
    }
    const onboardingStep = reached('gwa')
    saveProfile(gwaNum !== null ? { gwa: gwaNum, onboardingStep } : { onboardingStep })
    setGwaError(undefined)
    go(nextStep('gwa'))
  }

  function continueFromProvince(skip: boolean) {
    const onboardingStep = reached('province')
    saveProfile(!skip && province.trim() ? { province: province.trim(), onboardingStep } : { onboardingStep })
    go(nextStep('province'))
  }

  // ── Quick check ──────────────────────────────────────────────────────────

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
        hasVisual: upcatQuestions.hasVisual,
        imageUrl: upcatQuestions.imageUrl,
        imageAlt: upcatQuestions.imageAlt,
        imageWidth: upcatQuestions.imageWidth,
        imageHeight: upcatQuestions.imageHeight,
      }).from(upcatQuestions).where(eq(upcatQuestions.status, 'published'))
      const built = buildPreAssessFromUpcat(rows ?? [], [...PRE_ASSESS_SUBTESTS], 3)
      if (built.length >= 3 && aliveRef.current && assessIdx === 0) {
        setPreAssessQuestions(built)
        prefetchSessionImages(built) // fire-and-forget; never blocks the check
      }
    } catch (e) {
      console.warn('[onboarding] pre-assessment build error:', e)
    }
  }

  function handleAssessAnswer(optionIdx: number) {
    const q = preAssessQuestions[assessIdx]
    if (!q) return
    const correct = optionIdx === q.answerIndex
    const newAnswers = [...assessAnswers, { q, correct }]

    if (assessIdx === preAssessQuestions.length - 1) {
      const now = Date.now()
      const grouped = new Map<string, { correct: number; total: number }>()
      for (const r of newAnswers) {
        const stats = grouped.get(r.q.subject) ?? { correct: 0, total: 0 }
        stats.total++
        if (r.correct) stats.correct++
        grouped.set(r.q.subject, stats)
      }
      // Synchronous transaction (Drizzle's expo-sqlite driver is sync — an async
      // callback would commit BEFORE the awaited inserts ran). Use .run() inside.
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

  // Auto-continue when sync finishes while the gate is showing.
  useEffect(() => {
    if (gateVisible && syncStatus === 'done') {
      if (aliveRef.current) router.replace('/welcome')
    }
  }, [gateVisible, syncStatus])

  function finishOnboarding() {
    capture('onboarding_completed')
    // Finished: a relaunch or a stray link back here goes straight to the app.
    saveProfile({ onboardingStep: reached('done') })
    if (syncStatus === 'done' || syncStatus === 'idle') {
      router.replace('/welcome')
    } else {
      setGateVisible(true)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: t.bg }} />
  }

  if (gateVisible) {
    const isError = syncStatus === 'error'
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', paddingHorizontal: spacing.xxl, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
            <Image
              source={require('../assets/images/kuya-baw-logo.png')}
              style={{ width: 112, height: 112, marginBottom: spacing.xxl }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <Text {...heading(1)} style={[textStyle('title', t.textPrimary), { textAlign: 'center' }]}>
              {isError ? "That didn't load" : 'Hang tight, almost there'}
            </Text>
            <Text
              style={[textStyle('body', t.textSecondary), { textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.xxl }]}
              accessibilityLiveRegion="polite"
            >
              {isError
                ? 'Please check your internet connection and try again.'
                : "We're preparing your reviewers, exams, and scholarship matches based on what you picked. First-time setup usually takes under a minute."}
            </Text>
            {isError ? (
              <View style={{ width: '100%', gap: spacing.sm }}>
                <Button label="Try again" onPress={() => startContentSync('retry')} size="lg" fullWidth />
                <Button
                  label="Continue anyway"
                  variant="ghost"
                  onPress={() => router.replace('/(tabs)')}
                  accessibilityHint="Skips setup for now and finishes it next time you open the app"
                  fullWidth
                />
                <Text style={[textStyle('bodySm', t.textSecondary), { textAlign: 'center' }]}>
                  {"We'll finish getting things ready next time you open the app."}
                </Text>
              </View>
            ) : (
              <ActivityIndicator color={t.accentText} size="large" accessibilityLabel="Preparing your content" />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (step === 'name') {
    return (
      <StepShell
        step="name"
        title="What should we call you?"
        description="Your name stays on this phone, and in your backup if you sign in."
        primaryLabel="Continue"
        onPrimary={continueFromName}
        primaryDisabled={!fullName.trim()}
      >
        <TextField
          label="Full name"
          required
          value={fullName}
          onChangeText={setFullName}
          placeholder="e.g. Juan dela Cruz"
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={continueFromName}
          autoFocus={Platform.OS === 'web'}
        />
      </StepShell>
    )
  }

  if (step === 'grade') {
    return (
      <StepShell
        step="grade"
        title="What grade are you in?"
        description="Philippine K-12. We pace your study plan to it."
        onBack={() => go(prevStep('grade'))}
        primaryLabel="Continue"
        onPrimary={continueFromGrade}
        primaryDisabled={!gradeLevel}
      >
        <View accessibilityRole="radiogroup" accessibilityLabel="Grade level" style={{ gap: spacing.sm }}>
          {GRADES.map(g => (
            <ChoiceRow
              key={g}
              mode="radio"
              label={`Grade ${g}`}
              description={g >= 11 ? 'Senior high school' : 'Junior high school'}
              accessibilityLabel={`Grade ${g}`}
              selected={gradeLevel === g}
              onPress={() => setGradeLevel(g)}
            />
          ))}
        </View>
      </StepShell>
    )
  }

  if (step === 'school') {
    return (
      <StepShell
        step="school"
        title="Where do you study?"
        description="We use your school's region to show nearby universities first."
        onBack={() => go(prevStep('school'))}
        onSkip={() => continueFromSchool(true)}
        primaryLabel="Continue"
        onPrimary={() => continueFromSchool(false)}
      >
        <Text style={[textStyle('label', t.textPrimary), { marginBottom: spacing.xs }]}>School</Text>
        <SchoolPicker value={school} onChange={setSchool} onSelectMeta={m => setSchoolRegion(m.region ?? '')} />
      </StepShell>
    )
  }

  if (step === 'goals') {
    const ordered = orderExams(examCatalog, schoolRegion)
    const q = examQuery.trim()
    const examItems = searchExams(ordered, q).slice(0, q ? 60 : 80)
    const scholarshipItems = q
      ? listings.filter(l => l.title.toLowerCase().includes(q.toLowerCase()))
      : listings
    type GoalItem = ExamOption | ListingRow
    const sections: { key: string; title: string; data: GoalItem[] }[] = [
      { key: 'exams', title: 'University entrance exams', data: examItems },
      { key: 'sch', title: 'Scholarships', data: scholarshipItems },
    ].filter(s => s.data.length > 0)
    const selectedCount = selectedExams.length + selectedSlugs.length
    const loadingGoals = loadingExams || loadingListings

    return (
      <StepShell
        step="goals"
        title="What are you preparing for?"
        description={`Pick one or more entrance exams or scholarships${schoolRegion ? `. Top national schools come first, then ${canonicalizeRegion(schoolRegion)}` : ''}.`}
        onBack={() => go(prevStep('goals'))}
        primaryLabel={saving ? 'Saving…' : `Continue${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        onPrimary={() => void confirmGoals()}
        primaryDisabled={selectedCount === 0}
        primaryLoading={saving}
        scroll={false}
      >
        <SearchField
          value={examQuery}
          onChangeText={setExamQuery}
          placeholder="e.g. UPCAT, DOST, Ateneo"
          accessibilityLabel="Search exams, universities or scholarships"
        />
        {loadingGoals ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.accentText} size="large" accessibilityLabel="Loading exams and scholarships" />
          </View>
        ) : (
          <SectionList
            sections={sections}
            style={{ flex: 1 }}
            keyExtractor={(item, i) => ('schoolId' in item ? item.schoolId : item.id) + ':' + i}
            contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm }}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <Text style={[textStyle('body', t.textSecondary), { textAlign: 'center', paddingTop: spacing.xxl }]}>
                {q ? `Nothing matches “${q}”. Try the school's short name, like UPLB.` : 'No exams to show yet. Check your connection.'}
              </Text>
            }
            renderSectionHeader={({ section }) => (
              <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { marginTop: spacing.lg, marginBottom: spacing.xs }]}>
                {section.title}
              </Text>
            )}
            renderItem={({ item, section }) => {
              if (section.key === 'exams') {
                const ex = item as ExamOption
                const sel = selectedExams.some(s => s.schoolId === ex.schoolId)
                const meta = [ex.examAcronym, ex.region, ex.national ? 'Top in PH' : null].filter(Boolean).join(' · ')
                return (
                  <ChoiceRow
                    mode="checkbox"
                    label={ex.schoolName}
                    description={meta}
                    selected={sel}
                    onPress={() => setSelectedExams(prev => sel ? prev.filter(s => s.schoolId !== ex.schoolId) : [...prev, ex])}
                  />
                )
              }
              const lst = item as ListingRow
              const sel = selectedSlugs.includes(lst.slug)
              return (
                <ChoiceRow
                  mode="checkbox"
                  label={lst.title}
                  description={lst.exam_date
                    ? new Date(lst.exam_date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
                    : undefined}
                  selected={sel}
                  onPress={() => setSelectedSlugs(prev => sel ? prev.filter(s => s !== lst.slug) : [...prev, lst.slug])}
                />
              )
            }}
          />
        )}
      </StepShell>
    )
  }

  if (step === 'courses') {
    const cq = courseQuery.trim().toLowerCase()
    const searchResults = cq ? allCourses.filter(c => c.label.toLowerCase().includes(cq)).slice(0, 40) : []
    const isSel = (c: CourseOption) => selectedCourses.some(s => s.id === c.id)
    const full = selectedCourses.length >= MAX_COURSES
    const toggle = (c: CourseOption) =>
      setSelectedCourses(prev => {
        if (prev.some(s => s.id === c.id)) return prev.filter(s => s.id !== c.id)
        if (prev.length >= MAX_COURSES) return prev
        return [...prev, c]
      })
    const row = (c: CourseOption) => (
      <ChoiceRow
        key={c.id}
        mode="checkbox"
        label={c.label}
        selected={isSel(c)}
        disabled={full && !isSel(c)}
        onPress={() => toggle(c)}
      />
    )
    const extraSelected = selectedCourses.filter(c => !recommendedCourses.some(r => r.id === c.id))

    return (
      <StepShell
        step="courses"
        title="Which courses are you considering?"
        description={`Pick up to ${MAX_COURSES}. ${selectedCourses.length} of ${MAX_COURSES} picked.`}
        onBack={() => go(prevStep('courses'))}
        onSkip={() => continueFromCourses(true)}
        primaryLabel={`Continue${selectedCourses.length > 0 ? ` (${selectedCourses.length})` : ''}`}
        onPrimary={() => continueFromCourses(false)}
      >
        <View style={{ gap: spacing.sm }}>
          <SearchField
            value={courseQuery}
            onChangeText={setCourseQuery}
            placeholder="e.g. Nursing, Civil Engineering"
            accessibilityLabel="Search courses"
          />
          {cq ? (
            searchResults.length > 0
              ? searchResults.map(row)
              : <Text style={[textStyle('body', t.textSecondary), { paddingTop: spacing.lg }]}>{`No course matches “${courseQuery.trim()}”.`}</Text>
          ) : (
            <>
              {recommendedCourses.length > 0 ? (
                <>
                  <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { marginTop: spacing.md }]}>Recommended for your exams</Text>
                  {recommendedCourses.map(row)}
                </>
              ) : null}
              {extraSelected.length > 0 ? (
                <>
                  <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { marginTop: spacing.md }]}>Also picked</Text>
                  {extraSelected.map(row)}
                </>
              ) : null}
              {recommendedCourses.length === 0 && selectedCourses.length === 0 ? (
                <Text style={[textStyle('body', t.textSecondary), { paddingTop: spacing.md }]}>
                  Search for the courses you&apos;re thinking about.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </StepShell>
    )
  }

  if (step === 'income') {
    return (
      <StepShell
        step="income"
        title="What is your household income?"
        description="A yearly estimate. Many scholarships have an income limit, so this helps us show the ones you can apply for. It stays private."
        onBack={() => go(prevStep('income'))}
        onSkip={() => continueFromIncome(true)}
        primaryLabel="Continue"
        onPrimary={() => continueFromIncome(false)}
      >
        <View accessibilityRole="radiogroup" accessibilityLabel="Household income a year" style={{ gap: spacing.sm }}>
          {INCOME_OPTIONS.map(opt => {
            const isPreferNot = opt.value === null
            const active = isPreferNot ? incomePreferNotToSay : (!incomePreferNotToSay && incomeBracket === opt.value)
            return (
              <ChoiceRow
                key={opt.label}
                mode="radio"
                label={opt.label}
                selected={active}
                onPress={() => {
                  if (isPreferNot) {
                    setIncomePreferNotToSay(true)
                    setIncomeBracket(null)
                  } else {
                    setIncomePreferNotToSay(false)
                    setIncomeBracket(opt.value)
                  }
                }}
              />
            )
          })}
        </View>
      </StepShell>
    )
  }

  if (step === 'gwa') {
    return (
      <StepShell
        step="gwa"
        title="What is your latest GWA?"
        description="Your general weighted average, as a percentage. Scholarships use it to check eligibility."
        onBack={() => go(prevStep('gwa'))}
        onSkip={() => continueFromGwa(true)}
        primaryLabel="Continue"
        onPrimary={() => continueFromGwa(false)}
      >
        <TextField
          label="GWA"
          hint="From 75 to 100"
          error={gwaError}
          value={gwaText}
          onChangeText={v => { setGwaText(v); setGwaError(undefined) }}
          placeholder="e.g. 90.5"
          keyboardType="decimal-pad"
          inputMode="decimal"
          returnKeyType="done"
          onSubmitEditing={() => continueFromGwa(false)}
        />
      </StepShell>
    )
  }

  if (step === 'province') {
    const pq = provinceQuery.trim().toLowerCase()
    const filtered = pq ? PH_PROVINCES.filter(p => p.toLowerCase().includes(pq)) : PH_PROVINCES
    return (
      <StepShell
        step="province"
        title="Which province do you live in?"
        description="Some scholarships are only for students from certain provinces."
        onBack={() => go(prevStep('province'))}
        onSkip={() => continueFromProvince(true)}
        primaryLabel={province ? `Continue with ${province}` : 'Continue'}
        onPrimary={() => continueFromProvince(false)}
      >
        <View style={{ gap: spacing.sm }}>
          <SearchField
            value={provinceQuery}
            onChangeText={setProvinceQuery}
            placeholder="e.g. Camarines Sur"
            accessibilityLabel="Search provinces"
          />
          <View accessibilityRole="radiogroup" accessibilityLabel="Province" style={{ gap: spacing.sm }}>
            {filtered.map(p => (
              <ChoiceRow key={p} mode="radio" label={p} selected={province === p} onPress={() => setProvince(p)} />
            ))}
          </View>
          {filtered.length === 0 ? (
            <Text style={textStyle('body', t.textSecondary)}>{`No province matches “${provinceQuery.trim()}”.`}</Text>
          ) : null}
        </View>
      </StepShell>
    )
  }

  // ── Quick check ───────────────────────────────────────────────────────────

  if (assessDone) {
    const correct = assessAnswers.filter(r => r.correct).length
    const subjects = Array.from(new Set(assessAnswers.map(r => r.q.subject)))
    const bySubject = subjects.map(sub => {
      const qs = assessAnswers.filter(r => r.q.subject === sub)
      return { sub, correct: qs.filter(r => r.correct).length, total: qs.length }
    })
    const focusTitles = [
      ...selectedExams.map(e => `${e.schoolName} (${e.examAcronym})`),
      ...selectedSlugs.map(slug => listings.find(l => l.slug === slug)?.title ?? slug),
    ]
    return (
      <ResultsView
        correct={correct}
        total={assessAnswers.length}
        bySubject={bySubject}
        focusTitles={focusTitles}
        onStart={finishOnboarding}
      />
    )
  }

  const q = preAssessQuestions[assessIdx]
  if (!q) return null

  return (
    <StepShell
      step="check"
      title="A quick warm-up"
      description={`${preAssessQuestions.length} short questions. Answer what you can; it only sets your starting point.`}
      onBack={assessIdx === 0 ? () => go(prevStep('check')) : undefined}
      onSkip={finishOnboarding}
    >
      <QuestionView q={q} index={assessIdx} total={preAssessQuestions.length} onAnswer={handleAssessAnswer} />
    </StepShell>
  )
}
