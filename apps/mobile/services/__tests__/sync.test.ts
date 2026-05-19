import { syncOnLaunch } from '../sync'
import { userSettings } from '../../db/schema'

jest.mock('../supabase', () => ({
  supabase: { from: jest.fn() },
}))

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val, __isEq: true })),
  asc: jest.fn(col => col),
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

function makeSettingsChain(rows: any[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
}

function makeFocusChain(rows: any[]) {
  return {
    from: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
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

function makeDb(settingsRow: object | null, focusRows: object[] = []) {
  const tx = makeTx()
  const db: any = {
    select: jest.fn(),
    transaction: jest.fn((cb: (tx: any) => void) => {
      cb(tx)
    }),
    _tx: tx,
  }
  // First call returns settings chain, second call returns focus chain
  db.select
    .mockImplementationOnce(() => makeSettingsChain(settingsRow ? [settingsRow] : []))
    .mockImplementationOnce(() => makeFocusChain(focusRows))
    // Default for any additional calls
    .mockImplementation(() => makeSettingsChain([]))
  return db
}

beforeEach(() => {
  jest.clearAllMocks()
  const { supabase } = require('../supabase')
  supabase.from.mockImplementation(() => makeSupabaseChain())
})

describe('syncOnLaunch', () => {
  it('returns early when both focusListings is empty and selectedListingSlug is empty', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: '', lastSyncedAt: 0 }, [])
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('returns early when no settings row exists', async () => {
    const db = makeDb(null, [])
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('calls supabase.from for all four tables when slug is set via fallback', async () => {
    const { supabase } = require('../supabase')
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 }, [])
    await syncOnLaunch(db as any)
    expect(supabase.from).toHaveBeenCalledWith('listings')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_subjects')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_topics')
    expect(supabase.from).toHaveBeenCalledWith('flashcards')
  })

  it('calls db.transaction when slug is set via fallback', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 1000 }, [])
    await syncOnLaunch(db as any)
    expect(db.transaction).toHaveBeenCalledTimes(1)
  })

  it('does not throw when supabase fails', async () => {
    const { supabase } = require('../supabase')
    supabase.from.mockImplementation(() => { throw new Error('network') })
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 }, [])
    await expect(syncOnLaunch(db as any)).resolves.toBeUndefined()
  })

  it('fetches cards for all focus listings when focusRows is set', async () => {
    const { supabase } = require('../supabase')
    const focusRows = [
      { listingSlug: 'upcat', priority: 1, addedAt: 1000 },
      { listingSlug: 'dost-sei', priority: 2, addedAt: 1000 },
    ]
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 }, focusRows)
    await syncOnLaunch(db as any)
    // flashcards should be fetched twice (once per slug)
    const flashcardCalls = supabase.from.mock.calls.filter((c: string[]) => c[0] === 'flashcards')
    expect(flashcardCalls).toHaveLength(2)
    expect(db.transaction).toHaveBeenCalledTimes(1)
  })
})
