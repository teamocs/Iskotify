import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import ProfileScreen from '../index'
import { countPrimaryActions } from '../../../test-utils/primaryActions'

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(), push: jest.fn(), navigate: jest.fn(),
    dismiss: jest.fn(), dismissAll: jest.fn(), canDismiss: jest.fn(() => true),
  },
  useFocusEffect: jest.fn((cb: any) => { cb(); return () => {} }),
}))

const mockClearRecents = jest.fn(async () => undefined)
jest.mock('../../../components/search/recentSearches', () => ({
  clearRecentSearches: () => mockClearRecents(),
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
  Gear1Outlined: {},
  Upload1Outlined: {},
  ChevronUpOutlined: {},
  ChevronDownOutlined: {},
  XmarkOutlined: {},
  PlusOutlined: {}, Bell1Outlined: {}, TrendUp1Outlined: {}, GraduationCap1Outlined: {}, Download1Outlined: {},
  Comment1Outlined: {}, Bug1Outlined: {}, Shield2Outlined: {}, ClipboardOutlined: {}, ExitOutlined: {}, Trash3Outlined: {},
}))


jest.mock('../../../services/export', () => ({
  exportUserData: jest.fn().mockResolvedValue({ status: 'saved', filename: 'test.json' }),
}))

jest.mock('../../../services/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn().mockResolvedValue({ error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}))

const mockDeleteAccount = jest.fn()
jest.mock('../../../services/deleteAccount', () => ({
  ...jest.requireActual('../../../services/deleteAccount'),
  deleteAccount: (...a: unknown[]) => mockDeleteAccount(...a),
}))

const mockSignOutOrder: string[] = []
jest.mock('../../../services/sync', () => ({
  syncOnLaunch: jest.fn().mockResolvedValue(undefined),
  pushBeforeSignOut: jest.fn(async () => { mockSignOutOrder.push('push') }),
}))

const mockResetAnalytics = jest.fn()
jest.mock('../../../lib/analytics', () => ({
  ...jest.requireActual('../../../lib/analytics'),
  resetAnalytics: () => mockResetAnalytics(),
}))

// P3 Full Access: flag off by default, so every existing test is unchanged.
const mockPremium = { enabled: false, isPremium: false, unlimited: true, loading: false, refresh: jest.fn() }
jest.mock('../../../hooks/usePremium', () => ({ usePremium: () => mockPremium }))
const mockSignOutPremium = jest.fn(async (..._a: unknown[]) => undefined)
jest.mock('../../../services/premiumState', () => ({ signOutPremium: (...a: unknown[]) => mockSignOutPremium(...a) }))

// P4: the Study group's reminders switch. Scheduling needs the focused
// exams' dates, so the screen reads them the way Settings does.
const mockNotif = { enabled: true, toggle: jest.fn(async (..._a: unknown[]) => undefined), dailyReminderHour: 9 }
jest.mock('../../../hooks/useNotifications', () => ({ useNotifications: () => mockNotif }))
jest.mock('../../../hooks/useHomeStats', () => ({ useHomeStats: () => ({ focusedListings: [{ slug: 'upcat', title: 'UPCAT', examDate: null, deadline: null }] }) }))

jest.mock('../../../services/webReset', () => ({
  clearWebData: jest.fn().mockResolvedValue(undefined),
}))

const makeTx = () => ({
  delete: jest.fn(() => ({ run: jest.fn() })),
})

const makeDb = (userRow?: any, opts: { fail?: boolean } = {}) => ({
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      leftJoin: jest.fn(() => ({
        orderBy: jest.fn().mockResolvedValue([]),
      })),
      where: jest.fn(() => ({
        limit: opts.fail
          ? jest.fn().mockRejectedValue(new Error('disk I/O error'))
          : jest.fn().mockResolvedValue(userRow ? [userRow] : []),
      })),
      orderBy: jest.fn().mockResolvedValue([]),
    })),
  })),
  update: jest.fn(() => ({
    set: jest.fn(() => ({
      where: jest.fn().mockResolvedValue(undefined),
    })),
  })),
  transaction: jest.fn((cb: (tx: any) => void) => {
    cb(makeTx())
    return Promise.resolve()
  }),
})

