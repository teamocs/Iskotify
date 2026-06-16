/**
 * TDD tests for services/webReset.ts — the web-only "Clear data / Start over" wipe.
 * Runs under the 'services' jest project (node env, babel-jest).
 *
 * clearWebData() must, in order:
 *   1. await supabase.auth.signOut() (best-effort)
 *   2. indexedDB.deleteDatabase('iskotify') (resolve on success OR error/blocked)
 *   3. remove every localStorage key matching /^sb-/ (and any 'supabase' key)
 *   4. window.location.replace('/auth/sign-in')
 */
import { clearWebData } from '../webReset'

const mockSignOut = jest.fn()

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      signOut: (...args: any[]) => mockSignOut(...args),
    },
  },
}))

// ── Fakes ─────────────────────────────────────────────────────────────────────

type DeleteRequest = {
  onsuccess: ((this: unknown, ev: unknown) => void) | null
  onerror: ((this: unknown, ev: unknown) => void) | null
  onblocked: ((this: unknown, ev: unknown) => void) | null
}

function makeFakeLocalStorage(initial: Record<string, string>) {
  const store: Record<string, string> = { ...initial }
  return {
    store,
    get length() {
      return Object.keys(store).length
    },
    key(i: number): string | null {
      return Object.keys(store)[i] ?? null
    },
    getItem(k: string): string | null {
      return store[k] ?? null
    },
    setItem(k: string, v: string): void {
      store[k] = v
    },
    removeItem(k: string): void {
      delete store[k]
    },
    clear(): void {
      for (const k of Object.keys(store)) delete store[k]
    },
  }
}

let deleteDatabaseSpy: jest.Mock
let replaceSpy: jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  mockSignOut.mockResolvedValue({ error: null })

  // Fake indexedDB whose deleteDatabase returns a request that fires onsuccess
  // asynchronously (mirrors browser behavior).
  deleteDatabaseSpy = jest.fn((_name: string): DeleteRequest => {
    const req: DeleteRequest = { onsuccess: null, onerror: null, onblocked: null }
    setTimeout(() => req.onsuccess?.call(req, {}), 0)
    return req
  })

  replaceSpy = jest.fn()

  ;(global as any).indexedDB = { deleteDatabase: deleteDatabaseSpy }
  ;(global as any).localStorage = makeFakeLocalStorage({
    'sb-abc-auth-token': 'tok',
    'sb-refresh': 'r',
    'supabase.auth.token': 't',
    'theme': 'dark', // unrelated key — must be preserved
  })
  ;(global as any).window = {
    localStorage: (global as any).localStorage,
    indexedDB: (global as any).indexedDB,
    location: { replace: replaceSpy },
  }
})

afterEach(() => {
  delete (global as any).indexedDB
  delete (global as any).localStorage
  delete (global as any).window
  jest.restoreAllMocks()
})

describe('clearWebData', () => {
  it('calls supabase.auth.signOut()', async () => {
    await clearWebData()
    expect(mockSignOut).toHaveBeenCalled()
  })

  it("calls indexedDB.deleteDatabase('iskotify')", async () => {
    await clearWebData()
    expect(deleteDatabaseSpy).toHaveBeenCalledWith('iskotify')
  })

  it('removes every sb- prefixed localStorage key and the supabase key', async () => {
    await clearWebData()
    const ls = (global as any).localStorage
    expect(ls.getItem('sb-abc-auth-token')).toBeNull()
    expect(ls.getItem('sb-refresh')).toBeNull()
    expect(ls.getItem('supabase.auth.token')).toBeNull()
  })

  it('preserves unrelated localStorage keys', async () => {
    await clearWebData()
    expect((global as any).localStorage.getItem('theme')).toBe('dark')
  })

  it("calls window.location.replace('/auth/sign-in')", async () => {
    await clearWebData()
    expect(replaceSpy).toHaveBeenCalledWith('/auth/sign-in')
  })

  it('still resolves and reloads when signOut rejects (best-effort)', async () => {
    mockSignOut.mockRejectedValue(new Error('network'))
    await clearWebData()
    expect(deleteDatabaseSpy).toHaveBeenCalledWith('iskotify')
    expect(replaceSpy).toHaveBeenCalledWith('/auth/sign-in')
  })

  it('does not hang when deleteDatabase fires onerror instead of onsuccess', async () => {
    deleteDatabaseSpy.mockImplementation((_name: string): DeleteRequest => {
      const req: DeleteRequest = { onsuccess: null, onerror: null, onblocked: null }
      setTimeout(() => req.onerror?.call(req, {}), 0)
      return req
    })
    await clearWebData()
    expect(replaceSpy).toHaveBeenCalledWith('/auth/sign-in')
  })

  it('does not hang when deleteDatabase fires onblocked', async () => {
    deleteDatabaseSpy.mockImplementation((_name: string): DeleteRequest => {
      const req: DeleteRequest = { onsuccess: null, onerror: null, onblocked: null }
      setTimeout(() => req.onblocked?.call(req, {}), 0)
      return req
    })
    await clearWebData()
    expect(replaceSpy).toHaveBeenCalledWith('/auth/sign-in')
  })
})
