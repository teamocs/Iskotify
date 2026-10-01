/**
 * "We've updated our Terms and Privacy Policy": the one-time full-screen
 * consent for students who finished onboarding before consent existed (or
 * before the texts changed). Same three controls as onboarding, nothing
 * pre-ticked, a clear way to read the documents, one primary action.
 */
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native'
import ConsentUpdateScreen from '../consent'
import { aria } from '../../test-utils/aria'

const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a) },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../../hooks/useDb', () => ({ useDb: () => ({ tag: 'db' }) }))

const mockRecord = jest.fn().mockResolvedValue(undefined)
jest.mock('../../services/consent', () => ({ recordConsent: (...a: unknown[]) => mockRecord(...a) }))
const mockApply = jest.fn().mockResolvedValue(true)
jest.mock('../../services/analyticsConsent', () => ({ applyAnalyticsConsent: (...a: unknown[]) => mockApply(...a) }))

beforeEach(() => jest.clearAllMocks())

const READ_BOX = "I've read the Terms and the Privacy Policy"
const GUARDIAN_BOX = 'My parent or guardian has read the Privacy Policy and agrees to me using Iskotify'
const continueBtn = () => screen.getByRole('button', { name: 'Agree and continue' })

describe('ConsentUpdateScreen', () => {
  it('names the page with a level-1 heading and says what changed', () => {
    render(<ConsentUpdateScreen />)
    const h = screen.getByRole('header', { name: "We've updated our Terms and Privacy Policy" })
    expect(aria(h, 'aria-level')).toBe(1)
    expect(screen.getByText(/Please take a moment to read them/)).toBeTruthy()
  })

  it('has a clear link to read the Privacy Policy and the Terms', () => {
    render(<ConsentUpdateScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Read the Privacy Policy' }))
    expect(mockPush).toHaveBeenCalledWith('/privacy')
    fireEvent.press(screen.getByRole('button', { name: 'Read the Terms' }))
    expect(mockPush).toHaveBeenCalledWith('/terms')
  })

  it('pre-ticks and pre-selects nothing', () => {
    render(<ConsentUpdateScreen />)
    expect(aria(screen.getByRole('radio', { name: "I'm 18 or older" }), 'aria-checked')).toBe(false)
    expect(aria(screen.getByRole('radio', { name: "I'm under 18" }), 'aria-checked')).toBe(false)
    expect(aria(screen.getByRole('checkbox', { name: READ_BOX }), 'aria-checked')).toBe(false)
  })

  it('keeps the one primary action disabled, with the reason, until valid', () => {
    render(<ConsentUpdateScreen />)
    expect(aria(continueBtn(), 'aria-disabled')).toBe(true)
    expect(screen.getByText('Choose your age to continue.')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }))
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('an adult agrees: consent is recorded, analytics rule applied, then on to the app', async () => {
    render(<ConsentUpdateScreen />)
    fireEvent.press(screen.getByRole('radio', { name: "I'm 18 or older" }))
    fireEvent.press(screen.getByRole('checkbox', { name: READ_BOX }))
    expect(aria(continueBtn(), 'aria-disabled')).toBe(false)
    await act(async () => { fireEvent.press(continueBtn()) })
    expect(mockRecord).toHaveBeenCalledWith({ tag: 'db' }, { ageBand: 'adult' })
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith({ tag: 'db' }))
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('a minor also needs the guardian box', async () => {
    render(<ConsentUpdateScreen />)
    fireEvent.press(screen.getByRole('radio', { name: "I'm under 18" }))
    fireEvent.press(screen.getByRole('checkbox', { name: READ_BOX }))
    expect(aria(continueBtn(), 'aria-disabled')).toBe(true)
    fireEvent.press(screen.getByRole('checkbox', { name: GUARDIAN_BOX }))
    await act(async () => { fireEvent.press(continueBtn()) })
    expect(mockRecord).toHaveBeenCalledWith({ tag: 'db' }, { ageBand: 'minor' })
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('stays put and says so if the consent could not be saved', async () => {
    mockRecord.mockRejectedValueOnce(new Error('disk full'))
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    render(<ConsentUpdateScreen />)
    fireEvent.press(screen.getByRole('radio', { name: "I'm 18 or older" }))
    fireEvent.press(screen.getByRole('checkbox', { name: READ_BOX }))
    await act(async () => { fireEvent.press(continueBtn()) })
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save/i)
  })

  it('tells the student plainly what happens if they do not agree', () => {
    render(<ConsentUpdateScreen />)
    expect(screen.getByText(/If you don't agree, you can close the app/)).toBeTruthy()
  })
})
