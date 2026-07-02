import { eq, asc } from 'drizzle-orm'
import { invalidate } from './queryCache'
import { scheduleWebPersist } from '../db/webPersist'
import { markSyncStart, markSyncDone, markSyncError } from './syncStatus'
import { isSchoolFocusSlug } from '../utils/focusSlug'

// ── Sync heal ──────────────────────────────────────────────────────────────────
// Bump this when a bug causes devices to miss rows they should have synced.
// Devices with a stored syncRev < SYNC_REV will do a full re-pull on next
// launch (since = epoch), then write syncRev = SYNC_REV into the settings row.
// Reason for rev 1: pre-pagination builds capped Supabase at 1000 rows so up
// to ~253 flashcards never reached devices. The paginated fetch now pulls all
// 1253+. Forcing a full re-pull recovers those missed cards.
// Reason for rev 2: incremental-mirror cutover + status backfill. All catalog
// tables (career, university, blueprint) now use an updated_at cursor instead
// of full-pull, and flashcards gains a local status column. A full re-pull
// baselines all devices with the correct status values.
const SYNC_REV = 2
import type { DrizzleClient } from '../db/client'
import {
  subjects, topics, flashcards, listings, userSettings,
  focusListings, savedDecks, userProgress, practiceSessions,
  userRequirements,
  notes as notesTable, noteLabels, noteLabelAssignments,
  upcatPassages, upcatQuestions, upcatFacts, upcatCutoffs,
  careerCourses, careerDestinations, careerCountries, careerPrograms,
  aiCareerImpact, careerFacts,
  tertiarySchools, universityProfiles, courseSchoolRankings,
  courseSchoolQuality, barResults, courseTaxonomyMap,
  admissionsUpdates,
  examSkillCategories, examBlueprints, examBlueprintSections, examCourseNotes,
  aiChatConfig,
} from '../db/schema'
import { supabase } from './supabase'
import { pushPendingReports } from './questionReports'
import { batchUpsert } from './syncBatch'

// Supabase caps a single SELECT at 1000 rows. For tables that exceed that
// (flashcards, upcat_questions, course_school_rankings) we page with .range()
// until a short page returns, so the FULL set reaches the device instead of a
// silently-truncated first 1000. makeQuery MUST apply a stable .order() so pages
// don't skip/duplicate rows.
async function fetchAllPaginated<T = Record<string, unknown>>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

export async function syncPrimaryListing(db: DrizzleClient): Promise<void> {
  const rows = await db
    .select({ listingSlug: focusListings.listingSlug })
    .from(focusListings)
    .orderBy(asc(focusListings.priority))
    .limit(1)
  const raw = rows[0]?.listingSlug ?? ''
  // selectedListingSlug is consumed app-wide as a CONTENT slug — map a
  // school-level focus ("school:<id>") to its general-practice content slug.
  const slug = raw && isSchoolFocusSlug(raw) ? 'general-cet' : raw
  await db.update(userSettings)
    .set({ selectedListingSlug: slug })
    .where(eq(userSettings.id, 1))
}

