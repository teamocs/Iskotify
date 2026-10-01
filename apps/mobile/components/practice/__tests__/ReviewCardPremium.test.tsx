// Per-option "why the others are wrong" explanations are free for everyone
// (decision 2026-10: they left Full Access, which is now only unlimited
// practice questions and unlimited full mocks). They may return to the paid
// list once >=90% of questions carry checked per-option explanations.
import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { ReviewCard } from '../ReviewCard'

const mockPremium = { enabled: true, isPremium: false, unlimited: false, loading: false, refresh: jest.fn() }
jest.mock('../../../hooks/usePremium', () => ({ usePremium: () => mockPremium }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

const props = {
  index: 1,
  questionText: 'Capital?',
  options: ['Manila', 'Cebu', 'Davao', 'Makati'],
  correctIndex: 0,
  selectedIndex: 1,
  explanation: 'Manila is the capital.',
  optionExplanations: [null, 'Cebu is a city in the Visayas.', 'Davao is in Mindanao.', null],
}

beforeEach(() => Object.assign(mockPremium, { enabled: true, isPremium: false, unlimited: false, loading: false }))

it('free (paywall on): shows the main explanation AND every per-option explanation, with no upgrade link', () => {
  render(<ReviewCard {...props} />)
  expect(screen.getByText('Manila is the capital.')).toBeTruthy()
  expect(screen.getByText('Why the others are wrong')).toBeTruthy()
  expect(screen.getByText(/Cebu is a city in the Visayas/)).toBeTruthy()
  expect(screen.getByText(/Davao is in Mindanao/)).toBeTruthy()
  expect(screen.queryByRole('link', { name: /unlock/i })).toBeNull()
  expect(screen.queryByText(/Full Access/)).toBeNull()
})

it('Full Access: the same per-option explanations', () => {
  Object.assign(mockPremium, { isPremium: true, unlimited: true })
  render(<ReviewCard {...props} />)
  expect(screen.getByText(/Cebu is a city in the Visayas/)).toBeTruthy()
  expect(screen.queryByRole('link', { name: /unlock/i })).toBeNull()
})

it('flag off: every per-option explanation and no upgrade link', () => {
  Object.assign(mockPremium, { enabled: false, unlimited: true })
  render(<ReviewCard {...props} />)
  expect(screen.getByText(/Davao is in Mindanao/)).toBeTruthy()
  expect(screen.queryByRole('link', { name: /unlock/i })).toBeNull()
})

it('no per-option data: no "why the others are wrong" block', () => {
  render(<ReviewCard {...props} optionExplanations={null} />)
  expect(screen.queryByText('Why the others are wrong')).toBeNull()
})
