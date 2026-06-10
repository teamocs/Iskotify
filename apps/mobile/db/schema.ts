import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core'

export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  subjectId: text('subject_id').notNull(),
  status: text('status').notNull(),
}, (t) => [
  index('topics_subject_id_idx').on(t.subjectId),
])

export const flashcards = sqliteTable('flashcards', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  explanation: text('explanation').notNull(),
  listingSlugs: text('listing_slugs').notNull().default('[]'),
  options: text('options').notNull().default('[]'),
  correctAnswerIndex: integer('correct_answer_index'),
  remoteUpdatedAt: integer('remote_updated_at'),
  aiOptions: text('ai_options'),
  aiCorrectIndex: integer('ai_correct_index'),
  aiExplanation: text('ai_explanation'),
  aiEnhancedAt: integer('ai_enhanced_at'),
}, (t) => [
  index('flashcards_topic_id_idx').on(t.topicId),
])

export const listings = sqliteTable('listings', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  examDate: integer('exam_date'),
  region: text('region').notNull().default(''),
  description: text('description').notNull().default(''),
  requirements: text('requirements').notNull().default('[]'),
  coverage: text('coverage').notNull().default(''),
  provider: text('provider').notNull().default(''),
  externalUrl: text('external_url').notNull().default(''),
  deadline: integer('deadline'),
  grantAmount: text('grant_amount').notNull().default(''),
  province: text('province'),
  city: text('city'),
  scope: text('scope').notNull().default('national'),
  isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
  incomeCeiling: integer('income_ceiling'),
  gwaRequirement: integer('gwa_requirement'),
  monthlyStipend: integer('monthly_stipend'),
  serviceObligationYears: integer('service_obligation_years'),
  hasEntranceExam: integer('has_entrance_exam', { mode: 'boolean' }).notNull().default(false),
  applicationWindow: text('application_window'),
  scholarshipMeta: text('scholarship_meta').notNull().default('{}'),
  resultsDate: integer('results_date'),
  // JSON array of course-cluster names this listing is open to, or ["all"]. Joins to
  // a student's target course via that course's career_courses.cluster.
  targetCourses: text('target_courses').notNull().default('[]'),
}, (t) => [
  index('listings_slug_idx').on(t.slug),
])

export const savedListings = sqliteTable('saved_listings', {
  id: text('id').primaryKey(),
  savedAt: integer('saved_at').notNull(),
})

export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey(),
  selectedListingSlug: text('selected_listing_slug').notNull().default(''),
  lastSyncedAt: integer('last_synced_at').notNull().default(0),
  fullName: text('full_name').notNull().default(''),
  school: text('school').notNull().default(''),
  gradeLevel: integer('grade_level'),
  googleId: text('google_id'),
  email: text('email'),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
  theme: text('theme').notNull().default('system'),
  focusModeEnabled: integer('focus_mode_enabled', { mode: 'boolean' }).notNull().default(true),
  googleCalendarConnected: integer('google_calendar_connected', { mode: 'boolean' }).notNull().default(false),
  incomeBracket: text('income_bracket'),
  gwa: real('gwa'),
  province: text('province'),
  city: text('city'),
  hsGwaG8: real('hs_gwa_g8'),
  hsGwaG9: real('hs_gwa_g9'),
  hsGwaG10: real('hs_gwa_g10'),
  hsGwaG11: real('hs_gwa_g11'),
  schoolType: text('school_type'),
  isIndigenous: integer('is_indigenous', { mode: 'boolean' }).notNull().default(false),
  targetCampus: text('target_campus'),
  scoreDisclaimerAck: integer('score_disclaimer_ack', { mode: 'boolean' }).notNull().default(false),
  // Onboarding "Target University Exams" / "Target Courses" picks (JSON arrays as text).
  targetExams: text('target_exams').notNull().default('[]'),
  targetCourses: text('target_courses').notNull().default('[]'),
  // Canonical region of the user's entered school, used to order target exams.
  schoolRegion: text('school_region').notNull().default(''),
})

export const userProgress = sqliteTable('user_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  flashcardId: text('flashcard_id').notNull(),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
  answeredAt: integer('answered_at').notNull(),
}, (t) => [
  index('user_progress_flashcard_id_idx').on(t.flashcardId),
])

export const savedDecks = sqliteTable('saved_decks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  topicIds: text('topic_ids').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
})

export const focusListings = sqliteTable('focus_listings', {
  listingSlug: text('listing_slug').primaryKey(),
  priority:    integer('priority').notNull(),
  addedAt:     integer('added_at').notNull(),
})

export const practiceSessions = sqliteTable('practice_sessions', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  listingSlug:  text('listing_slug').notNull().default(''),
  topicId:      text('topic_id').notNull().default(''),
  deckId:       text('deck_id').notNull().default(''),
  score:        integer('score').notNull().default(0),
  total:        integer('total').notNull().default(0),
  durationSecs: integer('duration_secs').notNull().default(0),
  completedAt:  integer('completed_at').notNull(),
  subtest:      text('subtest'),
})

