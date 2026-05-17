import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import ProfileScreen from '../profile'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useFocusEffect: jest.fn((cb: any) => { cb(); return () => {} }),
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
}))

jest.mock('../../../services/export', () => ({
  exportUserData: jest.fn().mockResolvedValue(undefined),
}))

const makeDb = (userRow?: any) => ({
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn().mockResolvedValue(userRow ? [userRow] : []),
      })),
    })),
  })),
  update: jest.fn(() => ({
    set: jest.fn(() => ({
      where: jest.fn().mockResolvedValue(undefined),
    })),
  })),
})

jest.mock('../../../hooks/useDb', () => ({
  useDb: jest.fn(),
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

  it('renders Change Exam card', () => {
    render(<ProfileScreen />)
    expect(screen.getByText('Change Exam')).toBeTruthy()
    expect(screen.getByText('Select a different exam to study for')).toBeTruthy()
  })

  it('renders Export Data card', () => {
    render(<ProfileScreen />)
    expect(screen.getByText('Export Data')).toBeTruthy()
    expect(screen.getByText('Save your preferences as a JSON file')).toBeTruthy()
  })

  it('Google row is NOT shown when googleId is empty', () => {
    render(<ProfileScreen />)
    expect(screen.queryByText('Signed in with Google')).toBeNull()
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
      expect(screen.getByText('Signed in with Google')).toBeTruthy()
      expect(screen.getByText('maria@gmail.com')).toBeTruthy()
    })
  })
})

describe('ProfileScreen — interactions', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb())
    jest.spyOn(Alert, 'alert')
  })

  it('pressing Change Exam opens a confirmation alert', () => {
    render(<ProfileScreen />)
    fireEvent.press(screen.getByText('Change Exam'))
    expect(Alert.alert).toHaveBeenCalledWith(
      'Change Exam',
      expect.any(String),
      expect.any(Array),
    )
  })

  it('pressing Export Data calls exportUserData', async () => {
    const { exportUserData } = require('../../../services/export')
    render(<ProfileScreen />)
    fireEvent.press(screen.getByText('Export Data'))
    await waitFor(() => {
      expect(exportUserData).toHaveBeenCalled()
    })
  })
})
