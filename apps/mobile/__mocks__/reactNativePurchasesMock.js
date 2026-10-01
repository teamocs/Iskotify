// Manual mock for react-native-purchases (RevenueCat) in both jest projects:
// the real module needs the native bridge. Every method is a jest.fn with a
// harmless default (free, no offerings) that a test can override.
const PURCHASES_ERROR_CODE = { PURCHASE_CANCELLED_ERROR: '1' }

const emptyCustomerInfo = () => ({ entitlements: { active: {}, all: {} } })

const Purchases = {
  PURCHASES_ERROR_CODE,
  configure: jest.fn(),
  isConfigured: jest.fn(async () => true),
  setLogLevel: jest.fn(async () => undefined),
  logIn: jest.fn(async () => ({ customerInfo: emptyCustomerInfo(), created: false })),
  logOut: jest.fn(async () => emptyCustomerInfo()),
  isAnonymous: jest.fn(async () => false),
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
