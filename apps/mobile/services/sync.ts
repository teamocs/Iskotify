import { eq, asc } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import {
  subjects, topics, flashcards, listings, userSettings,
  focusListings, savedListings, savedDecks, userProgress, practiceSessions,
  notes as notesTable, noteLabels, noteLabelAssignments,
  upcatPassages, upcatQuestions, upcatFacts, upcatCutoffs,
  careerCourses, careerDestinations, careerCountries, careerPrograms,
  aiCareerImpact, careerFacts,
  tertiarySchools, universityProfiles, courseSchoolRankings,
  courseSchoolQuality, barResults, courseTaxonomyMap,
  admissionsUpdates,
} from '../db/schema'
import { supabase } from './supabase'

export async function syncPrimaryListing(db: DrizzleClient): Promise<void> {
  const rows = await db
    .select({ listingSlug: focusListings.listingSlug })
    .from(focusListings)
    .orderBy(asc(focusListings.priority))
    .limit(1)
  const slug = rows[0]?.listingSlug ?? ''
  await db.update(userSettings)
    .set({ selectedListingSlug: slug })
    .where(eq(userSettings.id, 1))
}

// Push local user data to Supabase for backup (requires signed-in session)
export async function pushUserData(db: DrizzleClient): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const [focus, saved, decks, progress, sessions, settings, noteRows, labelRows, assignRows] = await Promise.all([
    db.select().from(focusListings),
    db.select().from(savedListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
    db.select().from(notesTable),
    db.select().from(noteLabels),
    db.select().from(noteLabelAssignments),
  ])

  await supabase.from('user_app_data').upsert({
    user_id: user.id,
    focus_listings: focus,
    saved_listings: saved,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
    settings: settings[0] ?? {},
    notes: noteRows,
    note_labels: labelRows,
    note_label_assignments: assignRows,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

// Pull user data from Supabase and restore into local DB
export async function pullUserData(db: DrizzleClient): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('user_app_data')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (error || !data) return

  await db.transaction((tx) => {
    // Restore focus listings (upsert by listingSlug)
    const remoteF: typeof focusListings.$inferInsert[] = data.focus_listings ?? []
    for (const row of remoteF) {
      tx.insert(focusListings)
        .values(row)
        .onConflictDoUpdate({
          target: focusListings.listingSlug,
          set: { priority: row.priority, addedAt: row.addedAt },
        })
        .run()
    }

    // Restore saved listings (upsert by id)
    const remoteS: typeof savedListings.$inferInsert[] = data.saved_listings ?? []
    for (const row of remoteS) {
      tx.insert(savedListings)
        .values(row)
        .onConflictDoUpdate({ target: savedListings.id, set: { savedAt: row.savedAt } })
        .run()
    }

    // Restore saved decks (upsert by id)
    const remoteD: typeof savedDecks.$inferInsert[] = data.saved_decks ?? []
    for (const row of remoteD) {
      tx.insert(savedDecks)
        .values(row)
        .onConflictDoUpdate({
          target: savedDecks.id,
          set: { name: row.name, topicIds: row.topicIds },
        })
        .run()
    }

    // Restore practice sessions — Supabase is source of truth at sign-in time
    const remoteSessions: typeof practiceSessions.$inferInsert[] = data.practice_sessions ?? []
    if (remoteSessions.length > 0) {
      tx.delete(practiceSessions).run()
      for (const row of remoteSessions) {
        tx.insert(practiceSessions).values(row).run()
      }
    }

    // Restore user progress (same wipe-and-restore approach)
    const remoteProgress: typeof userProgress.$inferInsert[] = data.user_progress ?? []
    if (remoteProgress.length > 0) {
      tx.delete(userProgress).run()
      for (const row of remoteProgress) {
        tx.insert(userProgress).values(row).run()
      }
    }

    // Restore full settings row (all writeable fields, not just profile)
    const remoteSettings = data.settings as Partial<typeof userSettings.$inferInsert> | null
    if (remoteSettings) {
      const settingsValues = {
        id: 1,
        googleId: remoteSettings.googleId ?? '',
        email: remoteSettings.email ?? '',
        fullName: remoteSettings.fullName ?? '',
        school: remoteSettings.school ?? '',
        gradeLevel: remoteSettings.gradeLevel ?? null,
        selectedListingSlug: remoteSettings.selectedListingSlug ?? '',
        lastSyncedAt: 0,  // force catalog re-sync on next launch
        notificationsEnabled: remoteSettings.notificationsEnabled ?? true,
        theme: remoteSettings.theme ?? 'system',
        focusModeEnabled: remoteSettings.focusModeEnabled ?? true,
        targetExams: remoteSettings.targetExams ?? '[]',
        targetCourses: remoteSettings.targetCourses ?? '[]',
        schoolRegion: remoteSettings.schoolRegion ?? '',
      }
      tx.insert(userSettings)
        .values(settingsValues)
        .onConflictDoUpdate({ target: userSettings.id, set: settingsValues })
        .run()
    }

    // Restore notes — wipe and restore (guard matches practice_sessions/user_progress pattern)
    const remoteNotes: typeof notesTable.$inferInsert[] = data.notes ?? []
    if (remoteNotes.length > 0) {
      tx.delete(noteLabelAssignments).run()
      tx.delete(notesTable).run()
      for (const row of remoteNotes) {
        tx.insert(notesTable).values(row).onConflictDoNothing().run()
      }
    }

    // Restore note labels
    const remoteLabels: typeof noteLabels.$inferInsert[] = data.note_labels ?? []
    if (remoteLabels.length > 0) {
      tx.delete(noteLabels).run()
      for (const row of remoteLabels) {
        tx.insert(noteLabels).values(row).onConflictDoNothing().run()
      }
    }

    // Restore note label assignments
    const remoteAssigns: typeof noteLabelAssignments.$inferInsert[] = data.note_label_assignments ?? []
    for (const row of remoteAssigns) {
      tx.insert(noteLabelAssignments).values(row).onConflictDoNothing().run()
    }
  })
}

export async function syncOnLaunch(db: DrizzleClient): Promise<void> {
  try {
    const [settingsRows, focusRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
      db.select().from(focusListings).orderBy(asc(focusListings.priority)),
    ])
    const settings = settingsRows[0]
    if (!settings) return

    let slugs = focusRows.map(r => r.listingSlug)
    if (slugs.length === 0 && settings.selectedListingSlug) slugs = [settings.selectedListingSlug]
    if (slugs.length === 0) return

    const since = settings.lastSyncedAt === 0
      ? '1970-01-01T00:00:00.000Z'
      : new Date(settings.lastSyncedAt).toISOString()

    const [listingsRes, subjectsRes, topicsRes, admissionsUpdatesRes] = await Promise.all([
      supabase.from('listings')
        .select('id,slug,title,type,status,exam_date,region,description,requirements,coverage,provider,external_url,deadline,grant_amount,province,city,scope,is_verified,income_ceiling,gwa_requirement,monthly_stipend,service_obligation_years,has_entrance_exam,application_window,scholarship_meta,results_date')
        .gt('updated_at', since),
      supabase.from('flashcard_subjects').select('id,name').gt('updated_at', since),
      supabase.from('flashcard_topics').select('id,name,subject_id,status').gt('updated_at', since),
      supabase.from('admissions_updates')
        .select('id,report_date,severity,school_slug,school_name,title,body,action_required,event_date,event_type,sources,verified,updated_at')
        .gt('updated_at', since),
    ])

    const [upcatPassagesRes, upcatQuestionsRes, upcatFactsRes, upcatCutoffsRes] = await Promise.all([
      // Full pull: upcat_passages has no updated_at cursor (immutable reference data, ~23 rows). TODO: add updated_at + incremental cursor if passage volume grows across exam years.
      supabase.from('upcat_passages').select('set_id,subtest,passage_text'),
      supabase.from('upcat_questions')
        .select('question_id,subtest,main_subject,topic,subtopic,question_format,cognitive_level,difficulty,curriculum_alignment,question_text,options,correct_index,explanation,set_id,set_position,has_visual,status,updated_at')
        .eq('status', 'published')
        .gt('updated_at', since),
      supabase.from('upcat_facts')
        .select('id,topic,question,answer,source,valid_year,updated_at')
        .gt('updated_at', since),
      // Full pull: small reference table, no cursor needed
      supabase.from('upcat_cutoffs').select('id,campus,program,cutoff,year,is_estimate'),
    ])

    // ── Epic D: Career tables ────────────────────────────────────────────────
    // Full pull for reference tables (no cursor); incremental for destinations + facts
    const [
      careerCoursesRes, careerCountriesRes, careerProgramsRes, aiCareerImpactRes,
      careerDestinationsRes, careerFactsRes,
    ] = await Promise.all([
      supabase.from('career_courses')
        .select('course_id,name,cluster,career_tag,demand,board_exam,board_exam_name,duration_years,top_countries,summary,student_tip,ai_note'),
      supabase.from('career_countries')
        .select('code,name,region,immigration_system,why_demand,language_required,pr_pathway,notes'),
      supabase.from('career_programs')
        .select('id,name,country_region,courses_covered,managing_body,slots,requirements,immigration_outcome,website,notes'),
      supabase.from('ai_career_impact')
        .select('course_id,course_name,cluster,board_exam,board_exam_name,automation_risk_low,automation_risk_high,ai_safety_score,ai_safety_label,color_code,what_ai_takes_over,what_stays_human,new_jobs_emerging,skills_to_develop,career_outlook_2030,key_stat,key_source,key_quote,quote_by,ph_advantage,ph_notes,kuya_baw_summary,last_updated'),
      supabase.from('career_destinations')
        .select('id,course_id,country,demand_rating,salary_min,salary_max,salary_local,salary_type,visa_pathway,pr_pathway,credential,licensing_exam,language_required,timeline_months,program_name,specializations,notes,saturation_warning,source,updated_at')
        .gt('updated_at', since),
      supabase.from('career_facts')
        .select('id,course_id,query_type,course_name,quick_answer,key_caveat,point_to,updated_at')
        .gt('updated_at', since),
    ])

    // ── Epic C: University / course tables ───────────────────────────────────
    // Full pull for all 6 (static/slow-changing reference data)
    const [
      tertiarySchoolsRes, universityProfilesRes, courseSchoolRankingsRes,
      courseSchoolQualityRes, barResultsRes, courseTaxonomyMapRes,
    ] = await Promise.all([
      supabase.from('tertiary_schools')
        .select('id,name,acronym,region,province,city,type,is_suc,is_luc,deped_school_id,rank_in_province,updated_at'),
      supabase.from('university_profiles')
        .select('school_id,data_tier,institution_type,year_established,known_for_courses,prc_top_courses,ched_coe_cod,accreditation,entrance_exam_name,entrance_exam_acronym,testing_center_type,application_open,application_close,exam_month,estimated_passing_rate,estimated_slots,tuition_fee_range,free_tuition,academic_calendar,courses_offered,scholarships_offered,website_url,application_portal_url,facebook_url,exam_difficulty,notable_programs,prc_strong_boards,notes,data_confidence,updated_at'),
      supabase.from('course_school_rankings')
        .select('id,course_tab,course_name,rank,school_name,region,province,wilson_score,raw_pass_rate,total_examinees,total_passers,years_with_data,exam_periods,tertiary_school_id,updated_at'),
      supabase.from('course_school_quality')
        .select('id,school_name,region,province,city,course_standardized,course_group,school_type,ched_coe_cod,quality_score,quality_tier,accreditations,has_prc_board,qs_subject_rank,data_confidence,tertiary_school_id,updated_at'),
      supabase.from('bar_results')
        .select('id,school_name,region,province,year,pass_rate,national_avg,sc_rank,notes,updated_at'),
      supabase.from('course_taxonomy_map')
        .select('course_tab,career_course_id,label,kind,updated_at'),
    ])

    const cardResults = await Promise.all(
      slugs.map(slug =>
        supabase.from('flashcards')
          .select('id,topic_id,question,answer,explanation,listing_slugs,options,correct_answer_index,ai_options,ai_correct_index,ai_explanation,ai_enhanced_at,updated_at')
          .contains('listing_slugs', [slug])
          .eq('status', 'published')
          .gt('updated_at', since)
      )
    )

    const seen = new Set<string>()
    const allCards = cardResults.flatMap(r => r.data ?? []).filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id); return true
    })

    await db.transaction((tx) => {
      for (const row of (listingsRes.data ?? [])) {
        const examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        const deadline = row.deadline ? new Date(row.deadline).getTime() : null
        const vals = {
          id: row.id, slug: row.slug, title: row.title, type: row.type, status: row.status,
          examDate, region: row.region ?? '', description: row.description ?? '',
          requirements: JSON.stringify(row.requirements ?? []), coverage: row.coverage ?? '',
          provider: row.provider ?? '', externalUrl: row.external_url ?? '', deadline,
          grantAmount: row.grant_amount != null ? String(row.grant_amount) : '',
          province: row.province ?? null,
          city: row.city ?? null,
          scope: row.scope ?? 'national',
          isVerified: !!row.is_verified,
          incomeCeiling: row.income_ceiling ?? null,
          gwaRequirement: row.gwa_requirement ?? null,
          monthlyStipend: row.monthly_stipend ?? null,
          serviceObligationYears: row.service_obligation_years ?? null,
          hasEntranceExam: !!row.has_entrance_exam,
          applicationWindow: row.application_window ?? null,
          scholarshipMeta: JSON.stringify(row.scholarship_meta ?? {}),
          resultsDate: row.results_date ? new Date(row.results_date).getTime() : null,
        }
        tx.insert(listings).values(vals).onConflictDoUpdate({ target: listings.id, set: vals }).run()
      }

      for (const row of (admissionsUpdatesRes.data ?? [])) {
        const vals = {
          id: row.id,
          reportDate: row.report_date ?? null,
          severity: row.severity,
          schoolSlug: row.school_slug ?? null,
          schoolName: row.school_name ?? null,
          title: row.title,
          body: row.body,
          actionRequired: row.action_required ?? null,
          eventDate: row.event_date ?? null,
          eventType: row.event_type ?? null,
          sources: JSON.stringify(row.sources ?? []),
          verified: !!row.verified,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(admissionsUpdates).values(vals).onConflictDoUpdate({ target: admissionsUpdates.id, set: vals }).run()
      }

      for (const row of (subjectsRes.data ?? [])) {
        tx.insert(subjects).values({ id: row.id, name: row.name })
          .onConflictDoUpdate({ target: subjects.id, set: { name: row.name } }).run()
      }

      for (const row of (topicsRes.data ?? [])) {
        tx.insert(topics)
          .values({ id: row.id, name: row.name, subjectId: row.subject_id, status: row.status })
          .onConflictDoUpdate({ target: topics.id, set: { name: row.name, subjectId: row.subject_id, status: row.status } })
          .run()
      }

      for (const row of allCards) {
        const remoteUpdatedAt = new Date(row.updated_at).getTime()
        const baseVals = {
          id: row.id, topicId: row.topic_id, question: row.question, answer: row.answer,
          explanation: row.explanation,
          listingSlugs: JSON.stringify(row.listing_slugs ?? []),
          options: JSON.stringify(row.options ?? []),
          correctAnswerIndex: row.correct_answer_index ?? null,
          remoteUpdatedAt,
        }

        // Only include ai_* fields when Supabase actually has them. This preserves
        // local Gemma work when Supabase hasn't been enhanced yet (fixes the
        // sync-wipe bug where every re-sync used to null these out).
        const r = row as any
        const aiVals = r.ai_enhanced_at
          ? {
              aiOptions: r.ai_options ? JSON.stringify(r.ai_options) : null,
              aiCorrectIndex: r.ai_correct_index ?? null,
              aiExplanation: r.ai_explanation ?? null,
              aiEnhancedAt: new Date(r.ai_enhanced_at).getTime(),
            }
          : {}

        const vals = { ...baseVals, ...aiVals }
        tx.insert(flashcards).values(vals).onConflictDoUpdate({
          target: flashcards.id,
          set: vals,  // ai_* only included when Supabase had them
        }).run()
      }

      for (const row of (upcatPassagesRes.data ?? [])) {
        const vals = { setId: row.set_id, subtest: row.subtest, passageText: row.passage_text }
        tx.insert(upcatPassages).values(vals).onConflictDoUpdate({ target: upcatPassages.setId, set: vals }).run()
      }

      for (const row of (upcatQuestionsRes.data ?? [])) {
        const vals = {
          questionId: row.question_id, subtest: row.subtest,
          mainSubject: row.main_subject ?? null, topic: row.topic ?? null, subtopic: row.subtopic ?? null,
          questionFormat: row.question_format ?? null, cognitiveLevel: row.cognitive_level ?? null,
          difficulty: row.difficulty ?? null, curriculumAlignment: row.curriculum_alignment ?? null,
          questionText: row.question_text,
          options: JSON.stringify(row.options ?? []),
          correctIndex: row.correct_index, explanation: row.explanation,
          setId: row.set_id ?? null, setPosition: row.set_position ?? null,
          hasVisual: !!row.has_visual, status: row.status,
          remoteUpdatedAt: new Date(row.updated_at).getTime(),
        }
        tx.insert(upcatQuestions).values(vals).onConflictDoUpdate({ target: upcatQuestions.questionId, set: vals }).run()
      }

      for (const row of (upcatFactsRes.data ?? [])) {
        const vals = {
          id: row.id, topic: row.topic, question: row.question, answer: row.answer,
          source: row.source ?? null, validYear: row.valid_year ?? null,
          remoteUpdatedAt: new Date(row.updated_at).getTime(),
        }
        tx.insert(upcatFacts).values(vals).onConflictDoUpdate({ target: upcatFacts.id, set: vals }).run()
      }

      for (const row of (upcatCutoffsRes.data ?? [])) {
        const vals = {
          id: row.id, campus: row.campus, program: row.program ?? null,
          cutoff: row.cutoff, year: row.year ?? null, isEstimate: !!row.is_estimate,
        }
        tx.insert(upcatCutoffs).values(vals).onConflictDoUpdate({ target: upcatCutoffs.id, set: vals }).run()
      }

      // ── Epic D: Career upserts ─────────────────────────────────────────────
      for (const row of (careerCoursesRes.data ?? [])) {
        const vals = {
          courseId: row.course_id, name: row.name ?? null, cluster: row.cluster ?? null,
          careerTag: row.career_tag ?? null, demand: row.demand ?? null,
          boardExam: !!row.board_exam, boardExamName: row.board_exam_name ?? null,
          durationYears: row.duration_years ?? null,
          topCountries: JSON.stringify(row.top_countries ?? []),
          summary: row.summary ?? null, studentTip: row.student_tip ?? null,
          aiNote: row.ai_note ?? null,
          remoteUpdatedAt: null, // full-pull (no cursor); remoteUpdatedAt unused for these — populate if incremental pull is added
        }
        tx.insert(careerCourses).values(vals).onConflictDoUpdate({ target: careerCourses.courseId, set: vals }).run()
      }

      for (const row of (careerCountriesRes.data ?? [])) {
        const vals = {
          code: row.code, name: row.name ?? null, region: row.region ?? null,
          immigrationSystem: row.immigration_system ?? null, whyDemand: row.why_demand ?? null,
          languageRequired: row.language_required ?? null, prPathway: row.pr_pathway ?? null,
          notes: row.notes ?? null,
          remoteUpdatedAt: null, // full-pull (no cursor); remoteUpdatedAt unused for these — populate if incremental pull is added
        }
        tx.insert(careerCountries).values(vals).onConflictDoUpdate({ target: careerCountries.code, set: vals }).run()
      }

      for (const row of (careerProgramsRes.data ?? [])) {
        const vals = {
          id: row.id, name: row.name ?? null, countryRegion: row.country_region ?? null,
          coursesCovered: JSON.stringify(row.courses_covered ?? []),
          managingBody: row.managing_body ?? null, slots: row.slots ?? null,
          requirements: row.requirements ?? null, immigrationOutcome: row.immigration_outcome ?? null,
          website: row.website ?? null, notes: row.notes ?? null,
          remoteUpdatedAt: null, // full-pull (no cursor); remoteUpdatedAt unused for these — populate if incremental pull is added
        }
        tx.insert(careerPrograms).values(vals).onConflictDoUpdate({ target: careerPrograms.id, set: vals }).run()
      }

      for (const row of (aiCareerImpactRes.data ?? [])) {
        const vals = {
          courseId: row.course_id, courseName: row.course_name ?? null,
          cluster: row.cluster ?? null,
          boardExam: !!row.board_exam, boardExamName: row.board_exam_name ?? null,
          automationRiskLow: row.automation_risk_low ?? null,
          automationRiskHigh: row.automation_risk_high ?? null,
          aiSafetyScore: row.ai_safety_score ?? null, aiSafetyLabel: row.ai_safety_label ?? null,
          colorCode: row.color_code ?? null,
          whatAiTakesOver: JSON.stringify(row.what_ai_takes_over ?? []),
          whatStaysHuman: JSON.stringify(row.what_stays_human ?? []),
          newJobsEmerging: JSON.stringify(row.new_jobs_emerging ?? []),
          skillsToDevelop: JSON.stringify(row.skills_to_develop ?? []),
          careerOutlook2030: row.career_outlook_2030 ?? null,
          keyStat: row.key_stat ?? null, keySource: row.key_source ?? null,
          keyQuote: row.key_quote ?? null, quoteBy: row.quote_by ?? null,
          phAdvantage: row.ph_advantage ?? null, phNotes: row.ph_notes ?? null,
          kuyaBawSummary: row.kuya_baw_summary ?? null, lastUpdated: row.last_updated ?? null,
          remoteUpdatedAt: null, // full-pull (no cursor); remoteUpdatedAt unused for these — populate if incremental pull is added
        }
        tx.insert(aiCareerImpact).values(vals).onConflictDoUpdate({ target: aiCareerImpact.courseId, set: vals }).run()
      }

      for (const row of (careerDestinationsRes.data ?? [])) {
        const vals = {
          id: row.id, courseId: row.course_id ?? null, country: row.country ?? null,
          demandRating: row.demand_rating ?? null,
          salaryMin: row.salary_min ?? null, salaryMax: row.salary_max ?? null,
          salaryLocal: row.salary_local ?? null, salaryType: row.salary_type ?? null,
          visaPathway: row.visa_pathway ?? null, prPathway: row.pr_pathway ?? null,
          credential: row.credential ?? null, licensingExam: row.licensing_exam ?? null,
          languageRequired: row.language_required ?? null,
          timelineMonths: row.timeline_months ?? null,
          programName: row.program_name ?? null,
          specializations: JSON.stringify(row.specializations ?? []),
          notes: row.notes ?? null, saturationWarning: row.saturation_warning ?? null,
          source: row.source ?? null,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(careerDestinations).values(vals).onConflictDoUpdate({ target: careerDestinations.id, set: vals }).run()
      }

      for (const row of (careerFactsRes.data ?? [])) {
        const vals = {
          id: row.id, courseId: row.course_id ?? null, queryType: row.query_type ?? null,
          courseName: row.course_name ?? null, quickAnswer: row.quick_answer ?? null,
          keyCaveat: row.key_caveat ?? null, pointTo: row.point_to ?? null,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(careerFacts).values(vals).onConflictDoUpdate({ target: careerFacts.id, set: vals }).run()
      }
      // FTS triggers auto-sync career_facts_fts on each career_facts upsert above.

      // ── Epic C: University / course upserts ───────────────────────────────
      for (const row of (tertiarySchoolsRes.data ?? [])) {
        const vals = {
          id: row.id, name: row.name, acronym: row.acronym ?? null,
          region: row.region ?? null, province: row.province ?? null, city: row.city ?? null,
          type: row.type ?? null,
          isSuc: !!row.is_suc, isLuc: !!row.is_luc,
          depedSchoolId: row.deped_school_id ?? null,
          rankInProvince: row.rank_in_province ?? null,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(tertiarySchools).values(vals).onConflictDoUpdate({ target: tertiarySchools.id, set: vals }).run()
      }

      for (const row of (universityProfilesRes.data ?? [])) {
        const vals = {
          schoolId: row.school_id, dataTier: row.data_tier ?? null,
          institutionType: row.institution_type ?? null, yearEstablished: row.year_established ?? null,
          knownForCourses: JSON.stringify(row.known_for_courses ?? []),
          prcTopCourses: JSON.stringify(row.prc_top_courses ?? []),
          chedCoeCod: row.ched_coe_cod ?? null, accreditation: row.accreditation ?? null,
          entranceExamName: row.entrance_exam_name ?? null, entranceExamAcronym: row.entrance_exam_acronym ?? null,
          testingCenterType: row.testing_center_type ?? null,
          applicationOpen: row.application_open ?? null, applicationClose: row.application_close ?? null,
          examMonth: row.exam_month ?? null,
          estimatedPassingRate: row.estimated_passing_rate ?? null, estimatedSlots: row.estimated_slots ?? null,
          tuitionFeeRange: row.tuition_fee_range ?? null,
          freeTuition: row.free_tuition != null ? !!row.free_tuition : null,
          academicCalendar: row.academic_calendar ?? null,
          coursesOffered: JSON.stringify(row.courses_offered ?? []),
          scholarshipsOffered: JSON.stringify(row.scholarships_offered ?? []),
          websiteUrl: row.website_url ?? null, applicationPortalUrl: row.application_portal_url ?? null,
          facebookUrl: row.facebook_url ?? null,
          examDifficulty: row.exam_difficulty ?? null,
          notablePrograms: JSON.stringify(row.notable_programs ?? []),
          prcStrongBoards: JSON.stringify(row.prc_strong_boards ?? []),
          notes: row.notes ?? null, dataConfidence: row.data_confidence ?? null,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(universityProfiles).values(vals).onConflictDoUpdate({ target: universityProfiles.schoolId, set: vals }).run()
      }

      for (const row of (courseSchoolRankingsRes.data ?? [])) {
        const vals = {
          id: row.id, courseTab: row.course_tab, courseName: row.course_name ?? null,
          rank: row.rank ?? null, schoolName: row.school_name,
          region: row.region ?? null, province: row.province ?? null,
          wilsonScore: row.wilson_score ?? null, rawPassRate: row.raw_pass_rate ?? null,
          totalExaminees: row.total_examinees ?? null, totalPassers: row.total_passers ?? null,
          yearsWithData: row.years_with_data ?? null, examPeriods: row.exam_periods ?? null,
          tertiarySchoolId: row.tertiary_school_id ?? null,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(courseSchoolRankings).values(vals).onConflictDoUpdate({ target: courseSchoolRankings.id, set: vals }).run()
      }

      for (const row of (courseSchoolQualityRes.data ?? [])) {
        const vals = {
          id: row.id, schoolName: row.school_name,
          region: row.region ?? null, province: row.province ?? null, city: row.city ?? null,
          courseStandardized: row.course_standardized ?? null, courseGroup: row.course_group ?? null,
          schoolType: row.school_type ?? null, chedCoeCod: row.ched_coe_cod ?? null,
          qualityScore: row.quality_score ?? null, qualityTier: row.quality_tier ?? null,
          accreditations: JSON.stringify(row.accreditations ?? []),
          hasPrcBoard: row.has_prc_board != null ? !!row.has_prc_board : null,
          qsSubjectRank: row.qs_subject_rank ?? null, dataConfidence: row.data_confidence ?? null,
          tertiarySchoolId: row.tertiary_school_id ?? null,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(courseSchoolQuality).values(vals).onConflictDoUpdate({ target: courseSchoolQuality.id, set: vals }).run()
      }

      for (const row of (barResultsRes.data ?? [])) {
        const vals = {
          id: row.id, schoolName: row.school_name,
          region: row.region ?? null, province: row.province ?? null,
          year: row.year ?? null,
          passRate: row.pass_rate ?? null, nationalAvg: row.national_avg ?? null,
          scRank: row.sc_rank ?? null, notes: row.notes ?? null,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(barResults).values(vals).onConflictDoUpdate({ target: barResults.id, set: vals }).run()
      }

      for (const row of (courseTaxonomyMapRes.data ?? [])) {
        const vals = {
          courseTab: row.course_tab, careerCourseId: row.career_course_id ?? null,
          label: row.label ?? null, kind: row.kind ?? null,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(courseTaxonomyMap).values(vals).onConflictDoUpdate({ target: courseTaxonomyMap.courseTab, set: vals }).run()
      }

      const syncedAt = Date.now()
      tx.insert(userSettings)
        .values({ id: 1, selectedListingSlug: slugs[0]!, lastSyncedAt: syncedAt })
        .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: syncedAt, selectedListingSlug: slugs[0]! } })
        .run()
    })

    // Also push user data backup if signed in
    await pushUserData(db)
  } catch (err) {
    console.error('[sync] error:', err)
  }
}
