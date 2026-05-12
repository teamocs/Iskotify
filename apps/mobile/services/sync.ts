import type { Database, Model } from '@nozbe/watermelondb'
import { supabase } from './supabase'
import type { Subject } from '../db/models/Subject'
import type { Topic } from '../db/models/Topic'
import type { Flashcard } from '../db/models/Flashcard'
import type { Listing } from '../db/models/Listing'
import type { UserSettings } from '../db/models/UserSettings'

async function getOrCreateSettings(db: Database): Promise<UserSettings> {
  const coll = db.get<UserSettings>('user_settings')
  const existing = await coll.find('local').catch(() => null)
  if (existing) return existing
  return db.write(() =>
    coll.create(r => {
      r._raw.id = 'local'
      r.selectedListingSlug = ''
      r.lastSyncedAt = 0
    })
  )
}

export async function syncOnLaunch(db: Database): Promise<void> {
  try {
    const settings = await getOrCreateSettings(db)
    if (!settings.selectedListingSlug) return

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

    const ops: Model[] = []

    for (const row of (listingsRes.data ?? [])) {
      const coll = db.get<Listing>('listings')
      const ex = await coll.find(row.id).catch(() => null)
      if (ex) {
        ops.push(ex.prepareUpdate(r => {
          r.slug = row.slug; r.title = row.title; r.type = row.type
          r.status = row.status
          const t = row.exam_date ? new Date(row.exam_date).getTime() : null
          r.examDate = t !== null && Number.isFinite(t) ? t : null
        }))
      } else {
        ops.push(coll.prepareCreate(r => {
          r._raw.id = row.id
          r.slug = row.slug; r.title = row.title; r.type = row.type
          r.status = row.status
          const t = row.exam_date ? new Date(row.exam_date).getTime() : null
          r.examDate = t !== null && Number.isFinite(t) ? t : null
        }))
      }
    }

    for (const row of (subjectsRes.data ?? [])) {
      const coll = db.get<Subject>('subjects')
      const ex = await coll.find(row.id).catch(() => null)
      if (ex) {
        ops.push(ex.prepareUpdate(r => { r.name = row.name }))
      } else {
        ops.push(coll.prepareCreate(r => { r._raw.id = row.id; r.name = row.name }))
      }
    }

    for (const row of (topicsRes.data ?? [])) {
      const coll = db.get<Topic>('topics')
      const ex = await coll.find(row.id).catch(() => null)
      if (ex) {
        ops.push(ex.prepareUpdate(r => {
          r.name = row.name; r.subjectId = row.subject_id; r.status = row.status
        }))
      } else {
        ops.push(coll.prepareCreate(r => {
          r._raw.id = row.id
          r.name = row.name; r.subjectId = row.subject_id; r.status = row.status
        }))
      }
    }

    for (const row of (cardsRes.data ?? [])) {
      const coll = db.get<Flashcard>('flashcards')
      const ex = await coll.find(row.id).catch(() => null)
      if (ex) {
        ops.push(ex.prepareUpdate(r => {
          r.topicId = row.topic_id; r.question = row.question
          r.answer = row.answer; r.explanation = row.explanation
          r.difficulty = row.difficulty
          r._setRaw('listing_slugs', JSON.stringify(row.listing_slugs ?? []))
          r.remoteUpdatedAt = new Date(row.updated_at).getTime()
        }))
      } else {
        ops.push(coll.prepareCreate(r => {
          r._raw.id = row.id
          r.topicId = row.topic_id; r.question = row.question
          r.answer = row.answer; r.explanation = row.explanation
          r.difficulty = row.difficulty
          r._setRaw('listing_slugs', JSON.stringify(row.listing_slugs ?? []))
          r.remoteUpdatedAt = new Date(row.updated_at).getTime()
        }))
      }
    }

    ops.push(settings.prepareUpdate(s => { s.lastSyncedAt = Date.now() }))

    await db.write(async () => {
      await db.batch(...ops)
    })
  } catch (err) {
    console.error('[sync] error:', err)
  }
}