// Push local user data to Supabase for backup (requires signed-in session)
export async function pushUserData(db: DrizzleClient): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const [focus, decks, progress, sessions, settings, noteRows, labelRows, assignRows, reqRows] = await Promise.all([
    db.select().from(focusListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
    db.select().from(notesTable),
    db.select().from(noteLabels),
    db.select().from(noteLabelAssignments),
    db.select().from(userRequirements),
  ])

  await supabase.from('user_app_data').upsert({
    user_id: user.id,
    focus_listings: focus,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
    settings: settings[0] ?? {},
    notes: noteRows,
    note_labels: labelRows,
    note_label_assignments: assignRows,
    user_requirements: reqRows,
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

  // 1) CRITICAL — restore settings + focus listings independently and resiliently.
  //    These two gate returning-user detection (skip onboarding), so a bad row in
  //    ANY other section must not roll them back via a shared transaction. Each is
  //    its own autocommit + try/catch, and only known columns are written so an
  //    older backup's extra/changed fields can't cause a "no such column" failure.
  const remoteSettings = data.settings as Partial<typeof userSettings.$inferInsert> | null
  if (remoteSettings) {
    try {
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
      await db.insert(userSettings)
        .values(settingsValues)
        .onConflictDoUpdate({ target: userSettings.id, set: settingsValues })
    } catch (e) {
      console.warn('[sync] settings restore failed:', e)
    }
  }

  const remoteF: typeof focusListings.$inferInsert[] = data.focus_listings ?? []
  for (const row of remoteF) {
    try {
      const vals = { listingSlug: row.listingSlug, priority: row.priority, addedAt: row.addedAt }
      await db.insert(focusListings)
        .values(vals)
        .onConflictDoUpdate({ target: focusListings.listingSlug, set: { priority: vals.priority, addedAt: vals.addedAt } })
    } catch (e) {
      console.warn('[sync] focus restore row failed:', e)
    }
  }

  // 2) BEST-EFFORT — saved items, sessions, progress, notes. A failure here (e.g. an
  //    older backup's row shape) is logged but never blocks sign-in or the critical
  //    settings/focus restore above.
  //    Note: old remote payloads may contain a saved_listings field — it is simply
  //    ignored here (field removed from app). No crash on presence.
  try {
    await db.transaction((tx) => {
      const remoteD: typeof savedDecks.$inferInsert[] = data.saved_decks ?? []
      for (const row of remoteD) {
        tx.insert(savedDecks)
          .values(row)
          .onConflictDoUpdate({ target: savedDecks.id, set: { name: row.name, topicIds: row.topicIds } })
          .run()
      }

      // Practice sessions — Supabase is source of truth at sign-in time (wipe+restore)
      const remoteSessions: typeof practiceSessions.$inferInsert[] = data.practice_sessions ?? []
      if (remoteSessions.length > 0) {
        tx.delete(practiceSessions).run()
        for (const row of remoteSessions) tx.insert(practiceSessions).values(row).run()
      }

      const remoteProgress: typeof userProgress.$inferInsert[] = data.user_progress ?? []
      if (remoteProgress.length > 0) {
        tx.delete(userProgress).run()
        for (const row of remoteProgress) tx.insert(userProgress).values(row).run()
      }

      const remoteNotes: typeof notesTable.$inferInsert[] = data.notes ?? []
      if (remoteNotes.length > 0) {
        tx.delete(noteLabelAssignments).run()
        tx.delete(notesTable).run()
        for (const row of remoteNotes) tx.insert(notesTable).values(row).onConflictDoNothing().run()
      }

      const remoteLabels: typeof noteLabels.$inferInsert[] = data.note_labels ?? []
      if (remoteLabels.length > 0) {
        tx.delete(noteLabels).run()
        for (const row of remoteLabels) tx.insert(noteLabels).values(row).onConflictDoNothing().run()
      }

      const remoteAssigns: typeof noteLabelAssignments.$inferInsert[] = data.note_label_assignments ?? []
      for (const row of remoteAssigns) tx.insert(noteLabelAssignments).values(row).onConflictDoNothing().run()

      // user_requirements (scholarship requirement acquisition). OPTIONAL on pull:
      // older backups predate this field, so `?? []` keeps them restoring fine.
      // Wipe+restore when the server has rows (server is source of truth at sign-in);
      // its own try/catch so a single bad row can't roll back the notes restore above.
      try {
        const remoteReqs: typeof userRequirements.$inferInsert[] = data.user_requirements ?? []
        if (remoteReqs.length > 0) {
          tx.delete(userRequirements).run()
          for (const row of remoteReqs) {
            tx.insert(userRequirements)
              .values({ listingSlug: row.listingSlug, requirementIndex: row.requirementIndex, acquiredAt: row.acquiredAt })
              .onConflictDoNothing()
              .run()
          }
        }
      } catch (e) {
        console.warn('[sync] user_requirements restore failed (non-fatal):', e)
      }
    })
  } catch (e) {
    console.warn('[sync] secondary data restore failed (non-fatal):', e)
  }
}

export async function syncOnLaunch(db: DrizzleClient): Promise<void> {
  markSyncStart()
  try {
    const [settingsRows, focusRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
      db.select().from(focusListings).orderBy(asc(focusListings.priority)),
    ])
    const settings = settingsRows[0]
    if (!settings) return

    let slugs = focusRows.map(r => r.listingSlug)
    if (slugs.length === 0 && settings.selectedListingSlug) slugs = [settings.selectedListingSlug]

    // School-level focus entries ("school:<id>") have no content of their own —
    // no flashcard is tagged with a school pseudo-slug, and every consumer of
    // selectedListingSlug (profile title, recommended topics, chat context)
    // expects a CONTENT slug. Map them to 'general-cet' (the shared general
    // entrance practice) for both the per-slug flashcards pull and the cursor
    // write below; otherwise a school-only-focus user syncs ZERO review cards
    // and their primary slug breaks downstream screens.
    const contentSlugs = [...new Set(slugs.map(s => (isSchoolFocusSlug(s) ? 'general-cet' : s)))]
    // NOTE: we intentionally do NOT early-return when slugs.length === 0.
    // Only the per-slug flashcards pull genuinely needs focus slugs; every
    // catalog table (listings, subjects/topics, upcat, career_*, university/
    // course/taxonomy, blueprints, admissions, ai_chat_config) is public and
    // must ALWAYS mirror so a focus-less session (anonymous web visitor, or a
    // launch that fires before pullUserData restores focus on sign-in) still
    // populates Courses/Destinations. The flashcards pull below is the only
    // step gated on slugs.length > 0.

    const needsHeal = (settings.syncRev ?? 0) < SYNC_REV
    const since = needsHeal || settings.lastSyncedAt === 0
      ? '1970-01-01T00:00:00.000Z'
      : new Date(settings.lastSyncedAt).toISOString()

    const [listingsRes, subjectsRes, topicsRes, admissionsUpdatesRes] = await Promise.all([
      supabase.from('listings')
        .select('id,slug,title,type,status,exam_date,region,description,requirements,coverage,provider,external_url,deadline,grant_amount,province,city,scope,is_verified,income_ceiling,gwa_requirement,monthly_stipend,service_obligation_years,has_entrance_exam,application_window,scholarship_meta,results_date,target_courses')
        .gt('updated_at', since),
      supabase.from('flashcard_subjects').select('id,name').gt('updated_at', since),
      supabase.from('flashcard_topics').select('id,name,subject_id,status').gt('updated_at', since),
      supabase.from('admissions_updates')
        .select('id,report_date,severity,school_slug,school_name,title,body,action_required,event_date,event_type,sources,verified,updated_at')
        .gt('updated_at', since),
    ])

    const [upcatPassagesRes, upcatQuestionsRows, upcatFactsRes, upcatCutoffsRes] = await Promise.all([
      // Full pull: upcat_passages has no updated_at cursor (immutable reference data, ~23 rows). TODO: add updated_at + incremental cursor if passage volume grows across exam years.
      supabase.from('upcat_passages').select('set_id,subtest,passage_text'),
      fetchAllPaginated((from, to) => supabase.from('upcat_questions')
        .select('question_id,subtest,main_subject,topic,subtopic,question_format,cognitive_level,difficulty,curriculum_alignment,question_text,options,correct_index,explanation,set_id,set_position,has_visual,status,skill_category,updated_at')
        .gt('updated_at', since)
        .order('question_id')
        .range(from, to)),
      supabase.from('upcat_facts')
        .select('id,topic,question,answer,source,valid_year,updated_at')
        .gt('updated_at', since),
      supabase.from('upcat_cutoffs').select('id,campus,program,cutoff,year,is_estimate,updated_at')
        .gt('updated_at', since),
    ])

    // ── Epic D: Career tables ────────────────────────────────────────────────
    // All tables now use incremental cursor via updated_at
    const [
      careerCoursesRes, careerCountriesRes, careerProgramsRes, aiCareerImpactRes,
      careerDestinationsRes, careerFactsRes,
    ] = await Promise.all([
      supabase.from('career_courses')
        .select('course_id,name,cluster,career_tag,demand,board_exam,board_exam_name,duration_years,top_countries,summary,student_tip,ai_note,updated_at')
        .gt('updated_at', since),
      supabase.from('career_countries')
        .select('code,name,region,immigration_system,why_demand,language_required,pr_pathway,notes,updated_at')
        .gt('updated_at', since),
      supabase.from('career_programs')
        .select('id,name,country_region,courses_covered,managing_body,slots,requirements,immigration_outcome,website,notes,updated_at')
        .gt('updated_at', since),
      supabase.from('ai_career_impact')
        .select('course_id,course_name,cluster,board_exam,board_exam_name,automation_risk_low,automation_risk_high,ai_safety_score,ai_safety_label,color_code,what_ai_takes_over,what_stays_human,new_jobs_emerging,skills_to_develop,career_outlook_2030,key_stat,key_source,key_quote,quote_by,ph_advantage,ph_notes,kuya_baw_summary,last_updated,updated_at')
        .gt('updated_at', since),
      supabase.from('career_destinations')
        .select('id,course_id,country,demand_rating,salary_min,salary_max,salary_local,salary_type,visa_pathway,pr_pathway,credential,licensing_exam,language_required,timeline_months,program_name,specializations,notes,saturation_warning,source,updated_at')
        .gt('updated_at', since),
      supabase.from('career_facts')
        .select('id,course_id,query_type,course_name,quick_answer,key_caveat,point_to,updated_at')
        .gt('updated_at', since),
    ])

    // ── Epic C: University / course tables ───────────────────────────────────
    // All tables now use incremental cursor via updated_at
    const [
      tertiarySchoolsRes, universityProfilesRes, courseSchoolRankingsRows,
      courseSchoolQualityRes, barResultsRes, courseTaxonomyMapRes,
    ] = await Promise.all([
      supabase.from('tertiary_schools')
        .select('id,name,acronym,region,province,city,type,is_suc,is_luc,deped_school_id,rank_in_province,updated_at')
        .gt('updated_at', since),
      supabase.from('university_profiles')
        .select('school_id,data_tier,institution_type,year_established,known_for_courses,prc_top_courses,ched_coe_cod,accreditation,entrance_exam_name,entrance_exam_acronym,testing_center_type,application_open,application_close,exam_month,estimated_passing_rate,estimated_slots,tuition_fee_range,free_tuition,academic_calendar,courses_offered,scholarships_offered,website_url,application_portal_url,facebook_url,exam_difficulty,notable_programs,prc_strong_boards,notes,data_confidence,updated_at')
        .gt('updated_at', since),
      fetchAllPaginated((from, to) => supabase.from('course_school_rankings')
        .select('id,course_tab,course_name,rank,school_name,region,province,wilson_score,raw_pass_rate,total_examinees,total_passers,years_with_data,exam_periods,tertiary_school_id,updated_at')
        .gt('updated_at', since)
        .order('id')
        .range(from, to)),
      supabase.from('course_school_quality')
        .select('id,school_name,region,province,city,course_standardized,course_group,school_type,ched_coe_cod,quality_score,quality_tier,accreditations,has_prc_board,qs_subject_rank,data_confidence,tertiary_school_id,updated_at')
        .gt('updated_at', since),
      supabase.from('bar_results')
        .select('id,school_name,region,province,year,pass_rate,national_avg,sc_rank,notes,updated_at')
        .gt('updated_at', since),
      supabase.from('course_taxonomy_map')
        .select('course_tab,career_course_id,label,kind,updated_at')
        .gt('updated_at', since),
    ])

    // ── Exam Blueprints (incremental cursor — local readers filter status) ────
    // NOTE: .eq('status','published') removed from blueprints so unpublish propagates.
    // Local readers (examBlueprints.ts getExamBlueprint / listPublishedBlueprintSlugs)
    // already filter status='published' in JS — verified in examBlueprints.ts:22,43.
    const [skillCatRes, blueprintsRes, sectionsRes, courseNotesRes, aiChatConfigRes] = await Promise.all([
      supabase.from('exam_skill_categories').select('name,requires_spatial_logic,display_order,updated_at')
        .gt('updated_at', since),
      supabase.from('exam_blueprints').select('slug,name,acronym,total_items,total_time_minutes,has_guessing_penalty,guessing_penalty,section_blocked,scoring_note,mechanics_note,status,display_order,updated_at')
        .gt('updated_at', since),
      supabase.from('exam_blueprint_sections').select('id,blueprint_slug,name,skill_category,item_count,time_minutes,requires_spatial_logic,display_order,updated_at')
        .gt('updated_at', since),
      supabase.from('exam_course_notes').select('id,blueprint_slug,course_cluster,note,min_percentile,display_order,updated_at')
        .gt('updated_at', since),
      // AI chat config — single row (id=1). incremental: only pull when updated_at changed.
      supabase.from('ai_chat_config')
        .select('id,core_rules_override,scope_block_override,grounding_rule_override,anti_injection_override,progress_addendum_override,topic_addendum_override,math_addendum_override,rag_total_token_budget,rag_per_block_char_cap,rag_blocks_enabled,updated_at')
        .gt('updated_at', since),
    ])

    // Per-slug flashcards pull — the ONLY step that genuinely needs focus slugs.
    // Skipped entirely for focus-less sessions; the catalog above still synced.
    // Uses contentSlugs (school: mapped to general-cet) so school-focus users
    // actually receive their review deck.
    const cardResults = contentSlugs.length === 0 ? [] : await Promise.all(
      contentSlugs.map(slug =>
        fetchAllPaginated((from, to) => supabase.from('flashcards')
          .select('id,topic_id,question,answer,explanation,listing_slugs,options,correct_answer_index,ai_options,ai_correct_index,ai_explanation,ai_enhanced_at,status,updated_at')
          .contains('listing_slugs', [slug])
          .gt('updated_at', since)
          .order('id')
          .range(from, to))
      )
    )

    const seen = new Set<string>()
    const allCards = cardResults.flat().filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id); return true
    })

    // ── Tx 1: listings + admissions_updates ──────────────────────────────────
    // (Cursor write is intentionally LAST so an interrupted sync re-pulls next launch)
    await db.transaction((tx) => {
      batchUpsert(tx, listings, (listingsRes.data ?? []).map((row) => {
        const examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        const deadline = row.deadline ? new Date(row.deadline).getTime() : null
        return {
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
          targetCourses: JSON.stringify(row.target_courses ?? []),
        }
      }), listings.id)

      batchUpsert(tx, admissionsUpdates, (admissionsUpdatesRes.data ?? []).map((row) => ({
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
      })), admissionsUpdates.id)
    })

    // Yield JS thread between transactions so the UI stays responsive
    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 2: subjects + topics + flashcards ──────────────────────────────────
    await db.transaction((tx) => {
      batchUpsert(tx, subjects, (subjectsRes.data ?? []).map((row) => (
        { id: row.id, name: row.name }
      )), subjects.id)

      batchUpsert(tx, topics, (topicsRes.data ?? []).map((row) => (
        { id: row.id, name: row.name, subjectId: row.subject_id, status: row.status }
      )), topics.id)

      // Rows in one multi-row .values() batch must share an identical column
      // set (batchUpsert derives the on-conflict update set from the row keys),
      // so cards are GROUPED by whether Supabase has ai_* fields and upserted
      // as two batches. This preserves the per-row semantics exactly.
      const cardsWithoutAi: (typeof flashcards.$inferInsert)[] = []
      const cardsWithAi: (typeof flashcards.$inferInsert)[] = []
      for (const row of allCards) {
        const remoteUpdatedAt = new Date(row.updated_at).getTime()
        const baseVals = {
          id: row.id, topicId: row.topic_id, question: row.question, answer: row.answer,
          explanation: row.explanation,
          listingSlugs: JSON.stringify(row.listing_slugs ?? []),
          options: JSON.stringify(row.options ?? []),
          correctAnswerIndex: row.correct_answer_index ?? null,
          remoteUpdatedAt,
          // status synced so unpublished cards propagate to device (local readers filter published)
          status: (row as any).status ?? 'published',
        }

        // Only include ai_* fields when Supabase actually has them. This preserves
        // local Gemma work when Supabase hasn't been enhanced yet (fixes the
        // sync-wipe bug where every re-sync used to null these out).
        const r = row as any
        if (r.ai_enhanced_at) {
          cardsWithAi.push({
            ...baseVals,
            aiOptions: r.ai_options ? JSON.stringify(r.ai_options) : null,
            aiCorrectIndex: r.ai_correct_index ?? null,
            aiExplanation: r.ai_explanation ?? null,
            aiEnhancedAt: new Date(r.ai_enhanced_at).getTime(),
          })
        } else {
          cardsWithoutAi.push(baseVals)
        }
      }
      batchUpsert(tx, flashcards, cardsWithoutAi, flashcards.id)  // ai_* untouched on conflict
      batchUpsert(tx, flashcards, cardsWithAi, flashcards.id)     // ai_* overwritten from Supabase
    })

    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 3: upcat passages / questions / facts / cutoffs ────────────────────
    await db.transaction((tx) => {
      batchUpsert(tx, upcatPassages, (upcatPassagesRes.data ?? []).map((row) => (
        { setId: row.set_id, subtest: row.subtest, passageText: row.passage_text }
      )), upcatPassages.setId)

      batchUpsert(tx, upcatQuestions, upcatQuestionsRows.map((row) => ({
        questionId: row.question_id, subtest: row.subtest,
        mainSubject: row.main_subject ?? null, topic: row.topic ?? null, subtopic: row.subtopic ?? null,
        questionFormat: row.question_format ?? null, cognitiveLevel: row.cognitive_level ?? null,
        difficulty: row.difficulty ?? null, curriculumAlignment: row.curriculum_alignment ?? null,
        questionText: row.question_text,
        options: JSON.stringify(row.options ?? []),
        correctIndex: row.correct_index, explanation: row.explanation,
        setId: row.set_id ?? null, setPosition: row.set_position ?? null,
        hasVisual: !!row.has_visual, status: row.status,
        skillCategory: row.skill_category ?? null,
        remoteUpdatedAt: new Date(row.updated_at).getTime(),
      })), upcatQuestions.questionId)

      batchUpsert(tx, upcatFacts, (upcatFactsRes.data ?? []).map((row) => ({
        id: row.id, topic: row.topic, question: row.question, answer: row.answer,
        source: row.source ?? null, validYear: row.valid_year ?? null,
        remoteUpdatedAt: new Date(row.updated_at).getTime(),
      })), upcatFacts.id)

      batchUpsert(tx, upcatCutoffs, (upcatCutoffsRes.data ?? []).map((row) => ({
        id: row.id, campus: row.campus, program: row.program ?? null,
        cutoff: row.cutoff, year: row.year ?? null, isEstimate: !!row.is_estimate,
      })), upcatCutoffs.id)
    })

    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 4: career tables ───────────────────────────────────────────────────
    await db.transaction((tx) => {
      batchUpsert(tx, careerCourses, (careerCoursesRes.data ?? []).map((row) => ({
        courseId: row.course_id, name: row.name ?? null, cluster: row.cluster ?? null,
        careerTag: row.career_tag ?? null, demand: row.demand ?? null,
        boardExam: !!row.board_exam, boardExamName: row.board_exam_name ?? null,
        durationYears: row.duration_years ?? null,
        topCountries: JSON.stringify(row.top_countries ?? []),
        summary: row.summary ?? null, studentTip: row.student_tip ?? null,
        aiNote: row.ai_note ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerCourses.courseId)

      batchUpsert(tx, careerCountries, (careerCountriesRes.data ?? []).map((row) => ({
        code: row.code, name: row.name ?? null, region: row.region ?? null,
        immigrationSystem: row.immigration_system ?? null, whyDemand: row.why_demand ?? null,
        languageRequired: row.language_required ?? null, prPathway: row.pr_pathway ?? null,
        notes: row.notes ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerCountries.code)

      batchUpsert(tx, careerPrograms, (careerProgramsRes.data ?? []).map((row) => ({
        id: row.id, name: row.name ?? null, countryRegion: row.country_region ?? null,
        coursesCovered: JSON.stringify(row.courses_covered ?? []),
        managingBody: row.managing_body ?? null, slots: row.slots ?? null,
        requirements: row.requirements ?? null, immigrationOutcome: row.immigration_outcome ?? null,
        website: row.website ?? null, notes: row.notes ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerPrograms.id)

      batchUpsert(tx, aiCareerImpact, (aiCareerImpactRes.data ?? []).map((row) => ({
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
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), aiCareerImpact.courseId)

      batchUpsert(tx, careerDestinations, (careerDestinationsRes.data ?? []).map((row) => ({
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
      })), careerDestinations.id)

      batchUpsert(tx, careerFacts, (careerFactsRes.data ?? []).map((row) => ({
        id: row.id, courseId: row.course_id ?? null, queryType: row.query_type ?? null,
        courseName: row.course_name ?? null, quickAnswer: row.quick_answer ?? null,
        keyCaveat: row.key_caveat ?? null, pointTo: row.point_to ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), careerFacts.id)
      // FTS triggers auto-sync career_facts_fts on each career_facts upsert above.
    })

    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 5a: university tables (schools + profiles) ─────────────────────────
    // The university mirror is the biggest write of the sync (~727 schools +
    // ~727 wide profile rows + >1000 rankings). It's split across two
    // transactions (5a/5b) with a JS-thread yield between them so the UI stays
    // responsive — drizzle sqlite transaction callbacks are synchronous, so a
    // yield INSIDE one transaction isn't possible.
    await db.transaction((tx) => {
      batchUpsert(tx, tertiarySchools, (tertiarySchoolsRes.data ?? []).map((row) => ({
        id: row.id, name: row.name, acronym: row.acronym ?? null,
        region: row.region ?? null, province: row.province ?? null, city: row.city ?? null,
        type: row.type ?? null,
        isSuc: !!row.is_suc, isLuc: !!row.is_luc,
        depedSchoolId: row.deped_school_id ?? null,
        rankInProvince: row.rank_in_province ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), tertiarySchools.id)

      batchUpsert(tx, universityProfiles, (universityProfilesRes.data ?? []).map((row) => ({
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
      })), universityProfiles.schoolId)
    })

    // Yield JS thread between the two university transactions (see Tx 5a note)
    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 5b: course tables (rankings / quality / bar / taxonomy) ────────────
    await db.transaction((tx) => {
      batchUpsert(tx, courseSchoolRankings, courseSchoolRankingsRows.map((row) => ({
        id: row.id, courseTab: row.course_tab, courseName: row.course_name ?? null,
        rank: row.rank ?? null, schoolName: row.school_name,
        region: row.region ?? null, province: row.province ?? null,
        wilsonScore: row.wilson_score ?? null, rawPassRate: row.raw_pass_rate ?? null,
        totalExaminees: row.total_examinees ?? null, totalPassers: row.total_passers ?? null,
        yearsWithData: row.years_with_data ?? null, examPeriods: row.exam_periods ?? null,
        tertiarySchoolId: row.tertiary_school_id ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), courseSchoolRankings.id)

      batchUpsert(tx, courseSchoolQuality, (courseSchoolQualityRes.data ?? []).map((row) => ({
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
      })), courseSchoolQuality.id)

      batchUpsert(tx, barResults, (barResultsRes.data ?? []).map((row) => ({
        id: row.id, schoolName: row.school_name,
        region: row.region ?? null, province: row.province ?? null,
        year: row.year ?? null,
        passRate: row.pass_rate ?? null, nationalAvg: row.national_avg ?? null,
        scRank: row.sc_rank ?? null, notes: row.notes ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), barResults.id)

      batchUpsert(tx, courseTaxonomyMap, (courseTaxonomyMapRes.data ?? []).map((row) => ({
        courseTab: row.course_tab, careerCourseId: row.career_course_id ?? null,
        label: row.label ?? null, kind: row.kind ?? null,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), courseTaxonomyMap.courseTab)
    })

    await new Promise<void>(r => setTimeout(r, 0))

    // ── Tx 6: blueprints + skill categories + course notes + cursor write ──────
    // Cursor (lastSyncedAt + syncRev) is written LAST so an interrupted sync
    // forces a full re-pull on the next launch.
    await db.transaction((tx) => {
      batchUpsert(tx, examSkillCategories, (skillCatRes.data ?? []).map((row) => (
        { name: row.name, requiresSpatialLogic: !!row.requires_spatial_logic, displayOrder: row.display_order ?? 0, remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null }
      )), examSkillCategories.name)

      batchUpsert(tx, examBlueprints, (blueprintsRes.data ?? []).map((row) => ({
        slug: row.slug, name: row.name, acronym: row.acronym ?? '',
        totalItems: row.total_items ?? 0, totalTimeMinutes: row.total_time_minutes ?? 0,
        hasGuessingPenalty: !!row.has_guessing_penalty, guessingPenalty: row.guessing_penalty ?? 0.25,
        sectionBlocked: !!row.section_blocked, scoringNote: row.scoring_note ?? '', mechanicsNote: row.mechanics_note ?? '',
        status: row.status ?? 'draft', displayOrder: row.display_order ?? 0,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), examBlueprints.slug)

      batchUpsert(tx, examBlueprintSections, (sectionsRes.data ?? []).map((row) => ({
        id: row.id, blueprintSlug: row.blueprint_slug, name: row.name, skillCategory: row.skill_category ?? '',
        itemCount: row.item_count ?? 0, timeMinutes: row.time_minutes ?? null,
        requiresSpatialLogic: !!row.requires_spatial_logic, displayOrder: row.display_order ?? 0,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), examBlueprintSections.id)

      batchUpsert(tx, examCourseNotes, (courseNotesRes.data ?? []).map((row) => ({
        id: row.id, blueprintSlug: row.blueprint_slug, courseCluster: row.course_cluster ?? 'all',
        note: row.note ?? '', minPercentile: row.min_percentile ?? null, displayOrder: row.display_order ?? 0,
        remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), examCourseNotes.id)

      // ── AI Chat Config (single row, id=1) ───────────────────────────────────
      batchUpsert(tx, aiChatConfig, (aiChatConfigRes.data ?? []).map((row) => ({
        id: 1,
        coreRulesOverride:        row.core_rules_override ?? '',
        scopeBlockOverride:       row.scope_block_override ?? '',
        groundingRuleOverride:    row.grounding_rule_override ?? '',
        antiInjectionOverride:    row.anti_injection_override ?? '',
        progressAddendumOverride: row.progress_addendum_override ?? '',
        topicAddendumOverride:    row.topic_addendum_override ?? '',
        mathAddendumOverride:     row.math_addendum_override ?? '',
        ragTotalTokenBudget:      row.rag_total_token_budget ?? 700,
        ragPerBlockCharCap:       row.rag_per_block_char_cap ?? 280,
        // jsonb → store as JSON string on SQLite
        ragBlocksEnabled:         JSON.stringify(row.rag_blocks_enabled ?? {}),
        remoteUpdatedAt:          row.updated_at ? new Date(row.updated_at).getTime() : null,
      })), aiChatConfig.id)

      // Cursor write LAST so an interrupted sync re-pulls next launch.
      // selectedListingSlug is only (re)written when we actually have a slug —
      // a focus-less session must not clobber it with undefined/empty. Uses
      // contentSlugs so a school-only focus stores 'general-cet' (a real
      // content slug) instead of the school pseudo-slug.
      const syncedAt = Date.now()
      if (contentSlugs.length > 0) {
        tx.insert(userSettings)
          .values({ id: 1, selectedListingSlug: contentSlugs[0]!, lastSyncedAt: syncedAt, syncRev: SYNC_REV })
          .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: syncedAt, selectedListingSlug: contentSlugs[0]!, syncRev: SYNC_REV } })
          .run()
      } else {
        tx.insert(userSettings)
          .values({ id: 1, lastSyncedAt: syncedAt, syncRev: SYNC_REV })
          .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: syncedAt, syncRev: SYNC_REV } })
          .run()
      }
    })

    // Invalidate all query caches so screens reflect fresh synced data
    invalidate('')

    // Schedule a web DB persist after sync (no-op on native)
    scheduleWebPersist()

    // Also push user data backup if signed in
    await pushUserData(db)

    // Retry queued question reports (best-effort, fire-and-forget — never
    // blocks launch; pushPendingReports swallows its own errors).
    void pushPendingReports(db)
  } catch (err) {
    console.error('[sync] error:', err)
    // Surface the failure to the UI (SyncErrorBanner) so the user sees a retry
    // affordance instead of silent stale/empty screens.
    markSyncError(err instanceof Error ? err.message : 'Sync failed')
  } finally {
    markSyncDone()
  }
}
