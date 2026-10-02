/**
 * The web glimpse (P4): the tab-scoped "this tab just ran the guest preview"
 * marker. Only a fresh marker in this tab lets a guest's run be merged into the
 * account that signs in; anything else (missing, stale, unreadable storage,
 * native) reads as "no marker", the safe side.
 */
import {
  markGuestPreview, hasFreshGuestPreviewMarker,
  GUEST_PREVIEW_MARKER_KEY, GUEST_PREVIEW_MARKER_TTL_MS,
} from '../guestPreviewMarker'

const mockPlatform = { OS: 'web' }
// A getter: the factory runs on import, before this const is initialised.
jest.mock('react-native', () => ({ get Platform() { return mockPlatform } }))

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    map: m,
  }
}
const g = globalThis as { sessionStorage?: unknown }

beforeEach(() => {
  mockPlatform.OS = 'web'
  g.sessionStorage = fakeStorage()
})
afterAll(() => { delete g.sessionStorage })

describe('guest preview marker', () => {
  it('is missing on a new tab', () => {
    expect(hasFreshGuestPreviewMarker()).toBe(false)
  })

  it('is fresh right after the preview starts in this tab', () => {
    markGuestPreview(1_000)
    expect((g.sessionStorage as ReturnType<typeof fakeStorage>).map.get(GUEST_PREVIEW_MARKER_KEY)).toBe('1000')
    expect(hasFreshGuestPreviewMarker(1_000 + GUEST_PREVIEW_MARKER_TTL_MS - 1)).toBe(true)
  })

  it('goes stale after the TTL (6 hours)', () => {
    expect(GUEST_PREVIEW_MARKER_TTL_MS).toBe(6 * 60 * 60 * 1000)
    markGuestPreview(1_000)
    expect(hasFreshGuestPreviewMarker(1_000 + GUEST_PREVIEW_MARKER_TTL_MS + 1)).toBe(false)
  })

  it('a garbage or future value is not fresh', () => {
    const s = g.sessionStorage as ReturnType<typeof fakeStorage>
    s.setItem(GUEST_PREVIEW_MARKER_KEY, 'nope')
    expect(hasFreshGuestPreviewMarker(5_000)).toBe(false)
    s.setItem(GUEST_PREVIEW_MARKER_KEY, '999999')
    expect(hasFreshGuestPreviewMarker(5_000)).toBe(false)
  })

  it('storage that throws reads as missing, and marking never throws', () => {
    g.sessionStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(() => markGuestPreview()).not.toThrow()
    expect(hasFreshGuestPreviewMarker()).toBe(false)
  })

  it('no sessionStorage at all reads as missing', () => {
    delete g.sessionStorage
    expect(() => markGuestPreview()).not.toThrow()
    expect(hasFreshGuestPreviewMarker()).toBe(false)
  })

  it('native: never fresh, never written', () => {
    mockPlatform.OS = 'android'
    markGuestPreview(1_000)
    expect((g.sessionStorage as ReturnType<typeof fakeStorage>).map.size).toBe(0)
    expect(hasFreshGuestPreviewMarker(1_000)).toBe(false)
  })
})
