import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import SettingsScreen from '../settings'
import { aria } from '../../test-utils/aria'

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
  ChevronLeftOutlined: {},
  ChevronDownOutlined: {},
  ChevronUpOutlined: {},
  Gear1Outlined: {},
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


const { Platform } = require('react-native')
const originalOS = Platform.OS
afterEach(() => { Platform.OS = originalOS })

describe('SettingsScreen', () => {
  it('names the page with a level-1 heading', () => {
    render(<SettingsScreen />)
    const h = screen.getByRole('header', { name: 'Settings' })
    expect(aria(h, 'aria-level')).toBe(1)
  })

  it('shows the app version', () => {
    render(<SettingsScreen />)
    expect(screen.getByText('Iskotify v1.2.3')).toBeTruthy()
  })

  it('has a named back button with a drawn icon (no glyph)', () => {
    render(<SettingsScreen />)
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
    expect(screen.queryByText('‹')).toBeNull()
    expect(screen.queryByText('›')).toBeNull()
  })

  it('renders the About section rows in sentence case', () => {
    render(<SettingsScreen />)
    expect(screen.getByRole('button', { name: 'About Iskotify' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Help and support' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Privacy and terms' })).toBeTruthy()
  })

  it('only offers Exit app on Android, where it works', () => {
    Platform.OS = 'ios'
    const r = render(<SettingsScreen />)
    expect(screen.queryByText('Exit app')).toBeNull()
    r.unmount()
    Platform.OS = 'android'
    render(<SettingsScreen />)
    expect(screen.getByRole('button', { name: 'Exit app' })).toBeTruthy()
  })

  it('renders the Notifications section with master toggle, reminder time, and weekly summary', async () => {
    render(<SettingsScreen />)
    expect(screen.getByRole('header', { name: 'Notifications' })).toBeTruthy()
    expect(await screen.findByText('Push notifications')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Push notifications' })).toBeTruthy()
    expect(screen.getByText('Daily reminder time')).toBeTruthy()
    expect(screen.getByText('9:00 AM')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Weekly summary' })).toBeTruthy()
  })

  it('stepping the reminder time forward shows the next hour; steppers are 44pt', async () => {
    const { StyleSheet } = require('react-native')
    render(<SettingsScreen />)
    await screen.findByText('9:00 AM')
    const later = screen.getByRole('button', { name: 'Later' })
    const st = StyleSheet.flatten(typeof later.props.style === 'function' ? later.props.style({ pressed: false }) : later.props.style)
    expect(st.width).toBeGreaterThanOrEqual(44)
    expect(st.height).toBeGreaterThanOrEqual(44)
    fireEvent.press(later)
    expect(await screen.findByText('10:00 AM')).toBeTruthy()
  })

  it('renders Feedback rows and navigates to them', () => {
    const { router } = require('expo-router')
    render(<SettingsScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Report a bug' }))
    expect(router.push).toHaveBeenCalledWith('/settings/report-bug')
    fireEvent.press(screen.getByRole('button', { name: 'Leave feedback' }))
    expect(router.push).toHaveBeenCalledWith('/settings/leave-feedback')
  })

  it('the theme picker is a radio group exposing aria-checked, with 44pt options', () => {
    const { StyleSheet } = require('react-native')
    render(<SettingsScreen />)
    expect(screen.getByRole('header', { name: 'Appearance' })).toBeTruthy()
    // themeContextMock reports themePref 'system'.
    expect(aria(screen.getByRole('radio', { name: 'Auto' }), 'aria-checked')).toBe(true)
    expect(aria(screen.getByRole('radio', { name: 'Light' }), 'aria-checked')).toBe(false)
    expect(aria(screen.getByRole('radio', { name: 'Dark' }), 'aria-checked')).toBe(false)
    const light = screen.getByRole('radio', { name: 'Light' })
    const st = StyleSheet.flatten(typeof light.props.style === 'function' ? light.props.style({ pressed: false }) : light.props.style)
    expect(st.minHeight).toBeGreaterThanOrEqual(44)
  })

  it('shows Student as the default name', async () => {
    render(<SettingsScreen />)
    expect(await screen.findByText('Student')).toBeTruthy()
  })

  it('opens the on-device AI model sheet', () => {
    render(<SettingsScreen />)
    expect(screen.queryByText('AI Model Download Sheet')).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: /On-device AI model/ }))
    expect(screen.getByText('AI Model Download Sheet')).toBeTruthy()
  })
})
