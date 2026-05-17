import React from 'react'
import { render, screen } from '@testing-library/react-native'
import SettingsScreen from '../settings'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({
  Lineicons: () => null,
}))

jest.mock('@lineiconshq/free-icons', () => ({
  User4Outlined: {},
  SparkOutlined: {},
  QuestionMarkCircleOutlined: {},
  Shield2Outlined: {},
  Download1Outlined: {},
  Brush2Outlined: {},
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3' } },
}))

jest.mock('../../hooks/useDb', () => ({
  useDb: () => ({
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue([]),
        })),
      })),
    })),
  }),
}))

jest.mock('../../services/export', () => ({
  exportUserData: jest.fn().mockResolvedValue(undefined),
}))

describe('SettingsScreen', () => {
  it('renders Settings title', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('renders the app version badge', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('v1.2.3')).toBeTruthy()
  })

  it('renders App section rows', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('About Iskotify')).toBeTruthy()
    expect(screen.getByText('Help & Support')).toBeTruthy()
    expect(screen.getByText('Privacy & Terms')).toBeTruthy()
  })

  it('renders Data section with Export Data', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Export Data')).toBeTruthy()
  })

  it('renders Appearance section with Theme coming soon', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Theme')).toBeTruthy()
    expect(screen.getByText('Coming soon')).toBeTruthy()
  })

  it('shows Student as default name when no listing is loaded', async () => {
    render(<SettingsScreen />)
    expect(await screen.findByText('Student')).toBeTruthy()
  })
})
