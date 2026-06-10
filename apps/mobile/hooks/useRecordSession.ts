import { useDb } from './useDb'
import { practiceSessions } from '../db/schema'
import { pushUserData } from '../services/sync'
import { invalidate } from '../services/queryCache'
import { scheduleWebPersist } from '../db/webPersist'

export interface SessionParams {
  listingSlug: string
  topicId: string
  deckId: string
  score: number
  total: number
  startTime: number
  subtest?: string
}

export interface SessionRecord {
  listingSlug: string
  topicId: string
  deckId: string
  score: number
  total: number
  durationSecs: number
  completedAt: number
  subtest: string | null
}

export function buildSessionRecord(params: SessionParams): SessionRecord {
  const completedAt = Date.now()
  return {
    listingSlug: params.listingSlug,
    topicId: params.topicId,
    deckId: params.deckId,
    score: params.score,
    total: params.total,
    durationSecs: Math.round((completedAt - params.startTime) / 1000),
    completedAt,
    subtest: params.subtest ?? null,
  }
}

export function useRecordSession() {
  const db = useDb()

  async function recordSession(params: SessionParams): Promise<void> {
    const record = buildSessionRecord(params)
    await db.insert(practiceSessions).values(record)
    scheduleWebPersist()
    // Invalidate caches so home/analytics screens reflect the new session
    invalidate('analytics:')
    invalidate('home:')
    invalidate('practice:')
    // Best-effort backup to Supabase if signed in. Don't block the UI on this.
    void pushUserData(db).catch(err => console.warn('[recordSession] push failed:', err))
  }

  return { recordSession }
}
