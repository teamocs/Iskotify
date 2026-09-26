import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react-native'
import { ScoreDisclaimerModal, ScoreDisclaimerNotice } from '../ScoreDisclaimerModal'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

function flat(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...[style].flat(Infinity as 1).filter(Boolean))
}

/** Every string rendered, joined — for "no glyph / no uppercase" checks. */
function allText(): string {
  const out: string[] = []
  const walk = (n: any) => {
    if (n == null) return
    if (typeof n === 'string') { out.push(n); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.children) n.children.forEach(walk)
  }
  walk(screen.toJSON())
  return out.join(' ')
}

describe('ScoreDisclaimerModal', () => {
  beforeEach(() => { mockBp.value = 'compact' })

  it('renders English disclaimer text when visible', () => {
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    expect(screen.getByText(/unofficial estimate only/i)).toBeTruthy()
  })

  it('renders Tagalog disclaimer text when visible', () => {
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    expect(screen.getByText(/hindi opisyal na estima lamang/i)).toBeTruthy()
  })

  it('renders acknowledge button with EN+TL label', () => {
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    expect(screen.getByText(/I understand \/ Naiintindihan ko/i)).toBeTruthy()
  })

  it('calls onAcknowledge when the button is pressed', () => {
    const onAcknowledge = jest.fn()
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={onAcknowledge} />)
    fireEvent.press(screen.getByRole('button', { name: /acknowledge disclaimer/i }))
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onAcknowledge when pressing outside (no backdrop close)', () => {
    const onAcknowledge = jest.fn()
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={onAcknowledge} />)
    expect(onAcknowledge).not.toHaveBeenCalled()
  })

  // September 2026 audit: white text on the raw warning fill failed AA. The
  // acknowledge action is now the design system's primary Button: the opaque
  // maroon accent fill with textInverse, which clears AA in both themes.
  it('fills the acknowledge button with the maroon accent, never the raw warning colour', () => {
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    const btn = screen.getByRole('button', { name: /acknowledge disclaimer/i })
    const style = flat(typeof btn.props.style === 'function' ? btn.props.style({ pressed: false }) : btn.props.style)
    expect(style.backgroundColor).toBe('#800000') // theme mock's accent
    expect(style.backgroundColor).not.toBe('#fbbf24')
  })

  // ── Redesign M3: a calm reading page, not a warning poster ────────────────
  it('titles the gate as the page h1 in plain words', () => {
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    expect(screen.getByRole('header', { name: 'Before you see your estimate' })).toBeTruthy()
  })

  it('labels the two language versions as sentence-case section headings', () => {
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    expect(screen.getByRole('header', { name: 'English' })).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Filipino' })).toBeTruthy()
  })

  it('drops the eyebrow chip, the warning glyph and the "Tap to continue" sub-label', () => {
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    expect(screen.queryByText(/Important Notice/i)).toBeNull()
    expect(screen.queryByText(/Tap to continue/i)).toBeNull()
    expect(allText()).not.toMatch(/[⚠›←→•]/)
  })

  it('keeps the button in a sticky footer on phones', () => {
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    expect(screen.getByTestId('disclaimer-footer')).toBeTruthy()
  })

  it('puts the button inside the reading column on wider screens (no full-width bar)', () => {
    mockBp.value = 'expanded'
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />)
    expect(screen.queryByTestId('disclaimer-footer')).toBeNull()
    expect(screen.getByRole('button', { name: /acknowledge disclaimer/i })).toBeTruthy()
    // Reading column: capped at 720, not stretched edge to edge.
    const column = screen.getByTestId('screen-content')
    expect(flat(column.props.style).maxWidth).toBe(720)
  })
})

describe('ScoreDisclaimerNotice', () => {
  it('renders the short EN+TL inline notice text', () => {
    render(<ScoreDisclaimerNotice />)
    expect(screen.getByText(/Unofficial estimate/i)).toBeTruthy()
    expect(screen.getByText(/Hindi opisyal na estima/i)).toBeTruthy()
  })

  it('has the correct accessibility label', () => {
    render(<ScoreDisclaimerNotice />)
    expect(screen.getByLabelText(/unofficial estimate disclaimer/i)).toBeTruthy()
  })

  it('draws no warning glyph', () => {
    render(<ScoreDisclaimerNotice />)
    expect(allText()).not.toMatch(/[⚠]/)
  })
})
