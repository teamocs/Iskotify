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

// Mock AnalyticsDashboard so profile tests don't need its full dependency tree
jest.mock('../../../components/analytics/AnalyticsDashboard', () => ({
  AnalyticsDashboard: () => null,
}))

jest.mock('../../../services/export', () => ({
  exportUserData: jest.fn().mockResolvedValue({ status: 'saved', filename: 'test.json' }),
}))

jest.mock('../../../services/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn().mockResolvedValue({ error: null }) },
  },
}))

const makeTx = () => ({
  delete: jest.fn(() => ({ run: jest.fn() })),
})

const makeDb = (userRow?: any) => ({
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      leftJoin: jest.fn(() => ({
        orderBy: jest.fn().mockResolvedValue([]),
      })),
      where: jest.fn(() => ({
        limit: jest.fn().mockResolvedValue(userRow ? [userRow] : []),
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

  it('shows default name Student when no data', () => {
    render(<ProfileScreen />)
    expect(screen.getByText('Student')).toBeTruthy()
  })

  it('shows default listing title', () => {
    render(<ProfileScreen />)
    expect(screen.getByText('No exam selected')).toBeTruthy()
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
})
