import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../components/analytics/AnalyticsDashboard', () => ({
  AnalyticsDashboard: () => {
    const { Text } = require('react-native')
    return <Text>DASHBOARD_STUB</Text>
  },
}))

jest.mock('../../../hooks/useProfileName', () => ({
  useProfileName: () => 'Ana Reyes',
}))

import ProgressScreen from '../progress'

describe('Progress tab', () => {
  it('shows the Progress title as a header and the analytics dashboard', () => {
    render(<ProgressScreen />)
    expect(screen.getByRole('header', { name: 'Progress' })).toBeTruthy()
    expect(screen.getByText('DASHBOARD_STUB')).toBeTruthy()
  })

  it('has the Profile avatar in its header', () => {
    const { router } = require('expo-router')
    render(<ProgressScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Profile' }))
    expect(router.push).toHaveBeenCalledWith('/profile')
  })
})