jest.mock('../../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

jest.mock('../../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({
    focusListings: [],
    addListing: jest.fn(),
    removeListing: jest.fn(),
    moveListing: jest.fn(),
    isInFocus: jest.fn().mockReturnValue(false),
    getPriority: jest.fn().mockReturnValue(null),
  }),
}))

describe('ProfileScreen — empty DB', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
  })

  it('renders Profile title', () => {
    render(<ProfileScreen />)
    expect(screen.getByText('Profile')).toBeTruthy()
  })

  // Redesign M1: Profile is no longer a tab — it opens from the header avatar,
  // so it needs its own way back.
  // Web: Profile is a pushed page with a Back button.
  it('has a Back button that returns to the previous screen when there is one (web)', () => {
    const { Platform } = require('react-native')
    const os = Platform.OS
    Platform.OS = 'web'
    const { router } = require('expo-router')
    router.canGoBack = jest.fn(() => true)
    router.back = jest.fn()
    render(<ProfileScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(router.back).toHaveBeenCalled()
    Platform.OS = os
  })

  it('Back falls back to Today when Profile was opened directly (deep link / web URL)', () => {
    const { Platform } = require('react-native')
    const os = Platform.OS
    Platform.OS = 'web'
    const { router } = require('expo-router')
    router.canGoBack = jest.fn(() => false)
    router.replace.mockClear()
    render(<ProfileScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(router.replace).toHaveBeenCalledWith('/')
    Platform.OS = os
  })

  it('shows default name Student when no data', async () => {
    render(<ProfileScreen />)
    expect(await screen.findByText('Student')).toBeTruthy()
  })

  it('shows default listing title', async () => {
    render(<ProfileScreen />)
    expect(await screen.findByText('No exam selected')).toBeTruthy()
  })

  // Redesign M2: Progress owns analytics — Profile links there instead of
  // embedding a second copy of the dashboard.
  it('links to Progress instead of embedding the analytics dashboard', () => {
    const { router } = require('expo-router')
    render(<ProfileScreen />)
    expect(screen.queryByText('Analytics')).toBeNull()
    expect(screen.queryByRole('button', { name: /Expand analytics/ })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: /^Progress and analytics/ }))
    // Switches tab (closing the sheet), never pushes a second tab stack.
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/progress')
  })

  it('has a labelled Settings button (moved here from Today)', () => {
    const { router } = require('expo-router')
    render(<ProfileScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
    expect(router.push).toHaveBeenCalledWith('/settings')
  })

  it('shows a busy skeleton until the profile has loaded', async () => {
    render(<ProfileScreen />)
    expect(screen.getByLabelText('Loading your profile')).toBeTruthy()
    await screen.findByText('Student')
    expect(screen.queryByLabelText('Loading your profile')).toBeNull()
  })

  it('uses no emoji or glyph icons', async () => {
    render(<ProfileScreen />)
    await screen.findByText('Student')
    const texts: string[] = []
    const walk = (n: any): void => {
      if (n == null) return
      if (typeof n === 'string') { texts.push(n); return }
      if (Array.isArray(n)) { n.forEach(walk); return }
      if (n.children) walk(n.children)
    }
    walk(screen.toJSON())
    expect(texts.join(' ')).not.toMatch(/[\p{Extended_Pictographic}↪⚠⠿›]/u)
  })

  it('renders the Exams in focus group', () => {
    render(<ProfileScreen />)
    expect(screen.getByRole('header', { name: 'Exams in focus' })).toBeTruthy()
  })

  // Review: the section headings sit directly under the h1 "Profile", so they
  // are h2 (no skipped level).
  it('section headings are level 2 under the level-1 Profile title', async () => {
    const { aria } = require('../../../test-utils/aria')
    render(<ProfileScreen />)
    await screen.findByText('Student')
    expect(aria(screen.getByRole('header', { name: 'Profile' }), 'aria-level')).toBe(1)
    for (const name of ['Exams in focus', 'Study', 'Account', 'Help']) {
      expect(aria(screen.getByRole('header', { name }), 'aria-level')).toBe(2)
    }
  })

  // P4: inset grouped sections in the iOS order.
  it('groups its rows under Study, Account and Help, then a destructive Sign out', async () => {
    render(<ProfileScreen />)
    await screen.findByText('Student')
    for (const name of ['Study', 'Account', 'Help']) {
      expect(screen.getByRole('header', { name })).toBeTruthy()
    }
    const { IconTile } = require('../../../components/ui/InsetGroup')
    expect(screen.UNSAFE_root.findAll((n: any) => n.type === IconTile).length).toBeGreaterThan(5)
  })

  it('Study reminders is one whole-row switch that toggles the notifications', async () => {
    mockNotif.toggle.mockClear()
    render(<ProfileScreen />)
    const row = await screen.findByRole('switch', { name: 'Study reminders' })
    expect(screen.getByRole('switch', { name: 'Study reminders', checked: true })).toBeTruthy()
    fireEvent.press(row)
    expect(mockNotif.toggle).toHaveBeenCalledWith([{ slug: 'upcat', title: 'UPCAT', examDate: null, deadline: null }])
  })

  it('Help links open feedback, the bug report, privacy and terms', () => {
    const { router } = require('expo-router')
    render(<ProfileScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Leave feedback' }))
    expect(router.push).toHaveBeenCalledWith('/settings/leave-feedback')
    fireEvent.press(screen.getByRole('button', { name: 'Report a bug' }))
    expect(router.push).toHaveBeenCalledWith('/settings/report-bug')
    fireEvent.press(screen.getByRole('button', { name: 'Privacy policy' }))
    expect(router.push).toHaveBeenCalledWith('/privacy')
    fireEvent.press(screen.getByRole('button', { name: 'Terms of service' }))
    expect(router.push).toHaveBeenCalledWith('/terms')
  })

  it('has one primary action when signed out (Sign in with Google)', async () => {
    render(<ProfileScreen />)
    await screen.findByText('Sign in with Google')
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(1)
  })

  it('renders Export Data card', () => {
    render(<ProfileScreen />)
    expect(screen.getByText('Export Data')).toBeTruthy()
    expect(screen.getByText('Save your preferences as a JSON file')).toBeTruthy()
  })

  it('Google row is NOT shown when googleId is empty', () => {
    render(<ProfileScreen />)
    expect(screen.queryByText('Signed in')).toBeNull()
  })
})

