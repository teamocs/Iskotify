import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SchoolPicker } from '../SchoolPicker'

jest.mock('../../hooks/useSchoolSearch', () => ({
  useSchoolSearch: jest.fn(),
}))

const mockUseSchoolSearch = require('../../hooks/useSchoolSearch').useSchoolSearch

function makeState(overrides = {}) {
  return {
    query: '',
    setQuery: jest.fn(),
    results: [],
    loading: false,
    error: false,
    retry: jest.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  mockUseSchoolSearch.mockReturnValue(makeState())
})

describe('SchoolPicker — trigger', () => {
  it('shows placeholder when no value', () => {
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    expect(screen.getByText('Search your school...')).toBeTruthy()
  })

  it('shows selected school name when value is set', () => {
    render(<SchoolPicker value="San Beda University" onChange={jest.fn()} />)
    expect(screen.getByText('San Beda University')).toBeTruthy()
  })
})

describe('SchoolPicker — modal', () => {
  it('opens on trigger press and shows title and search input', () => {
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByText('School / University')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search schools...')).toBeTruthy()
  })

  it('shows hint when query is empty', () => {
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByText('Type at least 3 characters to search')).toBeTruthy()
  })

  it('shows spinner when loading=true', () => {
    mockUseSchoolSearch.mockReturnValue(makeState({ query: 'san', loading: true }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByTestId('school-search-loading')).toBeTruthy()
  })

  it('shows error message and Retry button when error=true', () => {
    mockUseSchoolSearch.mockReturnValue(makeState({ query: 'san', error: true }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByText(/Could not search schools/)).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('calls retry when Retry button is pressed', () => {
    const retry = jest.fn()
    mockUseSchoolSearch.mockReturnValue(makeState({ query: 'san', error: true, retry }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    fireEvent.press(screen.getByText('Retry'))
    expect(retry).toHaveBeenCalled()
  })

  it('shows result rows with name and subtitle', () => {
    mockUseSchoolSearch.mockReturnValue(makeState({
      query: 'san',
      results: [
        { name: 'San Beda University', subtitle: 'Mendiola, Manila, Philippines' },
      ],
    }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByText('San Beda University')).toBeTruthy()
    expect(screen.getByText('Mendiola, Manila, Philippines')).toBeTruthy()
  })

  it('calls onChange with result.name on row press', () => {
    const onChange = jest.fn()
    mockUseSchoolSearch.mockReturnValue(makeState({
      query: 'san',
      results: [{ name: 'San Beda University', subtitle: 'Mendiola, Manila, Philippines' }],
    }))
    render(<SchoolPicker value="" onChange={onChange} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    fireEvent.press(screen.getByText('San Beda University'))
    expect(onChange).toHaveBeenCalledWith('San Beda University')
  })

  it('shows "No schools found." when results are empty and query >= 3 chars', () => {
    mockUseSchoolSearch.mockReturnValue(makeState({ query: 'xyz', results: [] }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByText('No schools found.')).toBeTruthy()
  })

  it('shows "Use what I typed" fallback when query >= 1 char', () => {
    mockUseSchoolSearch.mockReturnValue(makeState({ query: 'xyz school' }))
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.getByText(/Use "xyz school"/)).toBeTruthy()
  })

  it('does NOT show "Use what I typed" fallback when query is empty', () => {
    render(<SchoolPicker value="" onChange={jest.fn()} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    expect(screen.queryByText(/Can't find your school/)).toBeNull()
  })

  it('calls onChange with raw query when "Use what I typed" is pressed', () => {
    const onChange = jest.fn()
    mockUseSchoolSearch.mockReturnValue(makeState({ query: 'My Custom School' }))
    render(<SchoolPicker value="" onChange={onChange} />)
    fireEvent.press(screen.getByTestId('school-picker-trigger'))
    fireEvent.press(screen.getByText(/Use "My Custom School"/))
    expect(onChange).toHaveBeenCalledWith('My Custom School')
  })
})
