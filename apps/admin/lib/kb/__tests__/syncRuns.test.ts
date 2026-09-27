import { describe, it, expect } from 'vitest'
import { logSyncRun } from '../syncRuns'
import { fakeDb } from './fakeDb'

const summary = (p: Record<string, unknown> = {}) => ({
  imported: [{ driveFileId: 'a', name: 'a' }], skipped: [], needsMapping: [], errors: [], unchanged: 4, remaining: 0, aiMapped: 1, ...p,
})

describe('logSyncRun', () => {
  it('records a finished run with its counts', async () => {
    const { db, rows } = fakeDb()
    const out = await logSyncRun(db as any, 'manual', async () => summary() as any)
    expect(out.unchanged).toBe(4)
    expect(rows('kb_sync_runs')[0]).toMatchObject({
      trigger: 'manual', status: 'ok', imported: 1, unchanged: 4, needs_mapping: 0, skipped: 0, errors: 0, remaining: 0, ai_mapped: 1,
      finished_at: expect.any(String),
    })
  })

  it('marks a run with failed files or files needing mapping as a warning', async () => {
    const { db, rows } = fakeDb()
    await logSyncRun(db as any, 'cron', async () => summary({ needsMapping: [{ driveFileId: 'b', name: 'b' }] }) as any)
    expect(rows('kb_sync_runs')[0]).toMatchObject({ trigger: 'cron', status: 'warn', needs_mapping: 1 })
  })

  it('records a run that throws, then rethrows', async () => {
    const { db, rows } = fakeDb()
    await expect(logSyncRun(db as any, 'cron', async () => { throw new Error('Drive said no') })).rejects.toThrow('Drive said no')
    expect(rows('kb_sync_runs')[0]).toMatchObject({ status: 'error', message: 'Drive said no', finished_at: expect.any(String) })
  })

  it('still runs the sync when the run log itself cannot be written', async () => {
    const broken = { from: () => { throw new Error('no table') } }
    const out = await logSyncRun(broken as any, 'manual', async () => summary() as any)
    expect(out.imported).toHaveLength(1)
  })
})
