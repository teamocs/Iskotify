import { submitDateContribution } from '../dateContributions'

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}))

let supabase: any

/** Mock the listing_date_contributions insert builder. */
function mockInsert(result: { error: unknown } | Promise<never> = { error: null }) {
  const insert = jest.fn().mockImplementation(() =>
    result instanceof Promise ? result : Promise.resolve(result),
  )
  supabase.from.mockReturnValue({ insert })
  return insert
}

beforeEach(() => {
  jest.clearAllMocks()
  supabase = require('../supabase').supabase
  // Default: a signed-in user (overridden per-test for the no-auth case).
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('submitDateContribution', () => {
  it('happy path: inserts the correction and returns { ok: true }', async () => {
    const insert = mockInsert()

    const res = await submitDateContribution({
      listingSlug: 'upcat',
      field: 'exam_date',
      date: '2026-08-15',
      note: 'Announced on the official site',
      sourceUrl: 'https://upd.edu.ph',
    })

    expect(res).toEqual({ ok: true })
    expect(supabase.from).toHaveBeenCalledWith('listing_date_contributions')
    expect(insert).toHaveBeenCalledWith({
      listing_slug: 'upcat',
      user_id: 'user-1',
      field: 'exam_date',
      suggested_date: '2026-08-15',
      note: 'Announced on the official site',
      source_url: 'https://upd.edu.ph',
    })
  })

  it('coalesces omitted note / sourceUrl to null', async () => {
    const insert = mockInsert()

    await submitDateContribution({
      listingSlug: 'dcat',
      field: 'deadline',
      date: '2026-06-30',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ note: null, source_url: null }),
    )
  })

  it('returns { needsAuth: true } when no user is signed in and does not insert', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    const insert = mockInsert()

    const res = await submitDateContribution({
      listingSlug: 'upcat',
      field: 'exam_date',
      date: '2026-08-15',
    })

    expect(res).toEqual({
      ok: false,
      needsAuth: true,
      error: 'Please sign in to suggest a correction.',
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('maps a 23505 duplicate error to the "already suggested" message', async () => {
    mockInsert({ error: { code: '23505', message: 'duplicate key value' } })

    const res = await submitDateContribution({
      listingSlug: 'upcat',
      field: 'results_date',
      date: '2026-09-01',
    })

    expect(res).toEqual({
      ok: false,
      error: "You've already suggested a date for this — it's pending review.",
    })
  })

  it('maps any other Supabase error to the generic message', async () => {
    mockInsert({ error: { code: '42501', message: 'RLS denied' } })

    const res = await submitDateContribution({
      listingSlug: 'upcat',
      field: 'exam_date',
      date: '2026-08-15',
    })

    expect(res).toEqual({ ok: false, error: 'Could not submit — please try again.' })
  })

  it('rejects a malformed or impossible date before touching the network', async () => {
    const insert = mockInsert()

    for (const bad of ['2026-13-01', '2026-02-30', '08/15/2026', '2026-8-5', 'soon', '']) {
      const res = await submitDateContribution({
        listingSlug: 'upcat',
        field: 'exam_date',
        date: bad,
      })
      expect(res).toEqual({ ok: false, error: 'Enter a valid date' })
    }

    expect(supabase.auth.getUser).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('never throws — swallows an unexpected auth failure into the generic error', async () => {
    supabase.auth.getUser.mockRejectedValue(new Error('network down'))

    const res = await submitDateContribution({
      listingSlug: 'upcat',
      field: 'exam_date',
      date: '2026-08-15',
    })

    expect(res).toEqual({ ok: false, error: 'Could not submit — please try again.' })
  })
})