/** Nearest host View above a node (`.parent` is the composite wrapper). */
function hostViewAbove(node: any) {
  let n = node.parent
  while (n && n.type !== 'View') n = n.parent
  return n
}

describe('ProfileScreen — with user data', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb({
      fullName: 'Maria Santos',
      school: 'UPLB',
      gradeLevel: 11,
      googleId: 'google-uid-123',
      email: 'maria@gmail.com',
      selectedListingSlug: '',
    }))
  })

  it('displays the loaded user name', async () => {
    render(<ProfileScreen />)
    await waitFor(() => {
      expect(screen.getByText('Maria Santos')).toBeTruthy()
    })
  })

  it('header card: a 60pt avatar, the name and a grade, school and city subtitle', async () => {
    const { Avatar } = require('../../../components/ui/Avatar')
    render(<ProfileScreen />)
    expect(await screen.findByText('Grade 11 · UPLB')).toBeTruthy()
    const avatar = screen.UNSAFE_root.findAll((n: any) => n.type === Avatar)[0]
    expect(avatar.props.size).toBe(60)
    expect(avatar.props.name).toBe('Maria Santos')
  })

  it('has no primary action when signed in (nothing to sign in to)', async () => {
    render(<ProfileScreen />)
    await screen.findByText('Signed in')
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(0)
  })

  it('shows Google row when googleId is present', async () => {
    render(<ProfileScreen />)
    await waitFor(() => {
      expect(screen.getByText('Signed in')).toBeTruthy()
      expect(screen.getByText('maria@gmail.com')).toBeTruthy()
    })
  })

  it('the Signed in badge draws a visible border (border token, not the fill token)', async () => {
    const { StyleSheet } = require('react-native')
    render(<ProfileScreen />)
    const label = await screen.findByText('Signed in')
    const badge = StyleSheet.flatten(hostViewAbove(label).props.style)
    expect(badge.borderWidth).toBe(1)
    expect(badge.borderColor).not.toBe(badge.backgroundColor)
  })
})

