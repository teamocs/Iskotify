import { vi } from 'vitest'

/*
 * Component tests in this app render with `renderToStaticMarkup` in a node
 * environment (no DOM). `sonner`'s <Toaster/> reads `window.matchMedia` during
 * render to pick a theme, which throws outside a browser/jsdom. Mocking it
 * globally here means every test gets an inert Toaster and a spy-able `toast`
 * object without each test file having to remember to do it.
 */
vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => 'mock-toast-id'),
    dismiss: vi.fn(),
    message: vi.fn(),
  })
  return {
    toast,
    Toaster: vi.fn(() => null),
  }
})
