import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SchoolPicker } from '../SchoolPicker'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

jest.mock('../../hooks/useSchoolPicker', () => ({
  useSchoolPicker: jest.fn(),
}))

const mockUseSchoolPicker = require('../../hooks/useSchoolPicker').useSchoolPicker

function makeState(overrides = {}) {
  return {
    level: 'region',
    list: ['NCR', 'Region I - Ilocos Region'],
    selectedRegion: null,
    selectedProvince: null,
    selectedCity: null,
    loading: false,
    error: null,
    selectRegion: jest.fn().mockResolvedValue(undefined),
    selectProvince: jest.fn(),
    selectCity: jest.fn(),
    jumpToLevel: jest.fn(),
    reset: jest.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  mockUseSchoolPicker.mockReturnValue(makeState())
})

describe('SchoolPicker — trigger', () => {
  it('shows placeholder when no value', () => {
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    expect(screen.getByText('Search your school...')).toBeTruthy()
  })

  it('shows selected school name', () => {
    render(<SchoolPicker value="Makati High School" onChange={jest.fn()} />)
    expect(screen.getByText('Makati High School')).toBeTruthy()
  })
})

describe('SchoolPicker — modal navigation', () => {
  it('opens modal on trigger press and shows region list', () => {
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByText('Select your school')).toBeTruthy()
    expect(screen.getByText('NCR')).toBeTruthy()
    expect(screen.getByText('Region I - Ilocos Region')).toBeTruthy()
  })

  it('calls selectRegion when a region is tapped', () => {
    const state = makeState()
    mockUseSchoolPicker.mockReturnValue(state)
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    fireEvent.press(screen.getByText('NCR'))
    expect(state.selectRegion).toHaveBeenCalledWith('NCR')
  })

  it('calls selectProvince when a province is tapped', () => {
    const state = makeState({
      level: 'province',
      list: ['Metro Manila'],
      selectedRegion: 'NCR',
    })
    mockUseSchoolPicker.mockReturnValue(state)
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    fireEvent.press(screen.getByText('Metro Manila'))
    expect(state.selectProvince).toHaveBeenCalledWith('Metro Manila')
  })

  it('calls onChange and closes modal when school is selected', () => {
    const onChange = jest.fn()
    mockUseSchoolPicker.mockReturnValue(makeState({
      level: 'school',
      list: ['Makati High School'],
      selectedRegion: 'NCR',
      selectedProvince: 'Metro Manila',
      selectedCity: 'Makati City',
    }))
    render(<SchoolPicker value="" onChange={onChange} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    fireEvent.press(screen.getByText('Makati High School'))
    expect(onChange).toHaveBeenCalledWith('Makati High School')
  })

  it('shows Others option only at school level', () => {
    mockUseSchoolPicker.mockReturnValue(makeState({
      level: 'school',
      list: ['Some School'],
      selectedRegion: 'NCR',
      selectedProvince: 'Metro Manila',
      selectedCity: 'Makati City',
    }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByText('Others — type my school name')).toBeTruthy()
  })

  it('does NOT show Others at region level', () => {
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.queryByText('Others — type my school name')).toBeNull()
  })
})

describe('SchoolPicker — Others fallback', () => {
  it('shows freetext input when Others is selected', () => {
    mockUseSchoolPicker.mockReturnValue(makeState({
      level: 'school',
      list: [],
      selectedRegion: 'NCR',
      selectedProvince: 'MM',
      selectedCity: 'Makati City',
    }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    fireEvent.press(screen.getByText('Others — type my school name'))
    expect(screen.getByPlaceholderText('Type your school name')).toBeTruthy()
  })
})

describe('SchoolPicker — loading state', () => {
  it('shows activity indicator when loading', () => {
    mockUseSchoolPicker.mockReturnValue(makeState({ loading: true, list: [] }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByTestId('school-picker-loading')).toBeTruthy()
  })
})
