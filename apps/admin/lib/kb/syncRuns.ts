// One kb_sync_runs row per Drive sync (the daily cron or "Sync now"), so the
// console's History shows every run — including one that failed before it
// touched a file, which the per-file ledger can't record. Logging is best
// effort: a run-log failure never stops or fails the sync itself.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncSummary } from './syncDriveFolder'

export type SyncTrigger = 'cron' | 'manual'

async function quietly(fn: () => PromiseLike<unknown>): Promise<void> {
  try { await fn() } catch (err) { console.warn('[kb/sync-runs] run log write failed:', err) }
}

export async function logSyncRun(
  db: SupabaseClient,
  trigger: SyncTrigger,
  run: () => Promise<SyncSummary>,
): Promise<SyncSummary> {
  let id: number | null = null
  await quietly(async () => {
    const { data } = await db.from('kb_sync_runs').insert({ trigger, status: 'running' }).select('id').single()
    id = (data as { id: number } | null)?.id ?? null
  })
  const finish = (patch: Record<string, unknown>) =>
    id === null ? Promise.resolve() : quietly(() => db.from('kb_sync_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id))

  try {
    const s = await run()
    await finish({
      status: s.errors.length || s.needsMapping.length ? 'warn' : 'ok',
      imported: s.imported.length,
      unchanged: s.unchanged,
      needs_mapping: s.needsMapping.length,
      skipped: s.skipped.length,
      errors: s.errors.length,
      remaining: s.remaining,
      ai_mapped: s.aiMapped,
      message: s.errors.length ? s.errors.slice(0, 3).map(e => `${e.name}: ${e.message}`).join(' · ') : null,
    })
    return s
  } catch (err) {
    await finish({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    throw err
  }
}
