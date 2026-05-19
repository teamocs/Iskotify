import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import OnboardingScreen from '../onboarding'

jest.mock('../../components/SchoolPicker', () => ({
  SchoolPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const { TextInput } = require('react-native')
    return (
      <TextInput
        testID="school-picker-mock"
        value={value}
        onChangeText={onChange}
      />
    )
  },
}))

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn(() => ({
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    })),
  },
}))

jest.mock('../../services/sync', () => ({
  syncOnLaunch: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../hooks/useDb', () => ({
  useDb: () => ({
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  }),
}))

describe('OnboardingScreen — Step 1', () => {
  it('renders the step 1 heading', () => {
    render(<OnboardingScreen />)
    expect(screen.getByText('Tell us about yourself')).toBeTruthy()
  })

  it('renders Full Name and School inputs', () => {
    render(<OnboardingScreen />)
    expect(screen.getByPlaceholderText('e.g. Juan dela Cruz')).toBeTruthy()
    expect(screen.getByTestId('school-picker-mock')).toBeTruthy()
  })

  it('renders grade buttons G9 through G12', () => {
    render(<OnboardingScreen />)
    expect(screen.getByText('G9')).toBeTruthy()
    expect(screen.getByText('G10')).toBeTruthy()
    expect(screen.getByText('G11')).toBeTruthy()
    expect(screen.getByText('G12')).toBeTruthy()
  })

  it('Next button is present', () => {
    render(<OnboardingScreen />)
    expect(screen.getByText('Next →')).toBeTruthy()
  })

  it('does not navigate when form is empty', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    render(<OnboardingScreen />)
    fireEvent.press(screen.getByText('Next →'))
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('advances to step 2 after filling name and grade', () => {
    render(<OnboardingScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Juan dela Cruz'), 'Juan dela Cruz')
    fireEvent.press(screen.getByText('G11'))
    fireEvent.press(screen.getByText('Next →'))
    expect(screen.getByText(/What are you/)).toBeTruthy()
  })
})
