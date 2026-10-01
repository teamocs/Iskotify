import { useEffect, useState, useRef, useCallback } from 'react'
import { View, Text, SectionList, ActivityIndicator, ScrollView, Platform, BackHandler } from 'react-native'
// RN Image is fine for this bundled brand artwork.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import { Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import { supabase } from '../services/supabase'
import { syncOnLaunch, pushUserData } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { invalidate } from '../services/queryCache'
import { capture } from '../lib/analytics'
import {
  userSettings, practiceSessions, focusListings as focusListingsTable, upcatQuestions,
} from '../db/schema'
import { eq, notInArray } from 'drizzle-orm'
import { PRE_ASSESS_QUESTIONS } from '../data/preAssessment'
import type { PreAssessQuestion } from '../data/preAssessment'
import { useTheme } from '../theme/ThemeContext'
import { spacing, textStyle } from '../theme/tokens'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { heading } from '../components/ui/a11y'
import { SearchField } from '../components/explore/SearchField'
import { StepShell } from '../components/onboarding/StepShell'
import { ConsentControls, type ConsentFormValue } from '../components/consent/ConsentControls'
import { applyAnalyticsConsent } from '../services/analyticsConsent'
import { consentFormReason, consentPatch, isConsentCurrent } from '../utils/consent'
import { ChoiceRow } from '../components/onboarding/ChoiceRow'
import { QuestionView, ResultsView } from '../components/onboarding/PreAssessment'
import {
  nextStep, prevStep, resumeStep, furthestStep, type StepId, type ProgressMarker,
} from '../components/onboarding/flow'
import { restoreAnswers, examFocusSlug } from '../components/onboarding/restore'
import { buildExamCatalog, orderExams, searchExams, type ExamOption } from '../utils/targetExams'
import { isSchoolFocusSlug } from '../utils/focusSlug'
import { buildPreAssessFromUpcat } from '../utils/preAssessmentSource'
import { prefetchSessionImages } from '../utils/prefetchQuestionImages'
import { canonicalizeRegion } from '../utils/region'
import { hasOnboardingFocus } from '../utils/onboardingStatus'
import { flushWebPersist } from '../db/webPersist'
import { afterOnboardingHref } from '../components/walkthrough/tourFlow'

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

interface ListingRow { id: string; slug: string; title: string; type: string; exam_date: string | null }

const GRADES = [9, 10, 11, 12] as const

