/**
 * P1b consent building blocks: the age + Terms/Privacy (+ guardian) controls,
 * the sensitive-data opt-in switch, the withdraw action and the legal line.
 */
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native'
import { ConsentControls, type ConsentFormValue } from '../ConsentControls'
import { SensitiveConsentToggle, SENSITIVE_TOGGLE_LABEL } from '../SensitiveConsentToggle'
import { WithdrawSensitiveButton } from '../WithdrawSensitiveButton'
import { LegalLine } from '../LegalLinks'
import { aria } from '../../../test-utils/aria'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }))

const mockConfirm = jest.fn()
jest.mock('../../../utils/confirmAction', () => ({
  confirmAction: (...a: unknown[]) => mockConfirm(...a),
}))

const mockWithdraw = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../services/consent', () => ({
  withdrawSensitiveConsent: (...a: unknown[]) => mockWithdraw(...a),
}))
jest.mock('../../../hooks/useDb', () => ({ useDb: () => ({ tag: 'db' }) }))

beforeEach(() => jest.clearAllMocks())

const EMPTY: ConsentFormValue = { ageBand: null, terms: false, guardian: false }

function Harness({ initial = EMPTY, spy }: { initial?: ConsentFormValue; spy?: (v: ConsentFormValue) => void }) {
  const [v, setV] = React.useState(initial)
  return <ConsentControls value={v} onChange={n => { setV(n); spy?.(n) }} />
}

describe('ConsentControls', () => {
  it('starts with nothing chosen and nothing pre-ticked', () => {
    render(<Harness />)
    const group = screen.getByLabelText('Your age')
    expect(group).toBeTruthy()
    expect(aria(screen.getByRole('radio', { name: "I'm 18 or older" }), 'aria-checked')).toBe(false)
    expect(aria(screen.getByRole('radio', { name: "I'm under 18" }), 'aria-checked')).toBe(false)
    const terms = screen.getByRole('checkbox', { name: "I've read the Terms and the Privacy Policy" })
    expect(aria(terms, 'aria-checked')).toBe(false)
    expect(screen.queryByRole('checkbox', { name: /parent or guardian/i })).toBeNull()
  })

  it('choosing an age band selects it', () => {
    render(<Harness />)
    fireEvent.press(screen.getByRole('radio', { name: "I'm 18 or older" }))
    expect(aria(screen.getByRole('radio', { name: "I'm 18 or older" }), 'aria-checked')).toBe(true)
    expect(aria(screen.getByRole('radio', { name: "I'm under 18" }), 'aria-checked')).toBe(false)
  })

  it('ticking the terms box reports it', () => {
    const spy = jest.fn()
    render(<Harness spy={spy} />)
    fireEvent.press(screen.getByRole('checkbox', { name: "I've read the Terms and the Privacy Policy" }))
    expect(spy).toHaveBeenLastCalledWith({ ageBand: null, terms: true, guardian: false })
  })

  it('only under-18s are asked for a parent or guardian, with an unticked box', () => {
    render(<Harness />)
    fireEvent.press(screen.getByRole('radio', { name: "I'm under 18" }))
    const g = screen.getByRole('checkbox', {
      name: 'My parent or guardian has read the Privacy Policy and agrees to me using Iskotify',
    })
    expect(aria(g, 'aria-checked')).toBe(false)
    fireEvent.press(g)
    expect(aria(screen.getByRole('checkbox', { name: /parent or guardian/i }), 'aria-checked')).toBe(true)
  })

  it('switching from under 18 to 18+ drops the guardian box and its tick', () => {
    const spy = jest.fn()
    render(<Harness initial={{ ageBand: 'minor', terms: true, guardian: true }} spy={spy} />)
    fireEvent.press(screen.getByRole('radio', { name: "I'm 18 or older" }))
    expect(screen.queryByRole('checkbox', { name: /parent or guardian/i })).toBeNull()
    expect(spy).toHaveBeenLastCalledWith({ ageBand: 'adult', terms: true, guardian: false })
  })

  it('has clear, separate links to the in-app Terms and Privacy Policy', () => {
    render(<Harness />)
    fireEvent.press(screen.getByRole('button', { name: 'Read the Terms' }))
    expect(mockPush).toHaveBeenLastCalledWith('/terms')
    fireEvent.press(screen.getByRole('button', { name: 'Read the Privacy Policy' }))
    expect(mockPush).toHaveBeenLastCalledWith('/privacy')
  })
})

describe('SensitiveConsentToggle', () => {
  it('is a switch labelled with what it does, OFF by default, and says it can be withdrawn', () => {
    const onChange = jest.fn()
    render(<SensitiveConsentToggle value={false} onChange={onChange} />)
    expect(SENSITIVE_TOGGLE_LABEL).toBe('Use my grades and family details to match scholarships and estimate my admission score')
    const sw = screen.getByRole('switch', { name: SENSITIVE_TOGGLE_LABEL })
    expect(sw.props.value ?? aria(sw, 'aria-checked')).toBeFalsy()
    expect(screen.getByText(/withdraw/i)).toBeTruthy()
    fireEvent(sw, 'valueChange', true)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('WithdrawSensitiveButton', () => {
  it('asks to confirm, and only on confirm clears the details', async () => {
    const done = jest.fn()
    render(<WithdrawSensitiveButton onWithdrawn={done} />)
    fireEvent.press(screen.getByRole('button', { name: 'Withdraw consent and clear these details' }))
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(mockWithdraw).not.toHaveBeenCalled()
    const [title, message, confirmLabel, onConfirm, opts] = mockConfirm.mock.calls[0]!
    expect(title).toMatch(/withdraw/i)
    expect(message).toMatch(/cloud backup|backup/i)
    expect(confirmLabel).toBe('Withdraw and clear')
    expect(opts).toMatchObject({ destructive: true })
    await act(async () => { await onConfirm() })
    expect(mockWithdraw).toHaveBeenCalledWith({ tag: 'db' })
    await waitFor(() => expect(done).toHaveBeenCalled())
  })

  it('cancelling the confirmation changes nothing', () => {
    render(<WithdrawSensitiveButton />)
    fireEvent.press(screen.getByRole('button', { name: 'Withdraw consent and clear these details' }))
    expect(mockWithdraw).not.toHaveBeenCalled()
  })
})

describe('WithdrawSensitiveButton failure', () => {
  it('says so when the details could not be cleared, and does not report success', async () => {
    mockWithdraw.mockRejectedValueOnce(new Error('disk full'))
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const done = jest.fn()
    render(<WithdrawSensitiveButton onWithdrawn={done} />)
    fireEvent.press(screen.getByRole('button', { name: 'Withdraw consent and clear these details' }))
    const onConfirm = mockConfirm.mock.calls[0]![3] as () => Promise<void>
    await act(async () => { await onConfirm() })
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t clear your details/)
    expect(done).not.toHaveBeenCalled()
  })
})

describe('LegalLine', () => {
  it('says what continuing means and links both documents in the app', () => {
    render(<LegalLine />)
    expect(screen.getByText(/By continuing you agree to the/)).toBeTruthy()
    expect(screen.getByText(/acknowledge the/)).toBeTruthy()
    fireEvent.press(screen.getByRole('link', { name: 'Terms' }))
    expect(mockPush).toHaveBeenLastCalledWith('/terms')
    fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }))
    expect(mockPush).toHaveBeenLastCalledWith('/privacy')
  })
})
