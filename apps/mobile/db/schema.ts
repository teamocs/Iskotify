import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

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
})
