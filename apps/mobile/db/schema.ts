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
  difficulty: integer('difficulty').notNull(),
  listingSlugs: text('listing_slugs').notNull().default('[]'),
  remoteUpdatedAt: integer('remote_updated_at'),
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
}, (t) => [
  index('listings_slug_idx').on(t.slug),
])

export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey(),
  selectedListingSlug: text('selected_listing_slug').notNull().default(''),
  lastSyncedAt: integer('last_synced_at').notNull().default(0),
})

export const userProgress = sqliteTable('user_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  flashcardId: text('flashcard_id').notNull(),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
  answeredAt: integer('answered_at').notNull(),
}, (t) => [
  index('user_progress_flashcard_id_idx').on(t.flashcardId),
])
