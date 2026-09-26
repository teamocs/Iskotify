/**
 * The guided tour (app/tour.tsx): a paged, full-screen walkthrough shown once
 * after onboarding and replayable from Help. One card at a time, Next / Back /
 * Skip, "n of N" announced, and "Take me there" on the four tab cards.
 */
import React from 'react'
import { BackHandler } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import TourScreen from '../tour'
import { userSettings } from '../../db/schema'
import { aria } from '../../test-utils/aria'

const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockDismissTo = jest.fn()
let mockCanGoBack = true
let mockParams: Record<string, string | undefined> = {}
jest.mock('expo-router', () => ({
  router: {
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockBack(...a),
    dismissTo: (...a: unknown[]) => mockDismissTo(...a),
    canGoBack: () => mockCanGoBack,
  },
  useLocalSearchParams: () => mockParams,
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockFlush = jest.fn()
jest.mock('../../db/webPersist', () => ({
  flushWebPersist: () => mockFlush(),
  scheduleWebPersist: jest.fn(),
}))

let mockSettings: Record<string, unknown>[] = []
const mockWrites: Record<string, unknown>[] = []
jest.mock('../../hooks/useDb', () => {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => {
        const chain: Record<string, unknown> = {}
        chain.where = jest.fn(() => chain)
        chain.limit = jest.fn(() => Promise.resolve(mockSettings))
        return chain
      }),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((values: Record<string, unknown>) => ({
        onConflictDoUpdate: jest.fn(({ set }: { set: Record<string, unknown> }) => {
          mockWrites.push({ table, values, set })
          return Promise.resolve()
        }),
      })),
    })),
  }
  return { useDb: () => db }
})

let backHandler: (() => boolean) | null = null
beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { from: 'onboarding' }
  mockCanGoBack = true
  mockSettings = [{ id: 1, fullName: 'Juan dela Cruz' }]
  mockWrites.length = 0
  backHandler = null
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
    backHandler = h as () => boolean
    return { remove: jest.fn() }
  })
})

async function renderTour() {
  render(<TourScreen />)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}
const next = () => fireEvent.press(screen.getByRole('button', { name: 'Next' }))
const back = () => fireEvent.press(screen.getByRole('button', { name: 'Back' }))

describe('Tour: one card at a time', () => {
  it('opens on the "One next step" card as the page heading, greeting the student by first name', async () => {
    await renderTour()
    const h1 = screen.getAllByRole('header').filter(h => aria(h, 'aria-level') === 1)
    expect(h1).toHaveLength(1)
    expect(h1[0]).toHaveTextContent(/one next step/i)
    expect(screen.getByText(/Juan/)).toBeTruthy()
  })

  it('announces the position as "n of N" in a polite live region', async () => {
    await renderTour()
    const pos = screen.getByText('1 of 6')
    expect(pos.props.accessibilityLiveRegion).toBe('polite')
    expect(aria(pos, 'aria-live')).toBe('polite')
    next()
    expect(screen.getByText('2 of 6')).toBeTruthy()
  })

  it('Next walks forward through Today, Practice, Explore, Progress', async () => {
    await renderTour()
    for (const title of [/Today/, /Practice/i, /schools|scholarships/i, /better|progress/i]) {
      next()
      expect(screen.getAllByRole('header').find(h => aria(h, 'aria-level') === 1)).toHaveTextContent(title)
    }
  })

  it('Back is disabled on the first card and steps back after that', async () => {
    await renderTour()
    expect(aria(screen.getByRole('button', { name: 'Back' }), 'aria-disabled')).toBe(true)
    next(); next()
    expect(screen.getByText('3 of 6')).toBeTruthy()
    back()
    expect(screen.getByText('2 of 6')).toBeTruthy()
  })

  it('the Practice card mentions mock exams that save as you go', async () => {
    await renderTour()
    next(); next()
    expect(screen.getByText(/mock exams/i)).toBeTruthy()
    expect(screen.getByText(/Mocks save as you go/)).toBeTruthy()
  })

  it('Android Back goes to the previous card, and lets the system handle it on the first', async () => {
    await renderTour()
    expect(backHandler).not.toBeNull()
    expect(backHandler!()).toBe(false)
    next(); next()
    let handled = false
    act(() => { handled = backHandler!() })
    expect(handled).toBe(true)
    expect(screen.getByText('2 of 6')).toBeTruthy()
  })
})

describe('Tour: seen once', () => {
  it('records that the tour was seen as soon as it opens, and flushes it on web', async () => {
    await renderTour()
    const w = mockWrites.find(x => x.table === userSettings)
    expect(w).toBeTruthy()
    expect((w!.set as { tourSeenAt: number }).tourSeenAt).toBeGreaterThan(0)
    expect(mockFlush).toHaveBeenCalled()
  })
})

