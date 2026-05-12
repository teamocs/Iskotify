import { syncOnLaunch } from '../sync'

function makeChain(data: any[] = []) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockResolvedValue({ data }),
  }
  chain.select.mockReturnValue(chain)
  chain.contains.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return chain
}

jest.mock('../supabase', () => ({
  supabase: { from: jest.fn() },
}))

function makeSettings(slug: string, lastSyncedAt = 0) {
  return {
    selectedListingSlug: slug,
    lastSyncedAt,
    _raw: { id: 'local' },
    prepareUpdate: jest.fn(cb => {
      const copy: any = { selectedListingSlug: slug, lastSyncedAt }
      cb(copy)
      return copy
    }),
  }
}

function makeDb(settings: ReturnType<typeof makeSettings> | null) {
  return {
    get: jest.fn(() => ({
      find: jest.fn().mockResolvedValue(settings),
      create: jest.fn(cb => {
        const obj: any = { _raw: { id: 'local' }, selectedListingSlug: '', lastSyncedAt: 0 }
        cb(obj)
        return obj
      }),
      prepareCreate: jest.fn(cb => {
        const obj: any = { _raw: {} }
        cb(obj)
        return obj
      }),
    })),
    write: jest.fn(cb => cb()),
    batch: jest.fn(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  const { supabase } = require('../supabase')
  supabase.from.mockImplementation(() => makeChain())
})

describe('syncOnLaunch', () => {
  it('skips sync when selectedListingSlug is empty', async () => {
    const db = makeDb(makeSettings(''))
    await syncOnLaunch(db as any)
    expect(db.batch).not.toHaveBeenCalled()
  })

  it('creates settings row when none exist, then skips (empty slug)', async () => {
    const db = makeDb(null)
    db.get = jest.fn(() => ({
      find: jest.fn().mockRejectedValue(new Error('not found')),
      create: jest.fn(cb => {
        const obj: any = { _raw: { id: 'local' }, selectedListingSlug: '', lastSyncedAt: 0 }
        cb(obj)
        return obj
      }),
      prepareCreate: jest.fn(),
    }))
    await syncOnLaunch(db as any)
    expect(db.batch).not.toHaveBeenCalled()
  })

  it('does not throw when Supabase call fails', async () => {
    const { supabase } = require('../supabase')
    supabase.from.mockImplementation(() => { throw new Error('network error') })
    const db = makeDb(makeSettings('upcat'))
    await expect(syncOnLaunch(db as any)).resolves.toBeUndefined()
  })

  it('calls db.batch to update last_synced_at when slug is set', async () => {
    const db = makeDb(makeSettings('upcat', 1000))
    await syncOnLaunch(db as any)
    expect(db.batch).toHaveBeenCalled()
  })
})
