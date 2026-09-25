import { describe, it, expect } from 'vitest'
import { getInboxCounts, describeSync, timeAgo, QUEUES, summarize } from '../inboxCounts'

type Result = { data?: unknown; count?: number | null; error?: { message: string } | null }

/**
 * A chainable stand-in for the Supabase query builder. Every method returns the
 * builder; awaiting it resolves to whatever `respond` says for that table and
 * the filters applied. Throwing from `respond` simulates a network failure.
 */
function fakeDb(respond: (table: string, calls: string[]) => Result) {
  const log: { table: string; calls: string[] }[] = []
  return {
    log,
    from(table: string) {
      const calls: string[] = []
      log.push({ table, calls })
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gt', 'in', 'order', 'limit']) {
        builder[m] = (...args: unknown[]) => { calls.push(`${m}:${JSON.stringify(args)}`); return builder }
      }
      builder.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => {
        try { return Promise.resolve(respond(table, calls)).then(resolve, reject) } catch (e) { return reject(e) }
      }
      return builder
    },
  }
}

const cleanOptions = ['The mitochondria', 'The ribosome', 'The nucleus', 'The vacuole']
const giveaway = ['Photosynthesis', 'None of the above', 'Photosynthesis', 'Respiration']

function healthy(table: string, calls: string[]): Result {
  switch (table) {
    case 'flashcard_topics': return { count: 4, error: null }
    case 'upcat_questions': return { data: [{ options: cleanOptions }, { options: giveaway }, { options: giveaway }], error: null }
    case 'question_reports': return { count: 7, error: null }
    case 'app_bug_reports': return { count: 2, error: null }
    case 'app_feedback': return { count: 0, error: null }
    case 'listing_date_contributions': return { count: 3, error: null }
    case 'kb_drive_files':
      return calls.some(c => c.startsWith('eq:') && c.includes('needs_mapping')) ? { count: 1, error: null } : { count: 5, error: null }
    case 'sync_logs': return { data: [{ status: 'ok', created_at: '2026-09-26T00:00:00Z', message: null }], error: null }
    default: return { count: 0, error: null }
  }
}

describe('getInboxCounts', () => {
  it('reads every queue', async () => {
    const counts = await getInboxCounts(fakeDb(healthy) as never)
    expect(counts.drafts).toEqual({ ok: true, count: 4 })
    expect(counts.reviewQueue).toEqual({ ok: true, count: 2 })
    expect(counts.reports).toEqual({ ok: true, count: 7 })
    expect(counts.bugReports).toEqual({ ok: true, count: 2 })
    expect(counts.feedback).toEqual({ ok: true, count: 0 })
    expect(counts.dateCorrections).toEqual({ ok: true, count: 3 })
    expect(counts.driveNeedsMapping).toEqual({ ok: true, count: 1 })
    expect(counts.driveMissingFigures).toEqual({ ok: true, count: 5 })
    expect(counts.lastSync).toEqual({ ok: true, status: 'ok', at: '2026-09-26T00:00:00Z', message: null })
  })

  it('counts only open items (status filters)', async () => {
    const db = fakeDb(healthy)
    await getInboxCounts(db as never)
    const callsFor = (t: string) => db.log.filter(l => l.table === t).flatMap(l => l.calls).join(' ')
    expect(callsFor('flashcard_topics')).toContain('"status","draft"')
    expect(callsFor('question_reports')).toContain('"status","new"')
    expect(callsFor('app_bug_reports')).toContain('"status","new"')
    expect(callsFor('app_feedback')).toContain('"status","new"')
    expect(callsFor('listing_date_contributions')).toContain('"status","pending"')
    expect(callsFor('kb_drive_files')).toContain('"rows_missing_media",0')
  })

  it('degrades one count at a time when a table is missing', async () => {
    const counts = await getInboxCounts(fakeDb((t, c) =>
      t === 'kb_drive_files' ? { count: null, error: { message: 'relation "kb_drive_files" does not exist' } } : healthy(t, c),
    ) as never)
    expect(counts.driveNeedsMapping).toEqual({ ok: false })
    expect(counts.driveMissingFigures).toEqual({ ok: false })
    expect(counts.reports).toEqual({ ok: true, count: 7 })
  })

  it('survives a thrown error without failing the whole page', async () => {
    const counts = await getInboxCounts(fakeDb((t, c) => {
      if (t === 'question_reports') throw new Error('network down')
      return healthy(t, c)
    }) as never)
    expect(counts.reports).toEqual({ ok: false })
    expect(counts.drafts).toEqual({ ok: true, count: 4 })
  })

  it('reports every count as unavailable when there is no database client', async () => {
    const counts = await getInboxCounts(null)
    expect(Object.values(counts).every(c => c.ok === false)).toBe(true)
  })

  it('treats "no sync yet" as a known state, not a failure', async () => {
    const counts = await getInboxCounts(fakeDb((t, c) => (t === 'sync_logs' ? { data: [], error: null } : healthy(t, c))) as never)
    expect(counts.lastSync).toEqual({ ok: true, status: null, at: null, message: null })
  })
})

describe('QUEUES', () => {
  it('links every queue to a real admin route', () => {
    for (const q of QUEUES) expect(q.href).toMatch(/^\/admin\//)
  })
})

describe('summarize', () => {
  it('adds up open work and counts the queues that have any', () => {
    const s = summarize({
      drafts: { ok: true, count: 4 }, reviewQueue: { ok: true, count: 0 }, reports: { ok: true, count: 7 },
      bugReports: { ok: false }, feedback: { ok: true, count: 0 }, dateCorrections: { ok: true, count: 1 },
      driveNeedsMapping: { ok: true, count: 0 }, driveMissingFigures: { ok: true, count: 0 },
      lastSync: { ok: true, status: 'ok', at: null, message: null },
    })
    expect(s).toEqual({ total: 12, busyQueues: 3, unavailable: 1 })
  })
})

describe('describeSync', () => {
  const now = new Date('2026-09-26T12:00:00Z').getTime()

  it('says when there has never been a sync', () => {
    expect(describeSync({ ok: true, status: null, at: null, message: null }, now)).toMatchObject({ tone: 'neutral', label: 'Never run' })
  })

  it('reports a recent OK sync as OK', () => {
    expect(describeSync({ ok: true, status: 'ok', at: '2026-09-26T10:00:00Z', message: null }, now)).toMatchObject({ tone: 'success', label: 'OK', when: '2h ago' })
  })

  it('flags an OK sync older than a day as stale', () => {
    expect(describeSync({ ok: true, status: 'ok', at: '2026-09-24T10:00:00Z', message: null }, now)).toMatchObject({ tone: 'warning', label: 'Stale' })
  })

  it('surfaces a failed sync', () => {
    expect(describeSync({ ok: true, status: 'error', at: '2026-09-26T11:00:00Z', message: 'Sheet not found' }, now)).toMatchObject({ tone: 'danger', label: 'Failed' })
  })

  it('reports an unreadable log as unavailable', () => {
    expect(describeSync({ ok: false }, now)).toMatchObject({ tone: 'neutral', label: 'Unavailable' })
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-09-26T12:00:00Z').getTime()
  it.each([
    ['2026-09-26T11:59:40Z', 'just now'],
    ['2026-09-26T11:15:00Z', '45m ago'],
    ['2026-09-26T07:00:00Z', '5h ago'],
    ['2026-09-23T12:00:00Z', '3d ago'],
  ])('%s → %s', (iso, out) => {
    expect(timeAgo(iso, now)).toBe(out)
  })
})