describe('Tour: leaving (after onboarding)', () => {
  it('Skip goes to Today and replaces the tour', async () => {
    await renderTour()
    fireEvent.press(screen.getByRole('button', { name: 'Skip the tour' }))
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('"Take me there" on the Practice card opens Practice', async () => {
    await renderTour()
    next(); next()
    fireEvent.press(screen.getByRole('button', { name: 'Take me to Practice' }))
    expect(mockReplace).toHaveBeenCalledWith('/practice')
  })

  it('the idea card and the last card have no "Take me there"', async () => {
    await renderTour()
    expect(screen.queryByRole('button', { name: /^Take me to/ })).toBeNull()
    for (let i = 0; i < 5; i++) next()
    expect(screen.queryByRole('button', { name: /^Take me to/ })).toBeNull()
  })

  it('the last card ends in one primary action into Today, with no Skip', async () => {
    await renderTour()
    for (let i = 0; i < 5; i++) next()
    expect(screen.getByText('6 of 6')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip the tour' })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: /Tara, simulan na natin/ }))
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })
})

describe('Tour: replay from Help', () => {
  beforeEach(() => { mockParams = { from: 'help' } })

  it('Skip returns to Help', async () => {
    await renderTour()
    fireEvent.press(screen.getByRole('button', { name: 'Skip the tour' }))
    expect(mockBack).toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('Skip with no history (a web refresh) lands on Today', async () => {
    mockCanGoBack = false
    await renderTour()
    fireEvent.press(screen.getByRole('button', { name: 'Skip the tour' }))
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('"Take me there" dismisses back to the tab instead of stacking screens', async () => {
    await renderTour()
    next(); next(); next()
    fireEvent.press(screen.getByRole('button', { name: 'Take me to Explore' }))
    expect(mockDismissTo).toHaveBeenCalledWith('/explore')
  })
})

/**
 * Review finding (MEDIUM): arrow keys were read from a document-level
 * listener, so Alt+Arrow (browser back/forward) and a screen reader's
 * browse-mode arrows anywhere on the page moved the tour. Keys are now read
 * only inside the tour's own region, and only when unmodified.
 */
describe('Tour: arrow keys on web', () => {
  const RN = require('react-native') as typeof import('react-native')
  let restoreOS: { restore: () => void }
  const docListeners: ((e: unknown) => void)[] = []
  const g = globalThis as { document?: unknown }
  let hadDocument = false
  let prevDocument: unknown

  beforeEach(() => {
    restoreOS = jest.replaceProperty(RN.Platform, 'OS', 'web')
    docListeners.length = 0
    hadDocument = 'document' in g
    prevDocument = g.document
    g.document = {
      addEventListener: (type: string, l: (e: unknown) => void) => { if (type === 'keydown') docListeners.push(l) },
      removeEventListener: jest.fn(),
    }
  })
  afterEach(() => {
    restoreOS.restore()
    if (hadDocument) g.document = prevDocument
    else delete g.document
  })

  const key = (k: string, mods: Partial<Record<'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey', boolean>> = {}) => ({
    key: k, altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, ...mods,
    target: { tagName: 'DIV' }, preventDefault: jest.fn(),
  })
  const region = () => screen.getByTestId('tour-region')

  it('the tour region is programmatically focusable (tabIndex -1)', async () => {
    await renderTour()
    expect(region().props.tabIndex).toBe(-1)
  })

  it('an arrow key with focus inside the tour moves the card', async () => {
    await renderTour()
    act(() => { fireEvent(region(), 'keyDown', key('ArrowRight')) })
    expect(screen.getByText('2 of 6')).toBeTruthy()
    act(() => { fireEvent(region(), 'keyDown', key('ArrowLeft')) })
    expect(screen.getByText('1 of 6')).toBeTruthy()
  })

  it('Alt+ArrowLeft (browser back) and other modified arrows are not intercepted', async () => {
    await renderTour()
    act(() => { fireEvent(region(), 'keyDown', key('ArrowRight')) })
    expect(screen.getByText('2 of 6')).toBeTruthy()
    for (const mod of ['altKey', 'metaKey', 'ctrlKey', 'shiftKey'] as const) {
      const e = key('ArrowLeft', { [mod]: true })
      act(() => { fireEvent(region(), 'keyDown', e) })
      expect(e.preventDefault).not.toHaveBeenCalled()
    }
    expect(screen.getByText('2 of 6')).toBeTruthy()
  })

  it('an arrow key typed into an editable field does not move the card', async () => {
    await renderTour()
    const e = { ...key('ArrowRight'), target: { tagName: 'DIV', isContentEditable: true } }
    act(() => { fireEvent(region(), 'keyDown', e) })
    expect(screen.getByText('1 of 6')).toBeTruthy()
  })

  it('an arrow key outside the tour region does nothing', async () => {
    await renderTour()
    act(() => { docListeners.forEach(l => l(key('ArrowRight'))) })
    expect(screen.getByText('1 of 6')).toBeTruthy()
  })
})