export const coachPhrases = sqliteTable('coach_phrases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),
  text: text('text').notNull(),
  generatedAt: integer('generated_at').notNull(),
  contextHash: text('context_hash').notNull(),
  consumed: integer('consumed', { mode: 'boolean' }).notNull().default(false),
}, t => [
  index('coach_phrases_consumed_idx').on(t.consumed, t.generatedAt),
])

export const userRequirements = sqliteTable('user_requirements', {
  listingSlug: text('listing_slug').notNull(),
  requirementIndex: integer('requirement_index').notNull(),
  acquiredAt: integer('acquired_at').notNull(),
}, t => [
  primaryKey({ columns: [t.listingSlug, t.requirementIndex] }),
])

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  role: text('role').notNull(),
  text: text('text').notNull(),
  mode: text('mode').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [
  index('chat_messages_created_at_idx').on(t.createdAt),
])

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default(''),
  type: text('type').notNull().default('text'),
  color: text('color'),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  isTrashed: integer('is_trashed', { mode: 'boolean' }).notNull().default(false),
  trashedAt: integer('trashed_at'),
  reminderAt: integer('reminder_at'),
  googleEventId: text('google_event_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('notes_updated_at_idx').on(t.updatedAt),
  index('notes_archived_idx').on(t.isArchived),
  index('notes_trashed_idx').on(t.isTrashed),
])

export const noteLabels = sqliteTable('note_labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at').notNull(),
})

export const noteLabelAssignments = sqliteTable('note_label_assignments', {
  noteId: text('note_id').notNull(),
  labelId: text('label_id').notNull(),
}, (t) => [
  primaryKey({ columns: [t.noteId, t.labelId] }),
  index('note_label_assignments_note_idx').on(t.noteId),
])

export const upcatPassages = sqliteTable('upcat_passages', {
  setId: text('set_id').primaryKey(),
  subtest: text('subtest').notNull(),
  passageText: text('passage_text').notNull(),
})

