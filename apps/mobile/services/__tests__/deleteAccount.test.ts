/**
 * services/deleteAccount.ts: the client half of "Delete account".
 * The server (POST /api/account/delete on the admin host) removes the login and
 * every row; this clears the phone afterwards. Order matters: nothing local may
 * go before the server says yes.
 */
import { deleteAccount, isDeleteConfirmed, DELETE_CONFIRM_WORD } from '../deleteAccount'
import { takeAccountNotice, ACCOUNT_DELETED_NOTICE } from '../accountNotice'

const calls: string[] = []
const mockGetSession = jest.fn()
const mockSignOut = jest.fn()
const mockReset = jest.fn()
const mockFetch = jest.fn()

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
    },
  },
}))
jest.mock('../resetStudyData', () => ({
  resetStudyData: (...a: unknown[]) => mockReset(...a),
}))
const mockPush = jest.fn()
jest.mock('../sync', () => ({
  pushBeforeSignOut: (...a: unknown[]) => mockPush(...a),
  pushUserData: (...a: unknown[]) => mockPush(...a),
}))

const mockResetAnalytics = jest.fn()
jest.mock('../../lib/analytics', () => ({ resetAnalytics: () => mockResetAnalytics() }))

const db = { tag: 'db' } as never
const okResponse = (status = 200, body: unknown = { ok: true }) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

beforeEach(() => {
  calls.length = 0
  jest.clearAllMocks()
  takeAccountNotice() // drain
  ;(global as { fetch: unknown }).fetch = mockFetch
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
  mockFetch.mockImplementation(async () => { calls.push('request'); return okResponse() })
  mockReset.mockImplementation(async () => { calls.push('reset') })
  mockSignOut.mockImplementation(async () => { calls.push('signOut'); return { error: null } })
})

describe('isDeleteConfirmed', () => {
  it('needs the word DELETE, typed exactly (spaces around it are fine)', () => {
    expect(DELETE_CONFIRM_WORD).toBe('DELETE')
    expect(isDeleteConfirmed('DELETE')).toBe(true)
    expect(isDeleteConfirmed('  DELETE ')).toBe(true)
    expect(isDeleteConfirmed('delete')).toBe(false)
    expect(isDeleteConfirmed('DELET')).toBe(false)
    expect(isDeleteConfirmed('DELETE ME')).toBe(false)
    expect(isDeleteConfirmed('')).toBe(false)
  })
})

describe('deleteAccount', () => {
  it('POSTs to /api/account/delete with the session token, then resets local data, then signs out', async () => {
    const res = await deleteAccount(db)
    expect(res).toEqual({ ok: true })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toMatch(/\/api\/account\/delete$/)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
    expect(mockReset).toHaveBeenCalledWith(db)
    expect(calls).toEqual(['request', 'reset', 'signOut'])
  })

  it('sends no user id in the body (the server takes it from the verified token)', async () => {
    await deleteAccount(db)
    expect(mockFetch.mock.calls[0][1].body).toBeUndefined()
  })

  it('signs out locally only (the server session is already gone)', async () => {
    await deleteAccount(db)
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('never pushes a backup first (it would re-create what is being deleted)', async () => {
    await deleteAccount(db)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('switches analytics off once the account is gone', async () => {
    await deleteAccount(db)
    expect(mockResetAnalytics).toHaveBeenCalled()
  })

  it('keeps analytics as it was when the deletion fails', async () => {
    mockFetch.mockImplementation(async () => okResponse(500, {}))
    await deleteAccount(db)
    expect(mockResetAnalytics).not.toHaveBeenCalled()
  })

  it('leaves a notice for the landing screen on success', async () => {
    await deleteAccount(db)
    expect(takeAccountNotice()).toBe(ACCOUNT_DELETED_NOTICE)
    expect(takeAccountNotice()).toBeNull() // shown once
  })

  it('with no session, asks to sign in again and sends nothing', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await deleteAccount(db)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/sign in again/i)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockReset).not.toHaveBeenCalled()
  })

  it('on 401 asks to sign in again and keeps ALL local data', async () => {
    mockFetch.mockResolvedValue(okResponse(401, { ok: false, error: 'Not signed in' }))
    const res = await deleteAccount(db)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/sign in again/i)
    expect(mockReset).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(takeAccountNotice()).toBeNull()
  })

  it('on a server error shows the server message and keeps ALL local data, staying signed in', async () => {
    mockFetch.mockResolvedValue(okResponse(500, { ok: false, error: 'We couldn’t delete your account. Nothing was deleted, so you can try again.' }))
    const res = await deleteAccount(db)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Nothing was deleted/)
    expect(mockReset).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(takeAccountNotice()).toBeNull()
  })

  it('on a 500 without a readable body falls back to a generic message', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json') } } as unknown as Response)
    const res = await deleteAccount(db)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/couldn.t delete your account/i)
    expect(mockReset).not.toHaveBeenCalled()
  })

  it('on a network failure keeps ALL local data too', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'))
    const res = await deleteAccount(db)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/connection/i)
    expect(mockReset).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('once the server has deleted the account, a local reset failure still ends signed out and counts as success', async () => {
    mockReset.mockRejectedValue(new Error('disk full'))
    const res = await deleteAccount(db)
    expect(res).toEqual({ ok: true })
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('a sign-out failure after deletion is not an error either', async () => {
    mockSignOut.mockRejectedValue(new Error('offline'))
    const res = await deleteAccount(db)
    expect(res).toEqual({ ok: true })
  })
})
