import React from 'react'
import { render, screen } from '@testing-library/react-native'
import RequirementsScreen from '../requirements'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: jest.fn((cb: any) => { cb(); return () => {} }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

jest.mock('../../hooks/useDb', () => ({
  useDb: () => ({
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        leftJoin: jest.fn(() => ({
          orderBy: jest.fn().mockResolvedValue([]),
        })),
      })),
    })),
  }),
}))

jest.mock('../../components/RequirementsChecklist', () => ({
  RequirementsChecklist: () => null,
}))

describe('RequirementsScreen', () => {
  it('renders the screen title', async () => {
    render(<RequirementsScreen />)
    expect(screen.getByText('My Requirements')).toBeTruthy()
  })

  it('shows empty state when no focused listings have requirements', async () => {
    render(<RequirementsScreen />)
    expect(await screen.findByText('No requirements yet')).toBeTruthy()
  })

  it('shows a back arrow button', () => {
    render(<RequirementsScreen />)
    // back button renders the back-arrow text
    expect(screen.getByText('‹')).toBeTruthy()
  })
})
