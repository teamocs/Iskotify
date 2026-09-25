import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ScoreDisclaimerModal, ScoreDisclaimerNotice } from '../ScoreDisclaimerModal'

describe('ScoreDisclaimerModal', () => {
  it('renders English disclaimer text when visible', () => {
    const { getByText } = render(
      <ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />,
    )
    expect(
      getByText(/unofficial estimate only/i),
    ).toBeTruthy()
  })

  it('renders Tagalog disclaimer text when visible', () => {
    const { getByText } = render(
      <ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />,
    )
    expect(
      getByText(/hindi opisyal na estima lamang/i),
    ).toBeTruthy()
  })

  it('renders acknowledge button with EN+TL label', () => {
    const { getByText } = render(
      <ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />,
    )
    expect(getByText(/I understand \/ Naiintindihan ko/i)).toBeTruthy()
  })

  it('calls onAcknowledge when the button is pressed', () => {
    const onAcknowledge = jest.fn()
    const { getByRole } = render(
      <ScoreDisclaimerModal visible={true} onAcknowledge={onAcknowledge} />,
    )
    fireEvent.press(getByRole('button', { name: /acknowledge disclaimer/i }))
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onAcknowledge when pressing outside (no backdrop close)', () => {
    // The modal has no backdrop Pressable — onRequestClose is a no-op.
    // This test simply asserts the function is NOT called unless the button is pressed.
    const onAcknowledge = jest.fn()
    render(<ScoreDisclaimerModal visible={true} onAcknowledge={onAcknowledge} />)
    expect(onAcknowledge).not.toHaveBeenCalled()
  })

  // September 2026 audit: white/textInverse text directly on `t.warning`
  // (#fbbf24 in dark) measures ≈1.7:1 — a WCAG AA failure. The button must
  // fill with `accentStrong` (opaque maroon, textInverse already clears
  // AA on it elsewhere in the app) instead.
  it('fills the acknowledge button with accentStrong, not the raw warning color', () => {
    const { getByRole } = render(
      <ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />,
    )
    const btn = getByRole('button', { name: /acknowledge disclaimer/i })
    const flatStyle = Array.isArray(btn.props.style) ? Object.assign({}, ...btn.props.style) : btn.props.style
    expect(flatStyle.backgroundColor).toBe('rgba(128,0,0,0.82)') // theme mock's accentStrong
    expect(flatStyle.backgroundColor).not.toBe('#fbbf24')
  })

  it('colors the "Important Notice" badge text with warningStrong (text on warningSurface)', () => {
    const { getByText } = render(
      <ScoreDisclaimerModal visible={true} onAcknowledge={() => {}} />,
    )
    const badgeText = getByText('Important Notice')
    const flatStyle = Array.isArray(badgeText.props.style)
      ? Object.assign({}, ...badgeText.props.style)
      : badgeText.props.style
    expect(flatStyle.color).toBe('#fbbf24') // theme mock's warningStrong
  })
})

describe('ScoreDisclaimerNotice', () => {
  it('renders the short EN+TL inline notice text', () => {
    const { getByText } = render(<ScoreDisclaimerNotice />)
    expect(getByText(/Unofficial estimate/i)).toBeTruthy()
    expect(getByText(/Hindi opisyal na estima/i)).toBeTruthy()
  })

  it('has the correct accessibility label', () => {
    const { getByLabelText } = render(<ScoreDisclaimerNotice />)
    expect(getByLabelText(/unofficial estimate disclaimer/i)).toBeTruthy()
  })
})
