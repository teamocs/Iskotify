// iOS redesign P4: Explore's row, rail and featured card.
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { ListingCard } from '../ListingCard'
import { SectionRail } from '../SectionRail'
import { FeaturedCard } from '../FeaturedCard'
import { PressableScale } from '../../ui/Pressable'
import { aria } from '../../../test-utils/aria'

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const DAY = 86_400_000

describe('ListingCard (the grouped row)', () => {
  it('names the official source only when given, and presses through PressableScale', () => {
    const onPress = jest.fn()
    const { rerender } = render(<ListingCard title="DOST" meta="DOST-SEI · Apply by Oct 20, 2026" source="Official site: sei.dost.gov.ph" onPress={onPress} />)
    expect(screen.getByText('Official site: sei.dost.gov.ph')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'DOST, DOST-SEI · Apply by Oct 20, 2026, Official site: sei.dost.gov.ph' })).toBeTruthy()
    expect(screen.UNSAFE_getAllByType(PressableScale)).toHaveLength(1)
    fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalled()

    rerender(<ListingCard title="DOST" meta="DOST-SEI" source={null} onPress={onPress} />)
    expect(screen.queryByText(/Official site/)).toBeNull()
  })

  it('grows with Dynamic Type: a minHeight, never a fixed height', () => {
    render(<ListingCard title="X" onPress={() => {}} />)
    const style = Object.assign({}, ...[screen.getByRole('button').props.style].flat(3).filter(Boolean))
    expect(style.minHeight).toBeGreaterThanOrEqual(44)
    expect(style.height).toBeUndefined()
  })
})

describe('SectionRail', () => {
  const SECTIONS = [
    { key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }, { key: 'c', label: 'Gamma' }, { key: 'd', label: 'Delta' },
  ] as const

  it('is a horizontally scrolling tablist; the selected tab is aria-selected and changes on press', () => {
    const onChange = jest.fn()
    render(<SectionRail testID="rail" sections={SECTIONS} value="a" onChange={onChange} accessibilityLabel="Sections" />)
    expect(screen.getByTestId('rail').props.accessibilityRole).toBe('tablist')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(t => aria(t, 'aria-selected'))).toEqual([true, false, false, false])
    fireEvent.press(screen.getByRole('tab', { name: 'Gamma' }))
    expect(onChange).toHaveBeenCalledWith('c')
    // Pressing the selected tab does nothing.
    fireEvent.press(screen.getByRole('tab', { name: 'Alpha' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('FeaturedCard', () => {
  const deadline = Date.now() + 8 * DAY

  it('shows a "Closes {date}" capsule, the calm relative time and the exact date', () => {
    render(<FeaturedCard eyebrow="Next scholarship deadline" title="DOST-SEI" deadline={deadline} provider="DOST-SEI" onPress={() => {}} />)
    expect(screen.getByText(/^Closes [A-Z][a-z]{2} \d{1,2}$/)).toBeTruthy()
    expect(screen.getByText(/^In 8 days · DOST-SEI · Apply by /)).toBeTruthy()
  })

  it('names the official source only when the listing has an external_url', () => {
    const { rerender } = render(<FeaturedCard eyebrow="E" title="T" deadline={deadline} externalUrl="https://www.ched.gov.ph/x" onPress={() => {}} />)
    expect(screen.getByText('Official site: ched.gov.ph')).toBeTruthy()
    rerender(<FeaturedCard eyebrow="E" title="T" deadline={deadline} externalUrl="" onPress={() => {}} />)
    expect(screen.queryByText(/Official site/)).toBeNull()
  })

  it('is one button on the ink ground with the 22pt card radius', () => {
    const onPress = jest.fn()
    render(<FeaturedCard eyebrow="E" title="T" deadline={deadline} onPress={onPress} />)
    const card = screen.getByTestId('featured-card')
    const style = Object.assign({}, ...[card.props.style].flat(3).filter(Boolean))
    expect(style.borderRadius).toBe(22)
    expect(style.backgroundColor).toBe('#2d0a0a')
    fireEvent.press(card)
    expect(onPress).toHaveBeenCalled()
  })
})
