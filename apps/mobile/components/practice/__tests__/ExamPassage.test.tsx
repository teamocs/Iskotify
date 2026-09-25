import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { ExamPassage } from '../ExamPassage'
import { aria } from '../../../test-utils/aria'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

describe('ExamPassage', () => {
  it('shows the passage expanded by default under a "Passage" heading', () => {
    render(<ExamPassage passage="Once upon a time" />)
    expect(screen.getByRole('header', { name: 'Passage' })).toBeTruthy()
    expect(screen.getByText('Once upon a time')).toBeTruthy()
  })

  it('collapses and expands with an announced state', () => {
    render(<ExamPassage passage="Once upon a time" />)
    const toggle = screen.getByRole('button', { name: 'Hide passage' })
    expect(aria(toggle, 'aria-expanded')).toBe(true)
    fireEvent.press(toggle)
    expect(screen.queryByText('Once upon a time')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show passage', expanded: false })).toBeTruthy()
  })

  it('opens a full-screen reader and closes it', () => {
    render(<ExamPassage passage="Once upon a time" />)
    fireEvent.press(screen.getByRole('button', { name: 'Read the full passage' }))
    expect(screen.getAllByText('Once upon a time').length).toBe(2)
    fireEvent.press(screen.getByRole('button', { name: 'Close passage' }))
    expect(screen.getAllByText('Once upon a time').length).toBe(1)
  })

  it('gives both controls a 44pt target', () => {
    render(<ExamPassage passage="P" />)
    for (const name of ['Hide passage', 'Read the full passage']) {
      const flat = Object.assign({}, ...[screen.getByRole('button', { name }).props.style].flat(Infinity).filter(Boolean))
      expect(flat.minHeight).toBeGreaterThanOrEqual(44)
    }
  })
})