describe('ProfileScreen — sign-in entry (not signed in)', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    // No googleId → user skipped auth at startup
    useDb.mockReturnValue(makeDb({
      fullName: 'Student',
      school: '—',
      gradeLevel: null,
      googleId: '',
      email: '',
      selectedListingSlug: '',
    }))
  })

  it('shows the "Sign in with Google" backup card when googleId is empty', async () => {
    render(<ProfileScreen />)
    await waitFor(() => {
      expect(screen.getByText('Sign in with Google')).toBeTruthy()
      expect(screen.getByText('Save your data and restore it on any device')).toBeTruthy()
    })
  })

  it('pressing the sign-in card routes to /landing on native', async () => {
    render(<ProfileScreen />)
    const { router } = require('expo-router')
    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeTruthy())
    fireEvent.press(screen.getByText('Sign in with Google'))
    expect(router.push).toHaveBeenCalledWith('/landing')
  })
})

describe('ProfileScreen — sign-in entry hidden when signed in', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb({
      fullName: 'Maria Santos',
      school: 'UPLB',
      gradeLevel: 11,
      googleId: 'google-uid-123',
      email: 'maria@gmail.com',
      selectedListingSlug: '',
    }))
  })

  it('does NOT show the sign-in card when googleId is present, and shows Sign Out', async () => {
    render(<ProfileScreen />)
    await waitFor(() => expect(screen.getByText('Signed in')).toBeTruthy())
    expect(screen.queryByText('Sign in with Google')).toBeNull()
    expect(screen.getByText('Sign Out')).toBeTruthy()
  })
})

