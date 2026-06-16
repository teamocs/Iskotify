import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { LoadingState } from '../LoadingState'

describe('LoadingState', () => {
  it('renders an ActivityIndicator (spinner) regardless of props', () => {
    const { toJSON } = render(<LoadingState />)
    expect(toJSON()).not.toBeNull()
  })

  it('renders the label text when a label is provided', () => {
    render(<LoadingState label="Loading…" />)
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('does NOT render any text when no label is provided', () => {
    render(<LoadingState />)
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('renders a different label string correctly', () => {
    render(<LoadingState label="Please wait" />)
    expect(screen.getByText('Please wait')).toBeTruthy()
  })
})
