/** P3 Full Access, web: PayMongo checkout through the admin host (services/premium.ts). */
import { startCheckout, purchaseFullAccess, getFullAccessPrice } from '../premium'

const mockRequest = jest.fn()
jest.mock('../entitlements', () => ({ requestCheckout: () => mockRequest() }))

const assign = jest.fn()
beforeEach(() => {
  mockRequest.mockReset()
  assign.mockReset()
  ;(global as unknown as { window: unknown }).window = { location: { assign } }
})
afterAll(() => { delete (global as unknown as { window?: unknown }).window })

it('sends the browser to the PayMongo checkout page', async () => {
  mockRequest.mockResolvedValue({ ok: true, checkoutUrl: 'https://checkout.paymongo.com/cs_1' })
  expect(await startCheckout()).toEqual({ status: 'redirecting' })
  expect(assign).toHaveBeenCalledWith('https://checkout.paymongo.com/cs_1')
})

it('maps the server answers to what the screen shows', async () => {
  mockRequest.mockResolvedValueOnce({ ok: false, reason: 'already_premium' })
  expect(await startCheckout()).toEqual({ status: 'already_premium' })
  mockRequest.mockResolvedValueOnce({ ok: false, reason: 'signed_out' })
  expect(await startCheckout()).toEqual({ status: 'signed_out' })
  mockRequest.mockResolvedValueOnce({ ok: false, reason: 'payments_disabled' })
  expect((await startCheckout()).status).toBe('error')
  expect(assign).not.toHaveBeenCalled()
})

it('needs an account before asking the server', async () => {
  expect(await purchaseFullAccess('')).toEqual({ status: 'signed_out' })
  expect(mockRequest).not.toHaveBeenCalled()
})

it('shows the ₱500 web price', async () => {
  expect(await getFullAccessPrice()).toBe('₱500')
})
