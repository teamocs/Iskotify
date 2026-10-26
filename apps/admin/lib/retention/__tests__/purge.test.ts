import { describe, it, expect, vi } from 'vitest'
import { purgeExpired, RETENTION_DAYS } from '../purge'

type Call = { table: string; op: string; args: unknown[] }

// Records every query-builder call; each chain resolves to the scripted result.
function fakeDb(opts: {
  resolvedReports?: { id: string; image_url: string | null }[]
  removeError?: { message: string } | null
  deleteCount?: number
} = {}) {
  const calls: Call[] = []
  const removed: string[][] = []
  const from = (table: string) => {
    let op = 'select'
    const chain: Record<string, unknown> = {}
    const rec = (name: string) => (...args: unknown[]) => { calls.push({ table, op: name, args }); return chain }
    for (const m of ['eq', 'lt', 'in', 'limit']) chain[m] = rec(m)
    chain.select = (...args: unknown[]) => { calls.push({ table, op: 'select', args }); return chain }
    chain.delete = (...args: unknown[]) => { op = 'delete'; calls.push({ table, op: 'delete', args }); return chain }
    chain.then = (resolve: (v: unknown) => void) => resolve(
      op === 'delete'
        ? { error: null, count: opts.deleteCount ?? 2 }
        : { data: opts.resolvedReports ?? [], error: null },
    )
    return chain
  }
  const storage = {
    from: vi.fn(() => ({
      remove: vi.fn(async (paths: string[]) => { removed.push(paths); return { error: opts.removeError ?? null } }),
    })),
  }
  return { db: { from, storage } as never, calls, removed }
}

const NOW = new Date('2026-10-27T00:00:00Z')
const CUTOFF = new Date(NOW.getTime() - RETENTION_DAYS * 86_400_000).toISOString()

describe('purgeExpired', () => {
  it('keeps 12 months (365 days)', () => {
    expect(RETENTION_DAYS).toBe(365)
  })

  it('deletes feedback, question reports and date suggestions older than 12 months by created_at', async () => {
    const { db, calls } = fakeDb()
    const result = await purgeExpired(db, NOW)
    for (const table of ['app_feedback', 'question_reports', 'listing_date_contributions']) {
      expect(calls).toContainEqual({ table, op: 'delete', args: [{ count: 'exact' }] })
      expect(calls).toContainEqual({ table, op: 'lt', args: ['created_at', CUTOFF] })
    }
    expect(result.deleted).toMatchObject({ app_feedback: 2, question_reports: 2, listing_date_contributions: 2 })
  })

  it('deletes only bug reports resolved more than 12 months ago, and their screenshot files first', async () => {
    const { db, calls, removed } = fakeDb({
      resolvedReports: [
        { id: 'r1', image_url: 'u1/shot.png' },
        { id: 'r2', image_url: null },
      ],
    })
    const result = await purgeExpired(db, NOW)
    expect(calls).toContainEqual({ table: 'app_bug_reports', op: 'eq', args: ['status', 'resolved'] })
    expect(calls).toContainEqual({ table: 'app_bug_reports', op: 'lt', args: ['updated_at', CUTOFF] })
    expect(removed).toEqual([['u1/shot.png']])
    expect(calls).toContainEqual({ table: 'app_bug_reports', op: 'in', args: ['id', ['r1', 'r2']] })
    expect(result.deleted.app_bug_reports).toBe(2)
  })

  it('keeps the bug report rows when their screenshots cannot be removed', async () => {
    const { db, calls } = fakeDb({
      resolvedReports: [{ id: 'r1', image_url: 'u1/shot.png' }],
      removeError: { message: 'storage down' },
    })
    await expect(purgeExpired(db, NOW)).rejects.toThrow(/screenshot/i)
    expect(calls.some(c => c.table === 'app_bug_reports' && c.op === 'delete')).toBe(false)
  })
})
