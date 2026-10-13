import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// The stub renders the header where the real dashboard does: inside its own
// scroll view, so the large title scrolls and collapses (P2c review).
jest.mock('../../../components/analytics/AnalyticsDashboard', () => ({
  AnalyticsDashboard: ({ header }: { header?: React.ReactNode }) => {
    const { Text, ScrollView } = require('react-native')
    return <ScrollView testID="dashboard-scroll">{header}<Text>DASHBOARD_STUB</Text></ScrollView>
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

  it('hands the large title to the dashboard, which scrolls it with the content', () => {
    render(<ProgressScreen />)
    const scroll = screen.getByTestId('dashboard-scroll')
    expect(scroll.findAll((n: any) => n.props.accessibilityRole === 'header' && n.props.children === 'Progress')).not.toHaveLength(0)
  })

  it('carries the "This week" eyebrow above the large title', () => {
    render(<ProgressScreen />)
    expect(screen.getByTestId('large-title-eyebrow').props.children).toBe('This week')
  })

  it('has the Profile avatar in its header', () => {
    const { router } = require('expo-router')
    render(<ProgressScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Profile' }))
    expect(router.push).toHaveBeenCalledWith('/profile')
  })
})
