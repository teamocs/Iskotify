import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import * as UpgradeCardModule from '../UpgradeCard'
import { UpgradeCard, PRACTICE_CAP_BODY } from '../UpgradeCard'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }))

beforeEach(() => mockPush.mockReset())

describe('UpgradeCard', () => {
  it('says what happened as a heading and links to /upgrade', () => {
    render(<UpgradeCard title="That's today's free practice" body={PRACTICE_CAP_BODY} source="practice_cap" />)
    expect(screen.getByRole('header', { name: "That's today's free practice" })).toBeTruthy()
    expect(screen.getByText(PRACTICE_CAP_BODY)).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Unlock Full Access' }))
    expect(mockPush).toHaveBeenCalledWith('/upgrade?from=practice_cap')
  })

  it('uses the agreed friendly practice wording', () => {
    expect(PRACTICE_CAP_BODY).toBe("You've done your 30 free questions today. Come back tomorrow, or unlock unlimited practice.")
  })
})

// Per-option explanations are free for everyone now: no locked line exists.
it('has no locked per-option explanations prompt any more', () => {
  expect('LockedOptionExplanations' in UpgradeCardModule).toBe(false)
})
