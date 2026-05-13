import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { subjects, topics, flashcards, listings, userSettings } from '../db/schema'
import { supabase } from './supabase'

export async function syncOnLaunch(db: DrizzleClient): Promise<void> {
  try {
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    const settings = rows[0]
    if (!settings?.selectedListingSlug) return

    const since = settings.lastSyncedAt === 0
      ? '1970-01-01T00:00:00.000Z'
      : new Date(settings.lastSyncedAt).toISOString()
    const slug = settings.selectedListingSlug

    const [listingsRes, subjectsRes, topicsRes, cardsRes] = await Promise.all([
      supabase.from('listings').select('id,slug,title,type,status,exam_date').gt('updated_at', since),
      supabase.from('flashcard_subjects').select('id,name').gt('updated_at', since),
      supabase.from('flashcard_topics').select('id,name,subject_id,status').gt('updated_at', since),
      supabase.from('flashcards')
        .select('id,topic_id,question,answer,explanation,difficulty,listing_slugs,updated_at')
        .contains('listing_slugs', [slug])
        .eq('status', 'published')
        .gt('updated_at', since),
    ])

    db.transaction((tx) => {
      for (const row of (listingsRes.data ?? [])) {
        const examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        tx.insert(listings)
          .values({ id: row.id, slug: row.slug, title: row.title, type: row.type, status: row.status, examDate })
          .onConflictDoUpdate({
            target: listings.id,
            set: { slug: row.slug, title: row.title, type: row.type, status: row.status, examDate },
          })
          .run()
      }

      for (const row of (subjectsRes.data ?? [])) {
        tx.insert(subjects)
          .values({ id: row.id, name: row.name })
          .onConflictDoUpdate({ target: subjects.id, set: { name: row.name } })
          .run()
      }

      for (const row of (topicsRes.data ?? [])) {
        tx.insert(topics)
          .values({ id: row.id, name: row.name, subjectId: row.subject_id, status: row.status })
          .onConflictDoUpdate({
            target: topics.id,
            set: { name: row.name, subjectId: row.subject_id, status: row.status },
          })
          .run()
      }

      for (const row of (cardsRes.data ?? [])) {
        const remoteUpdatedAt = new Date(row.updated_at).getTime()
        tx.insert(flashcards)
          .values({
            id: row.id,
            topicId: row.topic_id,
            question: row.question,
            answer: row.answer,
            explanation: row.explanation,
            difficulty: row.difficulty,
            listingSlugs: JSON.stringify(row.listing_slugs ?? []),
            remoteUpdatedAt,
          })
          .onConflictDoUpdate({
            target: flashcards.id,
            set: {
              topicId: row.topic_id,
              question: row.question,
              answer: row.answer,
              explanation: row.explanation,
              difficulty: row.difficulty,
              listingSlugs: JSON.stringify(row.listing_slugs ?? []),
              remoteUpdatedAt,
            },
          })
          .run()
      }

      const syncedAt = Date.now()
      tx.insert(userSettings)
        .values({ id: 1, selectedListingSlug: slug, lastSyncedAt: syncedAt })
        .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: syncedAt } })
        .run()
    })
  } catch (err) {
    console.error('[sync] error:', err)
  }
}
