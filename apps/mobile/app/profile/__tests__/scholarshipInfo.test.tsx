import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import ScholarshipInfoScreen from '../scholarship-info'

// Route audit 2026-09-26: the scholarship profile form stretched ~1008px on a
// desktop browser (it used the 1040 grid width), and a failed save only
// raised Alert.alert, which does nothing in the web build.

jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView } = require('react-native')
  return { KeyboardAwareScrollView: ScrollView }
})
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})
jest.mock('../../../hooks/useDb', () => { const db = {}; return { useDb: () => db } })
jest.mock('../../../services/sync', () => ({ pushUserData: jest.fn().mockResolvedValue(undefined) }))
const mockUpdate = jest.fn()
jest.mock('../../../services/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({ incomeBracket: null, gwa: 90, province: 'Albay' }),
  updateSettings: (...a: any[]) => mockUpdate(...a),
}))

describe('Scholarship profile', () => {
  beforeEach(() => { mockBp.value = 'compact'; mockUpdate.mockReset() })

  it('is one page heading with a named back button', async () => {
    render(<ScholarshipInfoScreen />)
    await act(async () => {})
    expect(screen.getByRole('header', { name: 'Scholarship profile' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
  })

  it('keeps the form in the 720 reading column on desktop', async () => {
    mockBp.value = 'expanded'
    render(<ScholarshipInfoScreen />)
    await act(async () => {})
    const col = screen.getByTestId('scholarship-form')
    const flat = [col.props.style].flat(3).reduce((a: any, s: any) => ({ ...a, ...s }), {})
    expect(flat.maxWidth).toBe(720)
  })

  it('says so on the page when saving fails (no alert-only error on web)', async () => {
    mockUpdate.mockRejectedValue(new Error('disk full'))
    render(<ScholarshipInfoScreen />)
    await act(async () => {})
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByText("Couldn't save. Check your connection and try again.")).toBeTruthy()
  })
})