describe('ProfileScreen — interactions', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    jest.spyOn(Alert, 'alert')
  })

  it('pressing Export Data calls exportUserData and shows alert', async () => {
    const { exportUserData } = require('../../../services/export')
    render(<ProfileScreen />)
    fireEvent.press(screen.getByText('Export Data'))
    await waitFor(() => {
      expect(exportUserData).toHaveBeenCalled()
    })
  })

  it('pressing Export Data calls exportUserData', async () => {
    const { exportUserData } = require('../../../services/export')
    render(<ProfileScreen />)
    fireEvent.press(screen.getByText('Export Data'))
    await waitFor(() => {
      expect(exportUserData).toHaveBeenCalled()
    })
  })

  it('renders Sign Out + Reset App Data action cards', () => {
    const { getByText } = render(<ProfileScreen />)
    expect(getByText('Sign Out')).toBeTruthy()
    expect(getByText('Reset App Data')).toBeTruthy()
  })

  it('Sign Out tap shows confirmation Alert and signs out on confirm', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b: any) => b.style === 'destructive')
      destructive?.onPress?.()
    })
    const { getByText } = render(<ProfileScreen />)
    fireEvent.press(getByText('Sign Out'))
    expect(alertSpy).toHaveBeenCalledWith('Sign Out?', expect.any(String), expect.any(Array))
    const { supabase } = require('../../../services/supabase')
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    alertSpy.mockRestore()
  })

  it('Sign Out pushes unsynced edits BEFORE signing out (best effort, never blocks sign-out)', async () => {
    const { supabase } = require('../../../services/supabase')
    const sync = require('../../../services/sync')
    mockSignOutOrder.length = 0
    supabase.auth.signOut.mockImplementationOnce(async () => { mockSignOutOrder.push('signOut'); return { error: null } })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((x: any) => x.style === 'destructive')?.onPress?.()
    })
    const { getByText } = render(<ProfileScreen />)
    fireEvent.press(getByText('Sign Out'))
    await waitFor(() => expect(mockSignOutOrder).toEqual(['push', 'signOut']))
    // a failing push must not trap the user signed in
    sync.pushBeforeSignOut.mockRejectedValueOnce(new Error('offline'))
    supabase.auth.signOut.mockClear()
    fireEvent.press(getByText('Sign Out'))
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    alertSpy.mockRestore()
  })

  it('Sign Out switches analytics off and forgets the account id (the next person is asked afresh)', async () => {
    mockResetAnalytics.mockClear()
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((x: any) => x.style === 'destructive')?.onPress?.()
    })
    const { getByText } = render(<ProfileScreen />)
    fireEvent.press(getByText('Sign Out'))
    await waitFor(() => expect(mockResetAnalytics).toHaveBeenCalled())
    alertSpy.mockRestore()
  })

  it('Reset App Data also switches analytics off', async () => {
    mockResetAnalytics.mockClear()
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((x: any) => x.style === 'destructive')?.onPress?.()
    })
    const { getByText } = render(<ProfileScreen />)
    fireEvent.press(getByText('Reset App Data'))
    await waitFor(() => expect(mockResetAnalytics).toHaveBeenCalled())
    alertSpy.mockRestore()
  })

  it('Reset App Data tap shows confirmation Alert and wipes tables on confirm', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b: any) => b.style === 'destructive')
      destructive?.onPress?.()
    })
    const { getByText } = render(<ProfileScreen />)
    fireEvent.press(getByText('Reset App Data'))
    expect(alertSpy).toHaveBeenCalledWith('Reset App Data?', expect.any(String), expect.any(Array))
    const { supabase } = require('../../../services/supabase')
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    alertSpy.mockRestore()
  })

  it('Reset App Data confirmation says notes are kept, how to delete them, and suggests Export Data first', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const { getByText } = render(<ProfileScreen />)
    fireEvent.press(getByText('Reset App Data'))
    const message = String(alertSpy.mock.calls[0]?.[1] ?? '')
    expect(message).toMatch(/answer history/)
    expect(message).toMatch(/flashcard/)
    expect(message).toMatch(/study plan/)
    expect(message).toMatch(/Your notes are kept/)
    expect(message).toMatch(/delete them from Notes/)
    expect(message).toMatch(/Export Data first/)
    expect(message).not.toMatch(/ALL local data/)
    alertSpy.mockRestore()
  })
})

