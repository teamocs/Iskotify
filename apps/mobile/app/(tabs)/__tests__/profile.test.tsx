import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import ProfileScreen from '../profile'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useFocusEffect: jest.fn((cb: any) => { cb(); return () => {} }),
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
}))


jest.mock('../../../services/export', () => ({
  exportUserData: jest.fn().mockResolvedValue({ status: 'saved', filename: 'test.json' }),
}))

jest.mock('../../../services/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn().mockResolvedValue({ error: null }) },
  },
}))

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
  it('has a Back button that returns to the previous screen when there is one', () => {
    const { router } = require('expo-router')
    router.canGoBack = jest.fn(() => true)
    router.back = jest.fn()
    render(<ProfileScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(router.back).toHaveBeenCalled()
  })

  it('Back falls back to Today when Profile was opened directly (deep link / web URL)', () => {
    const { router } = require('expo-router')
    router.canGoBack = jest.fn(() => false)
    router.replace.mockClear()
    render(<ProfileScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(router.replace).toHaveBeenCalledWith('/')
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
    expect(router.push).toHaveBeenCalledWith('/(tabs)/progress')
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

  it('renders My Focus List section', () => {
    render(<ProfileScreen />)
    expect(screen.getByText('My Focus List')).toBeTruthy()
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

  it('displays the school', async () => {
    render(<ProfileScreen />)
    await waitFor(() => {
      expect(screen.getByText('UPLB')).toBeTruthy()
    })
  })

  it('displays the grade chip', async () => {
    render(<ProfileScreen />)
    await waitFor(() => {
      expect(screen.getByText('G11')).toBeTruthy()
    })
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
