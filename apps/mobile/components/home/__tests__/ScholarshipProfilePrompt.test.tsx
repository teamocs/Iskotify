/**
 * P4: the short onboarding no longer asks for the school, courses, province or
 * the sensitive-data opt-in. Today carries one quiet, dismissible card that
 * opens the scholarship profile where they now live.
 */
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { ScholarshipProfilePrompt } from '../ScholarshipProfilePrompt'
import { _clearForTests, invalidate } from '../../../services/queryCache'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
const mockFlush = jest.fn()
jest.mock('../../../db/webPersist', () => ({ flushWebPersist: () => mockFlush(), scheduleWebPersist: jest.fn() }))

let mockRow: Record<string, unknown> | undefined
let mockFail = false
const mockSet = jest.fn()
jest.mock('../../../hooks/useDb', () => {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => (mockFail ? Promise.reject(new Error('db')) : Promise.resolve(mockRow ? [mockRow] : []))),
        })),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn((v: Record<string, unknown>) => {
        mockSet(v)
        if (mockRow) Object.assign(mockRow, v)
        return { where: jest.fn(() => Promise.resolve()) }
      }),
    })),
  }
  return { useDb: () => db }
})

const INCOMPLETE = {
  school: '', province: '', targetCourses: '[]', sensitiveConsentAt: 0, gwa: null, profilePromptDismissedAt: 0,
}

async function renderPrompt() {
  render(<ScholarshipProfilePrompt />)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

beforeEach(() => {
  _clearForTests()
  jest.clearAllMocks()
  mockRow = { ...INCOMPLETE }
  mockFail = false
})

describe('ScholarshipProfilePrompt', () => {
  it('asks for what is missing, with a way into the scholarship profile', async () => {
    await renderPrompt()
    expect(screen.getByRole('header', { name: 'Complete your scholarship profile' })).toBeTruthy()
    expect(screen.getByText('Add your school, target courses, province, and grades and income to see the scholarships you can apply for.')).toBeTruthy()
    const { router } = require('expo-router')
    fireEvent.press(screen.getByRole('button', { name: 'Complete profile' }))
    expect(router.push).toHaveBeenCalledWith('/profile/scholarship-info')
  })

  it('names only the parts still missing', async () => {
    mockRow = { ...INCOMPLETE, school: 'Pasig High', targetCourses: '[{"id":"a","label":"BS CS"}]', sensitiveConsentAt: 5, gwa: 90 }
    await renderPrompt()
    expect(screen.getByText('Add your province to see the scholarships you can apply for.')).toBeTruthy()
  })

  it('Not now hides it and remembers that on this device', async () => {
    await renderPrompt()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Not now' })) })
    expect(screen.queryByText('Complete your scholarship profile')).toBeNull()
    expect(mockSet).toHaveBeenCalledWith({ profilePromptDismissedAt: expect.any(Number) })
    expect((mockSet.mock.calls[0]![0] as { profilePromptDismissedAt: number }).profilePromptDismissedAt).toBeGreaterThan(0)
    expect(mockFlush).toHaveBeenCalled()
  })

  it('stays hidden once dismissed', async () => {
    mockRow = { ...INCOMPLETE, profilePromptDismissedAt: 1_760_000_000_000 }
    await renderPrompt()
    expect(screen.queryByText('Complete your scholarship profile')).toBeNull()
  })

  it('stays hidden for a complete profile', async () => {
    mockRow = { school: 'Pasig High', province: 'Albay', targetCourses: '[{"id":"a","label":"BS CS"}]', sensitiveConsentAt: 5, gwa: 90, profilePromptDismissedAt: 0 }
    await renderPrompt()
    expect(screen.queryByText('Complete your scholarship profile')).toBeNull()
  })

  it('renders nothing when the settings cannot be read', async () => {
    mockFail = true
    await renderPrompt()
    expect(screen.queryByText('Complete your scholarship profile')).toBeNull()
  })

  it('goes away by itself once the profile is completed elsewhere', async () => {
    await renderPrompt()
    expect(screen.getByText('Complete your scholarship profile')).toBeTruthy()
    mockRow = { school: 'Pasig High', province: 'Albay', targetCourses: '[{"id":"a","label":"BS CS"}]', sensitiveConsentAt: 5, gwa: 90, profilePromptDismissedAt: 0 }
    await act(async () => { invalidate('settings:'); await Promise.resolve(); await Promise.resolve() })
    expect(screen.queryByText('Complete your scholarship profile')).toBeNull()
  })
})
