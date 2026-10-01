// P3 Full Access: per-option explanations are a Full Access feature. The main
// "why the correct answer is correct" explanation always stays visible.
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

it('free: keeps the main explanation and shows a locked line instead of the per-option rows', () => {
  render(<ReviewCard {...props} />)
  expect(screen.getByText('Manila is the capital.')).toBeTruthy()
  expect(screen.queryByText(/Cebu is a city in the Visayas/)).toBeNull()
  expect(screen.queryByText('Why the others are wrong')).toBeNull()
  expect(screen.getByRole('link', { name: /unlock full access/i })).toBeTruthy()
})

it('Full Access: shows every per-option explanation', () => {
  Object.assign(mockPremium, { isPremium: true, unlimited: true })
  render(<ReviewCard {...props} />)
  expect(screen.getByText(/Cebu is a city in the Visayas/)).toBeTruthy()
  expect(screen.queryByRole('link', { name: /unlock full access/i })).toBeNull()
})

it('flag off: unchanged, every per-option explanation and no upgrade link', () => {
  Object.assign(mockPremium, { enabled: false, unlimited: true })
  render(<ReviewCard {...props} />)
  expect(screen.getByText(/Davao is in Mindanao/)).toBeTruthy()
  expect(screen.queryByRole('link', { name: /unlock/i })).toBeNull()
})

it('no per-option data: no locked line either', () => {
  render(<ReviewCard {...props} optionExplanations={null} />)
  expect(screen.queryByRole('link', { name: /unlock/i })).toBeNull()
})
