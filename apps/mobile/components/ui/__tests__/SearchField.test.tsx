/**
 * SearchField (iOS redesign P3, promoted from components/explore): a named
 * field with the field radius, a 3:1 boundary, a labelled clear button and an
 * optional visible label.
 */
import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SearchField } from '../SearchField'
import { SearchField as LegacySearchField } from '../../explore/SearchField'
import { lightTheme, radius } from '../../../theme/tokens'

type ReactTestInstance = typeof screen.UNSAFE_root

/** The field frame: the nearest ancestor of the input that draws the border. */
function frameOf(input: ReactTestInstance) {
  let node: ReactTestInstance | null = input.parent
  while (node) {
    const s = StyleSheet.flatten(node.props.style ?? {}) as Record<string, unknown>
    if (typeof node.type === 'string' && s.borderWidth) return s
    node = node.parent
  }
  throw new Error('no frame')
}

describe('SearchField', () => {
  it('names the input and offers a labelled clear button only when there is text', () => {
    const onChange = jest.fn()
    const { rerender } = render(
      <SearchField value="" onChangeText={onChange} placeholder="UP Diliman" accessibilityLabel="Search schools" />,
    )
    expect(screen.getByLabelText('Search schools')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    rerender(<SearchField value="up" onChangeText={onChange} placeholder="UP Diliman" accessibilityLabel="Search schools" />)
    const clear = screen.getByRole('button', { name: 'Clear search' })
    const s = StyleSheet.flatten(typeof clear.props.style === 'function' ? clear.props.style({ pressed: false }) : clear.props.style)
    expect(s.minWidth ?? s.width).toBeGreaterThanOrEqual(44)
    expect(s.minHeight ?? s.height).toBeGreaterThanOrEqual(44)
    fireEvent.press(clear)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('draws the field radius with continuous corners and an inputBorder edge', () => {
    render(<SearchField value="" onChangeText={() => {}} placeholder="p" accessibilityLabel="Search" />)
    const frame = frameOf(screen.getByLabelText('Search'))
    expect(frame.borderRadius).toBe(radius.field)
    expect(frame.borderCurve).toBe('continuous')
    expect(frame.borderColor).toBe(lightTheme.inputBorder)
  })

  it('turns the edge to the focus colour while focused', () => {
    render(<SearchField value="" onChangeText={() => {}} placeholder="p" accessibilityLabel="Search" />)
    fireEvent(screen.getByLabelText('Search'), 'focus')
    expect(frameOf(screen.getByLabelText('Search')).borderColor).toBe(lightTheme.focusRing)
  })

  it('shows a visible label that also names the field', () => {
    render(<SearchField label="Find a school" value="" onChangeText={() => {}} placeholder="UP Diliman" />)
    expect(screen.getByText('Find a school')).toBeTruthy()
    expect(screen.getByLabelText('Find a school')).toBeTruthy()
  })

  it('submits with the keyboard search key', () => {
    const onSubmit = jest.fn()
    render(<SearchField value="x" onChangeText={() => {}} onSubmit={onSubmit} placeholder="p" accessibilityLabel="Search" />)
    fireEvent(screen.getByLabelText('Search'), 'submitEditing')
    expect(onSubmit).toHaveBeenCalled()
  })

  it('is still exported from its old path', () => {
    expect(LegacySearchField).toBe(SearchField)
  })
})