// ── WEB platform behavior ──────────────────────────────────────────────────────
// react-native-web's Alert.alert is a no-op, so sign-out + reset must use
// window.confirm() and call clearWebData() (the IndexedDB/localStorage wipe).
// These tests flip Platform.OS to 'web' and stub window.confirm.
describe('ProfileScreen — WEB sign-out & reset', () => {
  const { Platform } = require('react-native')
  let originalOS: string

  beforeAll(() => {
    originalOS = Platform.OS
    Platform.OS = 'web'
  })

  afterAll(() => {
    Platform.OS = originalOS
  })

  beforeEach(() => {
    // Clear call history between tests (mockResolvedValue impls survive
    // clearAllMocks), then re-establish the per-test db + window.confirm.
    jest.clearAllMocks()
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb({
      fullName: 'Maria Santos',
      school: 'UPLB',
      gradeLevel: 11,
      googleId: 'google-uid-123',
      email: 'maria@gmail.com',
      selectedListingSlug: '',
    }))
    ;(global as any).window = { confirm: jest.fn(() => true) }
  })

  afterEach(() => {
    delete (global as any).window
  })

  it('Sign Out uses window.confirm (NOT Alert) and signs out on confirm', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const { getByText } = render(<ProfileScreen />)
    await waitFor(() => expect(getByText('Sign Out')).toBeTruthy())
    fireEvent.press(getByText('Sign Out'))
    expect((global as any).window.confirm).toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
    const { supabase } = require('../../../services/supabase')
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    const { router } = require('expo-router')
    expect(router.replace).toHaveBeenCalledWith('/auth/sign-in')
    alertSpy.mockRestore()
  })

  it('Sign Out does NOT sign out when window.confirm returns false', async () => {
    ;(global as any).window.confirm = jest.fn(() => false)
    const { getByText } = render(<ProfileScreen />)
    await waitFor(() => expect(getByText('Sign Out')).toBeTruthy())
    fireEvent.press(getByText('Sign Out'))
    expect((global as any).window.confirm).toHaveBeenCalled()
    const { supabase } = require('../../../services/supabase')
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('renders the web reset row labeled "Clear data & sign out"', async () => {
    const { getByText } = render(<ProfileScreen />)
    await waitFor(() => expect(getByText('Clear data & sign out')).toBeTruthy())
  })

  it('Reset row uses window.confirm and calls clearWebData() on confirm', async () => {
    const { clearWebData } = require('../../../services/webReset')
    const { getByText } = render(<ProfileScreen />)
    await waitFor(() => expect(getByText('Clear data & sign out')).toBeTruthy())
    fireEvent.press(getByText('Clear data & sign out'))
    expect((global as any).window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(clearWebData).toHaveBeenCalled())
  })

  it('Reset row does NOT call clearWebData() when window.confirm returns false', async () => {
    ;(global as any).window.confirm = jest.fn(() => false)
    const { clearWebData } = require('../../../services/webReset')
    const { getByText } = render(<ProfileScreen />)
    await waitFor(() => expect(getByText('Clear data & sign out')).toBeTruthy())
    fireEvent.press(getByText('Clear data & sign out'))
    expect((global as any).window.confirm).toHaveBeenCalled()
    expect(clearWebData).not.toHaveBeenCalled()
  })
})

describe('ProfileScreen — load failure', () => {
  it('says so with a retry instead of showing defaults as if they were real', async () => {
    const { useDb } = require('../../../hooks/useDb')
    const db = makeDb(undefined, { fail: true })
    useDb.mockReturnValue(db)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    render(<ProfileScreen />)
    expect(await screen.findByText("Couldn't load your profile")).toBeTruthy()
    expect(screen.queryByText('Student')).toBeNull()
    useDb.mockReturnValue(makeDb({ fullName: 'Maria Santos', school: 'UPLB', gradeLevel: 11, googleId: '', email: '', selectedListingSlug: '' }))
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Maria Santos')).toBeTruthy()
    warn.mockRestore()
  })
})