export const upcatQuestions = sqliteTable('upcat_questions', {
  questionId: text('question_id').primaryKey(),
  subtest: text('subtest').notNull(),
  mainSubject: text('main_subject'),
  topic: text('topic'),
  subtopic: text('subtopic'),
  questionFormat: text('question_format'),
  cognitiveLevel: text('cognitive_level'),
  difficulty: text('difficulty'),
  curriculumAlignment: text('curriculum_alignment'),
  questionText: text('question_text').notNull(),
  options: text('options').notNull().default('[]'),
  correctIndex: integer('correct_index').notNull(),
  explanation: text('explanation').notNull(),
  setId: text('set_id'),
  setPosition: integer('set_position'),
  hasVisual: integer('has_visual', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('published'),
  skillCategory: text('skill_category'),
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [
  index('upcat_questions_subtest_idx').on(t.subtest),
  index('upcat_questions_set_idx').on(t.setId),
])

export const upcatFacts = sqliteTable('upcat_facts', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  source: text('source'),
  validYear: integer('valid_year'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const questionFeedback = sqliteTable('question_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardId: text('card_id').notNull(),
  reason: text('reason').notNull().default(''),
  createdAt: integer('created_at').notNull(),
})

export const upcatCutoffs = sqliteTable('upcat_cutoffs', {
  id: text('id').primaryKey(),
  campus: text('campus').notNull(),
  program: text('program'),
  cutoff: real('cutoff').notNull(),
  year: integer('year'),
  isEstimate: integer('is_estimate', { mode: 'boolean' }).notNull().default(true),
})

// ── Epic D: Career tables ─────────────────────────────────────────────────────

export const careerCourses = sqliteTable('career_courses', {
  courseId: text('course_id').primaryKey(),
  name: text('name'),
  cluster: text('cluster'),
  careerTag: text('career_tag'),
  demand: text('demand'),
  boardExam: integer('board_exam', { mode: 'boolean' }).notNull().default(false),
  boardExamName: text('board_exam_name'),
  durationYears: real('duration_years'),
  topCountries: text('top_countries').notNull().default('[]'),
  summary: text('summary'),
  studentTip: text('student_tip'),
  aiNote: text('ai_note'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const careerDestinations = sqliteTable('career_destinations', {
  id: text('id').primaryKey(),
  courseId: text('course_id'),
  country: text('country'),
  demandRating: text('demand_rating'),
  salaryMin: real('salary_min'),
  salaryMax: real('salary_max'),
  salaryLocal: text('salary_local'),
  salaryType: text('salary_type'),
  visaPathway: text('visa_pathway'),
  prPathway: text('pr_pathway'),
  credential: text('credential'),
  licensingExam: text('licensing_exam'),
  languageRequired: text('language_required'),
  timelineMonths: integer('timeline_months'),
  programName: text('program_name'),
  specializations: text('specializations').notNull().default('[]'),
  notes: text('notes'),
  saturationWarning: text('saturation_warning'),
  source: text('source'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const careerCountries = sqliteTable('career_countries', {
  code: text('code').primaryKey(),
  name: text('name'),
  region: text('region'),
  immigrationSystem: text('immigration_system'),
  whyDemand: text('why_demand'),
  languageRequired: text('language_required'),
  prPathway: text('pr_pathway'),
  notes: text('notes'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const careerPrograms = sqliteTable('career_programs', {
  id: text('id').primaryKey(),
  name: text('name'),
  countryRegion: text('country_region'),
  coursesCovered: text('courses_covered').notNull().default('[]'),
  managingBody: text('managing_body'),
  slots: text('slots'),
  requirements: text('requirements'),
  immigrationOutcome: text('immigration_outcome'),
  website: text('website'),
  notes: text('notes'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const aiCareerImpact = sqliteTable('ai_career_impact', {
  courseId: text('course_id').primaryKey(),
  courseName: text('course_name'),
  cluster: text('cluster'),
  boardExam: integer('board_exam', { mode: 'boolean' }).notNull().default(false),
  boardExamName: text('board_exam_name'),
  automationRiskLow: integer('automation_risk_low'),
  automationRiskHigh: integer('automation_risk_high'),
  aiSafetyScore: integer('ai_safety_score'),
  aiSafetyLabel: text('ai_safety_label'),
  colorCode: text('color_code'),
  whatAiTakesOver: text('what_ai_takes_over').notNull().default('[]'),
  whatStaysHuman: text('what_stays_human').notNull().default('[]'),
  newJobsEmerging: text('new_jobs_emerging').notNull().default('[]'),
  skillsToDevelop: text('skills_to_develop').notNull().default('[]'),
  careerOutlook2030: text('career_outlook_2030'),
  keyStat: text('key_stat'),
  keySource: text('key_source'),
  keyQuote: text('key_quote'),
  quoteBy: text('quote_by'),
  phAdvantage: text('ph_advantage'),
  phNotes: text('ph_notes'),
  kuyaBawSummary: text('kuya_baw_summary'),
  lastUpdated: text('last_updated'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const careerFacts = sqliteTable('career_facts', {
  id: text('id').primaryKey(),
  courseId: text('course_id'),
  queryType: text('query_type'),
  courseName: text('course_name'),
  quickAnswer: text('quick_answer'),
  keyCaveat: text('key_caveat'),
  pointTo: text('point_to'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

// ── Epic C: University / course tables ───────────────────────────────────────

export const tertiarySchools = sqliteTable('tertiary_schools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  acronym: text('acronym'),
  region: text('region'),
  province: text('province'),
  city: text('city'),
  type: text('type'),
  isSuc: integer('is_suc', { mode: 'boolean' }).notNull().default(false),
  isLuc: integer('is_luc', { mode: 'boolean' }).notNull().default(false),
  depedSchoolId: integer('deped_school_id'),
  rankInProvince: integer('rank_in_province'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const universityProfiles = sqliteTable('university_profiles', {
  schoolId: text('school_id').primaryKey(),
  dataTier: text('data_tier'),
  institutionType: text('institution_type'),
  yearEstablished: text('year_established'),
  knownForCourses: text('known_for_courses').notNull().default('[]'),
  prcTopCourses: text('prc_top_courses').notNull().default('[]'),
  chedCoeCod: text('ched_coe_cod'),
  accreditation: text('accreditation'),
  entranceExamName: text('entrance_exam_name'),
  entranceExamAcronym: text('entrance_exam_acronym'),
  testingCenterType: text('testing_center_type'),
  applicationOpen: text('application_open'),
  applicationClose: text('application_close'),
  examMonth: text('exam_month'),
  estimatedPassingRate: text('estimated_passing_rate'),
  estimatedSlots: text('estimated_slots'),
  tuitionFeeRange: text('tuition_fee_range'),
  freeTuition: integer('free_tuition', { mode: 'boolean' }),
  academicCalendar: text('academic_calendar'),
  coursesOffered: text('courses_offered').notNull().default('[]'),
  scholarshipsOffered: text('scholarships_offered').notNull().default('[]'),
  websiteUrl: text('website_url'),
  applicationPortalUrl: text('application_portal_url'),
  facebookUrl: text('facebook_url'),
  examDifficulty: integer('exam_difficulty'),
  notablePrograms: text('notable_programs').notNull().default('[]'),
  prcStrongBoards: text('prc_strong_boards').notNull().default('[]'),
  notes: text('notes'),
  dataConfidence: text('data_confidence'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const courseSchoolRankings = sqliteTable('course_school_rankings', {
  id: text('id').primaryKey(),
  courseTab: text('course_tab').notNull(),
  courseName: text('course_name'),
  rank: integer('rank'),
  schoolName: text('school_name').notNull(),
  region: text('region'),
  province: text('province'),
  wilsonScore: real('wilson_score'),
  rawPassRate: real('raw_pass_rate'),
  totalExaminees: integer('total_examinees'),
  totalPassers: integer('total_passers'),
  yearsWithData: text('years_with_data'),
  examPeriods: integer('exam_periods'),
  tertiarySchoolId: text('tertiary_school_id'),
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [
  index('course_school_rankings_tab_idx').on(t.courseTab),
])

export const courseSchoolQuality = sqliteTable('course_school_quality', {
  id: text('id').primaryKey(),
  schoolName: text('school_name').notNull(),
  region: text('region'),
  province: text('province'),
  city: text('city'),
  courseStandardized: text('course_standardized'),
  courseGroup: text('course_group'),
  schoolType: text('school_type'),
  chedCoeCod: text('ched_coe_cod'),
  qualityScore: integer('quality_score'),
  qualityTier: text('quality_tier'),
  accreditations: text('accreditations').notNull().default('[]'),
  hasPrcBoard: integer('has_prc_board', { mode: 'boolean' }),
  qsSubjectRank: text('qs_subject_rank'),
  dataConfidence: text('data_confidence'),
  tertiarySchoolId: text('tertiary_school_id'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const barResults = sqliteTable('bar_results', {
  id: text('id').primaryKey(),
  schoolName: text('school_name').notNull(),
  region: text('region'),
  province: text('province'),
  year: integer('year'),
  passRate: real('pass_rate'),
  nationalAvg: real('national_avg'),
  scRank: integer('sc_rank'),
  notes: text('notes'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const courseTaxonomyMap = sqliteTable('course_taxonomy_map', {
  courseTab: text('course_tab').primaryKey(),
  careerCourseId: text('career_course_id'),
  label: text('label'),
  kind: text('kind'),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const admissionsUpdates = sqliteTable('admissions_updates', {
  id: text('id').primaryKey(), reportDate: text('report_date'), severity: text('severity').notNull(),
  schoolSlug: text('school_slug'), schoolName: text('school_name'), title: text('title').notNull(),
  body: text('body').notNull(), actionRequired: text('action_required'),
  eventDate: text('event_date'), eventType: text('event_type'),
  sources: text('sources').notNull().default('[]'),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const resultWatches = sqliteTable('result_watches', {
  slug: text('slug').primaryKey(), addedAt: integer('added_at').notNull(),
})

// ── Exam Blueprints (data-driven exam mechanics) ─────────────────────────────

export const examSkillCategories = sqliteTable('exam_skill_categories', {
  name: text('name').primaryKey(),
  requiresSpatialLogic: integer('requires_spatial_logic', { mode: 'boolean' }).notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const examBlueprints = sqliteTable('exam_blueprints', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull().default(''),
  acronym: text('acronym').notNull().default(''),
  totalItems: integer('total_items').notNull().default(0),
  totalTimeMinutes: integer('total_time_minutes').notNull().default(0),
  hasGuessingPenalty: integer('has_guessing_penalty', { mode: 'boolean' }).notNull().default(false),
  guessingPenalty: real('guessing_penalty').notNull().default(0.25),
  sectionBlocked: integer('section_blocked', { mode: 'boolean' }).notNull().default(false),
  scoringNote: text('scoring_note').notNull().default(''),
  mechanicsNote: text('mechanics_note').notNull().default(''),
  status: text('status').notNull().default('draft'),
  displayOrder: integer('display_order').notNull().default(0),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const examBlueprintSections = sqliteTable('exam_blueprint_sections', {
  id: text('id').primaryKey(),
  blueprintSlug: text('blueprint_slug').notNull(),
  name: text('name').notNull().default(''),
  skillCategory: text('skill_category').notNull().default(''),
  itemCount: integer('item_count').notNull().default(0),
  timeMinutes: integer('time_minutes'),
  requiresSpatialLogic: integer('requires_spatial_logic', { mode: 'boolean' }).notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [index('exam_blueprint_sections_slug_idx').on(t.blueprintSlug)])

export const examCourseNotes = sqliteTable('exam_course_notes', {
  id: text('id').primaryKey(),
  blueprintSlug: text('blueprint_slug').notNull(),
  courseCluster: text('course_cluster').notNull().default('all'),
  note: text('note').notNull().default(''),
  minPercentile: integer('min_percentile'),
  displayOrder: integer('display_order').notNull().default(0),
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [index('exam_course_notes_slug_idx').on(t.blueprintSlug)])
