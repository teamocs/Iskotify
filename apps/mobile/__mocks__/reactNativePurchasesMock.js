// Manual mock for react-native-purchases (RevenueCat) in both jest projects:
// the real module needs the native bridge. Every method is a jest.fn with a
// harmless default (free, no offerings) that a test can override.
const PURCHASES_ERROR_CODE = { PURCHASE_CANCELLED_ERROR: '1' }

const emptyCustomerInfo = () => ({ entitlements: { active: {}, all: {} } })

// The RevenueCat app user id: anonymous until logIn, back to anonymous on logOut.
const ANONYMOUS_ID = '$RCAnonymousID:test'
let appUserId = ANONYMOUS_ID

const Purchases = {
  PURCHASES_ERROR_CODE,
  configure: jest.fn(),
  isConfigured: jest.fn(async () => true),
  setLogLevel: jest.fn(async () => undefined),
  logIn: jest.fn(async (id) => { appUserId = id; return { customerInfo: emptyCustomerInfo(), created: false } }),
  logOut: jest.fn(async () => { appUserId = ANONYMOUS_ID; return emptyCustomerInfo() }),
  isAnonymous: jest.fn(async () => false),
  getAppUserID: jest.fn(async () => appUserId),
  getCustomerInfo: jest.fn(async () => emptyCustomerInfo()),
  getOfferings: jest.fn(async () => ({ current: null, all: {} })),
  purchasePackage: jest.fn(async () => ({ customerInfo: emptyCustomerInfo(), productIdentifier: '' })),
  restorePurchases: jest.fn(async () => emptyCustomerInfo()),
  addCustomerInfoUpdateListener: jest.fn(),
  removeCustomerInfoUpdateListener: jest.fn(),
}

module.exports = Purchases
module.exports.default = Purchases
module.exports.PURCHASES_ERROR_CODE = PURCHASES_ERROR_CODE
module.exports.__esModule = true
