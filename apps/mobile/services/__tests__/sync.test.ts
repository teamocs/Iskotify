import { syncOnLaunch } from '../sync'
import { userSettings } from '../../db/schema'

jest.mock('../supabase', () => ({
  supabase: { from: jest.fn() },
}))

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val, __isEq: true })),
}))

function makeSupabaseChain(data: any[] = []) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockResolvedValue({ data }),
  }
  return chain
}

function makeSelectChain(rows: any[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
}

function makeTx() {
  const run = jest.fn().mockReturnValue(undefined)
  const onConflictDoUpdate = jest.fn(() => ({ run }))
  const values = jest.fn(() => ({ onConflictDoUpdate }))
  const insert = jest.fn(() => ({ values }))
  const set = jest.fn(() => ({ where: jest.fn().mockReturnValue(undefined) }))
  const update = jest.fn(() => ({ set }))
  return { insert, update, onConflictDoUpdate, run }
}

function makeDb(settingsRow: object | null) {
  const tx = makeTx()
  return {
    select: jest.fn(() => makeSelectChain(settingsRow ? [settingsRow] : [])),
    transaction: jest.fn((cb: (tx: any) => void) => {
      cb(tx)
    }),
    _tx: tx,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  const { supabase } = require('../supabase')
  supabase.from.mockImplementation(() => makeSupabaseChain())
})

describe('syncOnLaunch', () => {
  it('returns early when selectedListingSlug is empty', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: '', lastSyncedAt: 0 })
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('returns early when no settings row exists', async () => {
    const db = makeDb(null)
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('calls supabase.from for all four tables when slug is set', async () => {
    const { supabase } = require('../supabase')
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 })
    await syncOnLaunch(db as any)
    expect(supabase.from).toHaveBeenCalledWith('listings')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_subjects')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_topics')
    expect(supabase.from).toHaveBeenCalledWith('flashcards')
  })

  it('calls db.transaction when slug is set', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 1000 })
    await syncOnLaunch(db as any)
    expect(db.transaction).toHaveBeenCalledTimes(1)
  })

  it('does not throw when supabase fails', async () => {
    const { supabase } = require('../supabase')
    supabase.from.mockImplementation(() => { throw new Error('network') })
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 })
    await expect(syncOnLaunch(db as any)).resolves.toBeUndefined()
  })
})
