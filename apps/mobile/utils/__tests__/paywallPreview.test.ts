import { isPaywallPreview, setPaywallPreview } from '../paywallPreview'
import { isPaywallEnabled } from '../premiumLimits'

const g = globalThis as unknown as { window?: unknown }
const realWindow = g.window
const realFlag = process.env.EXPO_PUBLIC_PAYWALL_ENABLED
afterEach(() => { g.window = realWindow; process.env.EXPO_PUBLIC_PAYWALL_ENABLED = realFlag })

it('turns the paywall on and off in this browser only', () => {
  process.env.EXPO_PUBLIC_PAYWALL_ENABLED = '0'
  const m = new Map<string, string>()
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) } }
  expect(isPaywallEnabled()).toBe(false)
  setPaywallPreview(true)
  expect(isPaywallEnabled()).toBe(true)
  setPaywallPreview(false)
  expect(isPaywallEnabled()).toBe(false)
})

it('is off with no or blocked storage (native, private windows)', () => {
  g.window = undefined
  setPaywallPreview(true)
  expect(isPaywallPreview()).toBe(false)
  g.window = { get localStorage() { throw new Error('blocked') } }
  setPaywallPreview(true)
  expect(isPaywallPreview()).toBe(false)
})
