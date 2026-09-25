/**
 * Card, ListRow, Chip/FilterChip, Badge, SectionHeader (header role),
 * ProgressBar, StatNumber, Avatar — render + accessibility contract.
 */
import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Card } from '../Card'
import { ListRow } from '../ListRow'
import { Chip, FilterChip } from '../Chip'
import { Badge } from '../Badge'
import { SectionHeader } from '../SectionHeader'
import { ProgressBar } from '../ProgressBar'
import { StatNumber } from '../StatNumber'
import { Avatar, initialsFor } from '../Avatar'
import { aria } from '../../../test-utils/aria'

describe('Card', () => {
  it('is a plain container by default (not announced as a button)', () => {
    render(<Card><Text>Body</Text></Card>)
    expect(screen.getByText('Body')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('becomes a labelled button when onPress is given', () => {
    const onPress = jest.fn()
    render(<Card onPress={onPress} accessibilityLabel="Resume UPCAT mock"><Text>Resume</Text></Card>)
    fireEvent.press(screen.getByRole('button', { name: 'Resume UPCAT mock' }))
    expect(onPress).toHaveBeenCalled()
  })

  it('declares elevation once: an elevated card has a shadow and no border', () => {
    render(<Card elevated testID="c"><Text>x</Text></Card>)
    const style = StyleSheet.flatten(screen.getByTestId('c').props.style)
    expect(style.boxShadow).toBeTruthy()
    expect(style.borderWidth ?? 0).toBe(0)
  })
})

describe('ListRow', () => {
  it('renders title and subtitle', () => {
    render(<ListRow title="UPCAT" subtitle="Aug 2027 · UP System" />)
    expect(screen.getByText('UPCAT')).toBeTruthy()
    expect(screen.getByText('Aug 2027 · UP System')).toBeTruthy()
  })

  it('is a button named by title and subtitle when pressable, with a chevron', () => {
    const onPress = jest.fn()
    render(<ListRow title="DOST-SEI" subtitle="Deadline Sep 30" onPress={onPress} />)
    const row = screen.getByRole('button', { name: 'DOST-SEI, Deadline Sep 30' })
    fireEvent.press(row)
    expect(onPress).toHaveBeenCalled()
    expect(screen.getByTestId('list-row-chevron', { includeHiddenElements: true })).toBeTruthy()
  })

  it('has no chevron and no button role when not pressable', () => {
    render(<ListRow title="Static" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('list-row-chevron', { includeHiddenElements: true })).toBeNull()
  })

  it('renders leading and trailing nodes and keeps a 44pt+ target', () => {
    render(
      <ListRow
        title="Row"
        onPress={() => {}}
        leading={<Text testID="lead">L</Text>}
        trailing={<Text testID="trail">T</Text>}
      />,
    )
    expect(screen.getByTestId('lead', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByTestId('trail', { includeHiddenElements: true })).toBeTruthy()
    const style = screen.getByRole('button').props.style
    const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style)
    expect(flat.minHeight).toBeGreaterThanOrEqual(44)
  })
})

describe('Chip / FilterChip', () => {
  it('Chip is static text, not a control', () => {
    render(<Chip label="STEM" />)
    expect(screen.getByText('STEM')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('single-select FilterChip is a radio exposing checked', () => {
    const onPress = jest.fn()
    render(<FilterChip label="Scholarships" selected onPress={onPress} />)
    const chip = screen.getByRole('radio', { name: 'Scholarships' })
    expect(aria(chip, 'aria-checked')).toBe(true)
    fireEvent.press(chip)
    expect(onPress).toHaveBeenCalled()
  })

  it('multi-select FilterChip is a checkbox exposing checked', () => {
    render(<FilterChip label="NCR" mode="multiple" selected={false} onPress={() => {}} />)
    const chip = screen.getByRole('checkbox', { name: 'NCR' })
    expect(aria(chip, 'aria-checked')).toBe(false)
  })

  it('can act as a tab inside a tablist', () => {
    render(<FilterChip label="News & dates" role="tab" selected onPress={() => {}} />)
    const tab = screen.getByRole('tab', { name: 'News & dates' })
    expect(aria(tab, 'aria-selected')).toBe(true)
  })

  it('selected state is never colour-only: a check glyph marks it', () => {
    const { rerender } = render(<FilterChip label="NCR" mode="multiple" selected onPress={() => {}} />)
    expect(screen.getByTestId('filter-chip-check', { includeHiddenElements: true })).toBeTruthy()
    rerender(<FilterChip label="NCR" mode="multiple" selected={false} onPress={() => {}} />)
    expect(screen.queryByTestId('filter-chip-check', { includeHiddenElements: true })).toBeNull()
  })
})

describe('Badge', () => {
  it('always carries text (never colour-only)', () => {
    render(<Badge label="Due today" tone="warning" />)
    expect(screen.getByText('Due today')).toBeTruthy()
  })

  it('status tones use the *Strong text token on their own tint (DESIGN.md)', () => {
    render(<Badge label="Eligible" tone="success" />)
    const style = StyleSheet.flatten(screen.getByText('Eligible').props.style)
    // themeContextMock (dark) successStrong
    expect(style.color).toBe('#4ade80')
  })
})

describe('SectionHeader', () => {
  it('exposes the title as a header for screen-reader navigation', () => {
    render(<SectionHeader title="Today's plan" />)
    expect(screen.getByRole('header', { name: "Today's plan" })).toBeTruthy()
  })
})

describe('ProgressBar', () => {
  it('is a progressbar with min/max/now and a name', () => {
    render(<ProgressBar value={0.42} label="Science readiness" />)
    const bar = screen.getByLabelText('Science readiness')
    expect(bar.props.accessibilityRole).toBe('progressbar')
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 })
  })

  it('clamps out-of-range values', () => {
    const { rerender } = render(<ProgressBar value={1.7} label="p" />)
    expect(screen.getByLabelText('p').props.accessibilityValue.now).toBe(100)
    rerender(<ProgressBar value={-3} label="p" />)
    expect(screen.getByLabelText('p').props.accessibilityValue.now).toBe(0)
  })
})

describe('StatNumber', () => {
  it('renders a tabular number with its label and reads as one phrase', () => {
    render(<StatNumber value="38/50" label="Last mock" />)
    const num = screen.getByText('38/50')
    expect(StyleSheet.flatten(num.props.style).fontVariant).toEqual(['tabular-nums'])
    expect(screen.getByLabelText('Last mock: 38/50')).toBeTruthy()
  })

  it('includes the unit in the spoken label', () => {
    render(<StatNumber value={12} unit="days" label="Until UPCAT" />)
    expect(screen.getByLabelText('Until UPCAT: 12 days')).toBeTruthy()
  })
})

describe('Avatar', () => {
  it('derives initials from a full name', () => {
    expect(initialsFor('Juan Dela Cruz')).toBe('JC')
    expect(initialsFor('maria')).toBe('M')
    expect(initialsFor('  ')).toBe('')
    expect(initialsFor(undefined)).toBe('')
  })

  it('shows initials and is decorative when not pressable', () => {
    render(<Avatar name="Ana Reyes" />)
    expect(screen.getByText('AR', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is a named button with a 44pt+ target when pressable', () => {
    const onPress = jest.fn()
    render(<Avatar name="Ana Reyes" size={32} onPress={onPress} accessibilityLabel="Profile" />)
    const btn = screen.getByRole('button', { name: 'Profile' })
    fireEvent.press(btn)
    expect(onPress).toHaveBeenCalled()
    const style = btn.props.style
    const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style)
    expect(flat.minWidth).toBeGreaterThanOrEqual(44)
    expect(flat.minHeight).toBeGreaterThanOrEqual(44)
  })

  it('falls back to a person glyph when there is no name', () => {
    render(<Avatar />)
    expect(screen.getByTestId('avatar-fallback-icon', { includeHiddenElements: true })).toBeTruthy()
  })
})
