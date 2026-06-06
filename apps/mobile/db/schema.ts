import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core'

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
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [
  index('upcat_questions_subtest_idx').on(t.subtest),
  index('upcat_questions_set_idx').on(t.setId),
])
