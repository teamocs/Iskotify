import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { NoteCard } from '../NoteCard'
import { aria } from '../../../test-utils/aria'
import type { Note } from '../../../hooks/useNotes'

// ARIA review: aria-selected is not a valid state on role="button". In bulk
// selection the card behaves as a checkbox (the app's multi-select
// convention); outside selection it is a plain button with no selected state.

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const NOTE: Note = {
  id: 'n1', title: 'Physics formulas', content: 'F = ma', type: 'text', color: null,
  isPinned: false, isArchived: false, isTrashed: false, trashedAt: null, reminderAt: null,
  createdAt: 1, updatedAt: 1,
}

describe('NoteCard', () => {
  it('outside selection mode is a button with no selected/checked state', () => {
    const onPress = jest.fn()
    render(<NoteCard note={NOTE} onPress={onPress} />)
    const card = screen.getByRole('button', { name: 'Physics formulas' })
    expect(aria(card, 'aria-selected')).toBeUndefined()
    expect(aria(card, 'aria-checked')).toBeUndefined()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.press(card)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('in selection mode is a checkbox whose aria-checked follows `selected`', () => {
    const onPress = jest.fn()
    const { rerender } = render(<NoteCard note={NOTE} onPress={onPress} selected={false} />)
    let box = screen.getByRole('checkbox', { name: 'Physics formulas' })
    expect(aria(box, 'aria-checked')).toBe(false)
    expect(aria(box, 'aria-selected')).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Physics formulas' })).toBeNull()

    rerender(<NoteCard note={NOTE} onPress={onPress} selected />)
    box = screen.getByRole('checkbox', { name: 'Physics formulas' })
    expect(aria(box, 'aria-checked')).toBe(true)
    expect(aria(box, 'aria-selected')).toBeUndefined()
    fireEvent.press(box)
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