export default function OnboardingScreen() {
  const db = useDb()
  const { theme: t } = useTheme()

  // Which question is on screen. `ready` stays false until the saved profile
  // has been read, so a relaunch opens straight on the resume step instead of
  // flashing the name question first.
  const [step, setStep] = useState<StepId>('consent')
  const [ready, setReady] = useState(false)

  // Consent (the first step): nothing is pre-chosen for a new student.
  const [consentForm, setConsentForm] = useState<ConsentFormValue>({ ageBand: null, terms: false, guardian: false })
  const hasFocusRef = useRef(false)

  // About you
  const [fullName, setFullName] = useState('')
  const [gradeLevel, setGradeLevel] = useState<number | null>(null)
  // Read only, to order the exam list: the school itself is asked on the
  // scholarship profile now, so onboarding never writes it.
  const [schoolRegion, setSchoolRegion] = useState('')

  // Target University Exams
  const [examCatalog, setExamCatalog] = useState<ExamOption[]>([])
  const [examQuery, setExamQuery] = useState('')
  const [loadingExams, setLoadingExams] = useState(false)
  const [selectedExams, setSelectedExams] = useState<ExamOption[]>([])

  // Pre-assessment questions (dynamic: from the exam-tagged bank when available)
  const [preAssessQuestions, setPreAssessQuestions] = useState<PreAssessQuestion[]>(PRE_ASSESS_QUESTIONS)

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

  // When the guided tour was first shown (user_settings.tour_seen_at). Finishing
  // opens it only while this is 0, so it appears once.
  const tourSeenRef = useRef<number>(0)

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
          if (s.schoolRegion) setSchoolRegion(s.schoolRegion)
          if (s.gradeLevel) setGradeLevel(s.gradeLevel)
          const restored = restoreAnswers(s, focusSlugs)
          setSelectedExams(restored.selectedExams)
          setSelectedSlugs(restored.selectedSlugs)
          if (isConsentCurrent(s)) {
            setConsentForm({ ageBand: s.ageBand as ConsentFormValue['ageBand'], terms: true, guardian: s.ageBand === 'minor' })
          }
          furthestRef.current = s.onboardingStep ?? ''
          tourSeenRef.current = Number(s.tourSeenAt ?? 0)
        }
        hasFocusRef.current = hasOnboardingFocus({
          selectedListingSlug: s?.selectedListingSlug,
          focusCount: focusSlugs.length,
          targetExams: s?.targetExams,
        })
        const resume = resumeStep({
          consented: !!s && isConsentCurrent(s),
          fullName: s?.fullName,
          gradeLevel: s?.gradeLevel,
          hasFocus: hasFocusRef.current,
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
  // next question renders, and a failure only logs. On web the database lives
  // in memory (sql.js) and reaches IndexedDB only on a 2s debounce or an async
  // pagehide save that a reload beats, so each answer is flushed right away —
  // otherwise a refresh mid-onboarding restarted at the name question.
  const saveProfile = useCallback((patch: Partial<typeof userSettings.$inferInsert>): Promise<void> => {
    return Promise.resolve(
      db.insert(userSettings)
        .values({ id: 1, ...patch } as typeof userSettings.$inferInsert)
        .onConflictDoUpdate({ target: userSettings.id, set: patch }),
    )
      .then(() => { invalidate('settings:'); flushWebPersist() })
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

  // Build the searchable, region-ordered exam catalog when entering the goal
  // step. Fetched from Supabase because the catalog tables aren't synced into
  // the local DB until after the first sync, which only runs once a goal is
  // chosen (i.e. after this step).
  useEffect(() => {
    if (step !== 'goals' || examCatalog.length > 0) return
    setLoadingExams(true)
    void (async () => {
      try {
        const [profRes, schoolRes] = await Promise.all([
          supabase.from('university_profiles').select('school_id,data_tier,entrance_exam_acronym,entrance_exam_name,exam_month,known_for_courses,prc_top_courses'),
          supabase.from('tertiary_schools').select('id,name,acronym,region,province,rank_in_province'),
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
        const catalog = buildExamCatalog(profiles, schools)
        setExamCatalog(catalog)
        // Exams restored on resume are stubs (id, name, acronym); swap in the
        // full catalog entries.
        setSelectedExams(prev => prev.map(e => catalog.find(c => c.schoolId === e.schoolId) ?? e))
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
      })
      .catch(e => {
        syncRunningRef.current = false
        console.warn('[onboarding] sync error:', e)
        if (aliveRef.current) setSyncStatus('error')
      })
  }, [db])

  function go(to: StepId | null) {
    if (to) setStep(to)
  }

  // ── Before we start ──────────────────────────────────────────────────────

  function continueFromConsent() {
    if (!consentForm.ageBand || consentFormReason(consentForm)) return
    // Saved with the progress marker; the analytics rule (off for minors until
    // they opt in, on for adults until they opt out) applies only after this.
    void saveProfile({ ...consentPatch(consentForm.ageBand), onboardingStep: reached('consent') })
      .then(() => applyAnalyticsConsent(db))
      .catch((e: unknown) => console.warn('[onboarding] analytics consent:', e))
    // Pick up where the student was: a new student is asked about themselves; a
    // student who was part-way through an older onboarding resumes there.
    const next = resumeStep({
      consented: true,
      fullName,
      gradeLevel,
      hasFocus: hasFocusRef.current,
      furthest: furthestRef.current,
    })
    if (next === 'done') router.replace('/(tabs)')
    else setStep(next)
  }

  // ── About you ────────────────────────────────────────────────────────────

  function continueFromAbout() {
    const name = fullName.trim()
    if (!name || !gradeLevel) return
    go(nextStep('about'))
    // Persist NOW: fullName and gradeLevel are what gate landing-vs-app on launch.
    saveProfile({ fullName: name, gradeLevel, onboardingStep: reached('about') })
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
    // The school is not written here: it is asked on the scholarship profile,
    // and a resumed student's saved school must stay as it is.
    const profileFields = {
      fullName: fullName.trim(),
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
    flushWebPersist()
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
              // Excluded from Progress stats (utils/sessionKind isProgressSession);
              // still counts toward streak days.
              kind: 'onboarding',
              attemptKey: now,
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

  // Finished: the guided tour the first time, Today after that.
  const leaveOnboarding = useCallback(() => {
    router.replace(afterOnboardingHref(tourSeenRef.current) as Href)
  }, [])

  // Auto-continue when sync finishes while the gate is showing.
  useEffect(() => {
    if (gateVisible && syncStatus === 'done') {
      if (aliveRef.current) leaveOnboarding()
    }
  }, [gateVisible, syncStatus, leaveOnboarding])

  function finishOnboarding() {
    capture('onboarding_completed')
    // Finished: a relaunch or a stray link back here goes straight to the app.
    saveProfile({ onboardingStep: reached('done') })
    if (syncStatus === 'done' || syncStatus === 'idle') {
      leaveOnboarding()
    } else {
      setGateVisible(true)
    }
  }

  // Android Back steps back one question (the same place the on-screen Back
  // button goes) instead of leaving onboarding — it was replaced into the
  // stack, so the system Back used to close the app mid-flow. Where the screen
  // has no Back (the first question, mid-check, the gate) the system handles it.
  const backTarget: StepId | null = gateVisible || assessDone
    ? null
    : step === 'check' ? (assessIdx === 0 ? prevStep('check') : null) : prevStep(step)
  const backTargetRef = useRef(backTarget)
  backTargetRef.current = backTarget
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const to = backTargetRef.current
      if (!to) return false
      setStep(to)
      return true
    })
    return () => sub.remove()
  }, [])

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
                  onPress={leaveOnboarding}
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

  if (step === 'consent') {
    const reason = consentFormReason(consentForm)
    return (
      <StepShell
        step="consent"
        title="Before we start"
        description="Tell us your age and confirm you have read how we handle your information. You can read both first."
        primaryLabel="Continue"
        onPrimary={continueFromConsent}
        primaryDisabled={!!reason}
        primaryHint={reason ?? undefined}
      >
        <ConsentControls value={consentForm} onChange={setConsentForm} />
      </StepShell>
    )
  }

  if (step === 'about') {
    return (
      <StepShell
        step="about"
        title="Tell us about you"
        description="Your name stays on this phone, and in your backup if you sign in. We pace your study plan to your grade."
        onBack={() => go(prevStep('about'))}
        primaryLabel="Continue"
        onPrimary={continueFromAbout}
        primaryDisabled={!fullName.trim() || !gradeLevel}
      >
        <View style={{ gap: spacing.xl }}>
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
            returnKeyType="done"
            autoFocus={Platform.OS === 'web'}
          />
          <View style={{ gap: spacing.sm }}>
            <Text style={textStyle('label', t.textPrimary)} maxFontSizeMultiplier={2}>
              Grade (Philippine K-12)
            </Text>
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
          </View>
        </View>
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
