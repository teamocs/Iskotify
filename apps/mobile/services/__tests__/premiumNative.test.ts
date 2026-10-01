/**
 * P3 Full Access, Android: the RevenueCat (Google Play) side. The module under
 * test is services/premium.native.ts; react-native-purchases is the manual mock.
 */
type Mocked = Record<'configure' | 'logIn' | 'logOut' | 'isAnonymous' | 'getOfferings' | 'purchasePackage' | 'restorePurchases' | 'getCustomerInfo', jest.Mock>
// The module registry is reset per load(), so P is re-bound to that load's mock.
let P: Mocked

const RN = { Platform: { OS: 'android' } }
jest.mock('react-native', () => RN)

function load() {
  let mod!: typeof import('../premium.native')
  jest.isolateModules(() => {
    mod = require('../premium.native')
    P = require('react-native-purchases').default
  })
  return mod
}

const premiumInfo = () => ({ entitlements: { active: { premium: { identifier: 'premium', isActive: true } }, all: {} } })
const freeInfo = () => ({ entitlements: { active: {}, all: {} } })
const pkg = { identifier: '$rc_lifetime', product: { priceString: '₱499.00', identifier: 'full_access' } }

beforeEach(() => {
  jest.clearAllMocks()
  RN.Platform.OS = 'android'
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'goog_test'
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(() => { delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY })

describe('configure', () => {
  it('configures RevenueCat on Android with the Android key, once', () => {
    const m = load()
    m.configureStore()
    m.configureStore()
    expect(P.configure).toHaveBeenCalledTimes(1)
    expect(P.configure).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'goog_test' }))
  })

  it('does nothing without a key or off Android, and every call then stays quiet', async () => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
    let m = load()
    m.configureStore()
    expect(P.configure).not.toHaveBeenCalled()
    expect(await m.getFullAccessPrice()).toBeNull()
    await m.storeLogIn('u1')
    expect(P.logIn).not.toHaveBeenCalled()

    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'goog_test'
    RN.Platform.OS = 'ios'
    m = load()
    m.configureStore()
    expect(P.configure).not.toHaveBeenCalled()
  })
})

describe('identity', () => {
  it('logs the Supabase user in (app_user_id = user id), once per user', async () => {
    const m = load()
    m.configureStore()
    await m.storeLogIn('u1')
    await m.storeLogIn('u1')
    expect(P.logIn).toHaveBeenCalledTimes(1)
    expect(P.logIn).toHaveBeenCalledWith('u1')
    await m.storeLogIn('u2')
    expect(P.logIn).toHaveBeenLastCalledWith('u2')
  })

  it('logs out on sign-out, but not an anonymous user (RevenueCat would throw)', async () => {
    const m = load()
    m.configureStore()
    await m.storeLogIn('u1')
    await m.storeLogOut()
    expect(P.logOut).toHaveBeenCalledTimes(1)
    P.isAnonymous.mockResolvedValueOnce(true)
    await m.storeLogOut()
    expect(P.logOut).toHaveBeenCalledTimes(1)
  })
})

describe('price', () => {
  it("shows the current offering's localized price", async () => {
    const m = load()
    m.configureStore()
    P.getOfferings.mockResolvedValueOnce({ current: { availablePackages: [pkg] }, all: {} })
    expect(await m.getFullAccessPrice()).toBe('₱499.00')
  })
})

describe('purchase', () => {
  it('never exposes the store customer info as an access decision', () => {
    const m = load() as unknown as Record<string, unknown>
    expect(m.storeHasPremium).toBeUndefined()
  })

  it('buys the one package as the signed-in user', async () => {
    const m = load()
    m.configureStore()
    P.getOfferings.mockResolvedValueOnce({ current: { availablePackages: [pkg] }, all: {} })
    P.purchasePackage.mockResolvedValueOnce({ customerInfo: premiumInfo(), productIdentifier: 'full_access' })
    expect(await m.purchaseFullAccess('u1')).toEqual({ status: 'success' })
    expect(P.logIn).toHaveBeenCalledWith('u1')
    expect(P.purchasePackage).toHaveBeenCalledWith(pkg)
  })

  it('treats a cancelled purchase silently', async () => {
    const m = load()
    m.configureStore()
    P.getOfferings.mockResolvedValueOnce({ current: { availablePackages: [pkg] }, all: {} })
    P.purchasePackage.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { userCancelled: true, code: '1' }))
    expect(await m.purchaseFullAccess('u1')).toEqual({ status: 'cancelled' })
  })

  it('reports a failed purchase and a missing product', async () => {
    const m = load()
    m.configureStore()
    P.getOfferings.mockResolvedValueOnce({ current: { availablePackages: [pkg] }, all: {} })
    P.purchasePackage.mockRejectedValueOnce(Object.assign(new Error('boom'), { userCancelled: false, code: '2' }))
    expect((await m.purchaseFullAccess('u1')).status).toBe('error')
    P.getOfferings.mockResolvedValueOnce({ current: null, all: {} })
    expect((await m.purchaseFullAccess('u1')).status).toBe('error')
  })

  it('restores an earlier purchase', async () => {
    const m = load()
    m.configureStore()
    P.restorePurchases.mockResolvedValueOnce(premiumInfo())
    expect(await m.restoreFullAccess('u1')).toEqual({ status: 'success' })
    P.restorePurchases.mockResolvedValueOnce(freeInfo())
    expect(await m.restoreFullAccess('u1')).toEqual({ status: 'nothing_to_restore' })
  })
})
