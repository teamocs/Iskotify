import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import SettingsScreen from '../settings'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  // settings.tsx now pulls in useHomeStats (Task I: Notifications section
  // needs focusedListings) — same useFocusEffect stand-in used across the
  // suite (e.g. hooks/__tests__/useAnalytics.test.ts): just run the effect.
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(cb, [cb])
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({
  Lineicons: () => null,
}))

jest.mock('@lineiconshq/free-icons', () => ({
  User4Outlined: {},
  SparkOutlined: {},
  QuestionMarkCircleOutlined: {},
  Shield2Outlined: {},
  ExitOutlined: {},
  Brush2Outlined: {},
  Bug1Outlined: {},
  Comment1Outlined: {},
  Download1Outlined: {},
  Bell1Outlined: {},
}))

// AiModelDownloadSheet pulls in the native background-downloader module via
// useModelDownload — mock the sheet itself so this screen test stays isolated
// from that native dependency (mirrors how heavy child components are mocked
// elsewhere in this suite).
jest.mock('../../components/AiModelDownloadSheet', () => ({
  AiModelDownloadSheet: ({ visible }: { visible: boolean }) =>
    visible ? require('react').createElement(require('react-native').Text, null, 'AI Model Download Sheet') : null,
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

  it('renders Session section with Exit App', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Exit App')).toBeTruthy()
  })

  it('renders the Notifications section with master toggle, reminder time, and weekly summary', async () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(await screen.findByText('Push Notifications')).toBeTruthy()
    expect(screen.getByText('Daily reminder time')).toBeTruthy()
    expect(screen.getByText('9:00 AM')).toBeTruthy() // default hour
    expect(screen.getByText('Weekly summary')).toBeTruthy()
  })

  it('stepping the reminder time forward shows the next hour', async () => {
    render(<SettingsScreen />)
    await screen.findByText('9:00 AM')
    fireEvent.press(screen.getByLabelText('Later'))
    expect(await screen.findByText('10:00 AM')).toBeTruthy()
  })

  it('renders Feedback section with Report a Bug and Leave Feedback rows', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Feedback')).toBeTruthy()
    expect(screen.getByText('Report a Bug')).toBeTruthy()
    expect(screen.getByText('Leave Feedback')).toBeTruthy()
  })

  it('navigates to the bug report and feedback sub-screens', () => {
    const { router } = require('expo-router')
    render(<SettingsScreen />)
    fireEvent.press(screen.getByText('Report a Bug'))
    expect(router.push).toHaveBeenCalledWith('/settings/report-bug')
    fireEvent.press(screen.getByText('Leave Feedback'))
    expect(router.push).toHaveBeenCalledWith('/settings/leave-feedback')
  })

  it('renders Appearance section with theme picker', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('Auto')).toBeTruthy()
    expect(screen.getByText('Light')).toBeTruthy()
    expect(screen.getByText('Dark')).toBeTruthy()
  })

  it('shows Student as default name when no listing is loaded', async () => {
    render(<SettingsScreen />)
    expect(await screen.findByText('Student')).toBeTruthy()
  })

  it('renders the AI Features section with an On-device AI model row', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('AI Features')).toBeTruthy()
    expect(screen.getByText('On-device AI model')).toBeTruthy()
  })

  it('opens the AI model download sheet on press', () => {
    render(<SettingsScreen />)
    expect(screen.queryByText('AI Model Download Sheet')).toBeNull()
    fireEvent.press(screen.getByText('On-device AI model'))
    expect(screen.getByText('AI Model Download Sheet')).toBeTruthy()
  })
})