describe('ProfileScreen — Delete account', () => {
  const signedInRow = {
    fullName: 'Maria Santos', school: 'UPLB', gradeLevel: 11,
    googleId: 'google-uid-123', email: 'maria@gmail.com', selectedListingSlug: '',
  }
  const signedOutRow = { ...signedInRow, fullName: 'Student', googleId: '', email: '' }
  const setSession = (session: unknown) =>
    require('../../../services/supabase').supabase.auth.getSession.mockResolvedValue({ data: { session } })

  beforeEach(() => {
    jest.clearAllMocks()
    setSession(null)
    mockDeleteAccount.mockResolvedValue({ ok: true })
    require('expo-router').router.replace.mockClear()
  })

  const open = async () => {
    fireEvent.press(await screen.findByRole('button', { name: /^Delete account/ }))
    return screen.findByText('Delete your account?')
  }

  it('shows the row under Your data when signed in (Google identity)', async () => {
    require('../../../hooks/useDb').useDb.mockReturnValue(makeDb(signedInRow))
    render(<ProfileScreen />)
    expect(await screen.findByRole('button', { name: /^Delete account/ })).toBeTruthy()
  })

  it('shows the row for a signed-in email/password user (session, no Google id)', async () => {
    require('../../../hooks/useDb').useDb.mockReturnValue(makeDb(signedOutRow))
    setSession({ user: { id: 'u1' } })
    render(<ProfileScreen />)
    expect(await screen.findByRole('button', { name: /^Delete account/ })).toBeTruthy()
  })

  it('hides the row when signed out (nothing to delete; Reset app data stays)', async () => {
    require('../../../hooks/useDb').useDb.mockReturnValue(makeDb(signedOutRow))
    render(<ProfileScreen />)
    await screen.findByText('Reset App Data')
    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /^Delete account/ })).toBeNull()
  })

  it('uses danger styling for the row (icon tone and title, tokens not hex)', async () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.tsx'), 'utf8')
    expect(src).toMatch(/title="Delete account"[\s\S]{0,400}iconTone="danger"[\s\S]{0,200}destructive/)
  })

  it('opens the confirmation sheet, which does not delete anything yet', async () => {
    require('../../../hooks/useDb').useDb.mockReturnValue(makeDb(signedInRow))
    render(<ProfileScreen />)
    await open()
    expect(mockDeleteAccount).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Type DELETE to confirm')).toBeTruthy()
  })

  it('on success routes to the landing screen (native)', async () => {
    require('../../../hooks/useDb').useDb.mockReturnValue(makeDb(signedInRow))
    render(<ProfileScreen />)
    await open()
    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE')
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
    await waitFor(() => expect(require('expo-router').router.replace).toHaveBeenCalledWith('/landing'))
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1)
  })

  it('on failure shows the error and does not leave the screen', async () => {
    mockDeleteAccount.mockResolvedValue({ ok: false, error: "We couldn't delete your account. Nothing was changed." })
    require('../../../hooks/useDb').useDb.mockReturnValue(makeDb(signedInRow))
    render(<ProfileScreen />)
    await open()
    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE')
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(require('expo-router').router.replace).not.toHaveBeenCalled()
  })
})

describe('ProfileScreen — Iskotify Full Access (P3)', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    Object.assign(mockPremium, { enabled: false, isPremium: false, unlimited: true })
    mockSignOutPremium.mockClear()
  })

  it('shows no Full Access row with the paywall flag off', () => {
    render(<ProfileScreen />)
    expect(screen.queryByText('Iskotify Full Access')).toBeNull()
  })

  it('with the flag on, offers the Full Access row and opens /upgrade', () => {
    Object.assign(mockPremium, { enabled: true, unlimited: false })
    const { router } = require('expo-router')
    router.push.mockClear()
    render(<ProfileScreen />)
    fireEvent.press(screen.getByText('Iskotify Full Access'))
    expect(router.push).toHaveBeenCalledWith('/upgrade?from=profile')
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('says Active when the student has Full Access', () => {
    Object.assign(mockPremium, { enabled: true, isPremium: true, unlimited: true })
    render(<ProfileScreen />)
    expect(screen.getByText('Iskotify Full Access')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('Sign Out and Reset App Data forget Full Access on this device', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((x: any) => x.style === 'destructive')?.onPress?.()
    })
    const { getByText } = render(<ProfileScreen />)
    fireEvent.press(getByText('Sign Out'))
    await waitFor(() => expect(mockSignOutPremium).toHaveBeenCalledTimes(1))
    fireEvent.press(getByText('Reset App Data'))
    await waitFor(() => expect(mockSignOutPremium).toHaveBeenCalledTimes(2))
    alertSpy.mockRestore()
  })
})

// iOS redesign P2a review: Profile is a sheet over the tabs on native. Jumping
// to a tab dismisses the sheet (never stacks a second set of tabs), leaving
// after sign-out clears the whole stack, VoiceOver gets a Done button, and
// every wipe forgets this device's recent searches.
describe('ProfileScreen — sheet navigation and wipes', () => {
  const signedInRow = {
    fullName: 'Maria Santos', school: 'UPLB', gradeLevel: 11,
    googleId: 'google-uid-123', email: 'maria@gmail.com', selectedListingSlug: '',
  }
  const confirmAll = () => jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((x: any) => x.style === 'destructive')?.onPress?.()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    const { router } = require('expo-router')
    router.canDismiss.mockReturnValue(true)
    require('../../../hooks/useDb').useDb.mockReturnValue(makeDb(signedInRow))
    mockDeleteAccount.mockResolvedValue({ ok: true })
  })

  it('native: a labelled Done button closes the sheet', () => {
    const { router } = require('expo-router')
    render(<ProfileScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(router.dismiss).toHaveBeenCalled()
  })

  it('Add more dismisses the sheet and switches to Explore (no second tab stack)', async () => {
    const { router } = require('expo-router')
    render(<ProfileScreen />)
    fireEvent.press(await screen.findByText('Add more'))
    expect(router.dismiss).toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/explore')
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)/explore')
  })

  it('Progress and analytics dismisses the sheet and switches to Progress', async () => {
    const { router } = require('expo-router')
    render(<ProfileScreen />)
    fireEvent.press(await screen.findByText('Progress and analytics'))
    expect(router.dismiss).toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/progress')
  })

  it('opened directly (nothing to dismiss), it just navigates', async () => {
    const { router } = require('expo-router')
    router.canDismiss.mockReturnValue(false)
    render(<ProfileScreen />)
    fireEvent.press(await screen.findByText('Add more'))
    expect(router.dismiss).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/explore')
  })

  it('Sign Out clears recent searches and leaves through a cleared stack', async () => {
    const { router } = require('expo-router')
    const spy = confirmAll()
    render(<ProfileScreen />)
    fireEvent.press(await screen.findByText('Sign Out'))
    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    expect(mockClearRecents).toHaveBeenCalled()
    expect(router.dismissAll).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('Reset App Data clears recent searches and leaves through a cleared stack', async () => {
    const { router } = require('expo-router')
    const spy = confirmAll()
    render(<ProfileScreen />)
    fireEvent.press(await screen.findByText('Reset App Data'))
    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    expect(mockClearRecents).toHaveBeenCalled()
    expect(router.dismissAll).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('Delete account clears recent searches', async () => {
    render(<ProfileScreen />)
    fireEvent.press(await screen.findByRole('button', { name: /^Delete account/ }))
    await screen.findByText('Delete your account?')
    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE')
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
    await waitFor(() => expect(require('expo-router').router.replace).toHaveBeenCalledWith('/landing'))
    expect(mockClearRecents).toHaveBeenCalled()
  })
})

describe('ProfileScreen — WEB wipes', () => {
  const { Platform } = require('react-native')
  let os: string
  beforeAll(() => { os = Platform.OS; Platform.OS = 'web' })
  afterAll(() => { Platform.OS = os })
  beforeEach(() => {
    jest.clearAllMocks()
    require('../../../hooks/useDb').useDb.mockReturnValue(makeDb())
    ;(global as any).window = { confirm: jest.fn(() => true) }
  })
  afterEach(() => { delete (global as any).window })

  it('Clear data & sign out forgets recent searches too', async () => {
    const { clearWebData } = require('../../../services/webReset')
    render(<ProfileScreen />)
    fireEvent.press(await screen.findByText('Clear data & sign out'))
    await waitFor(() => expect(clearWebData).toHaveBeenCalled())
    expect(mockClearRecents).toHaveBeenCalled()
  })
})
