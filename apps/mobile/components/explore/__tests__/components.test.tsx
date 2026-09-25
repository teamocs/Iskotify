import React from 'react'
import { Text, FlatList, Linking, Platform } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}))
const mockRouter = jest.requireMock('expo-router').router

const mockBp: { value: 'compact' | 'medium' | 'expanded' } = { value: 'compact' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

import { ListingCard } from '../ListingCard'
import { SearchField } from '../SearchField'
import { DetailTopBar } from '../DetailTopBar'
import { ExploreGrid, GridSkeleton } from '../ExploreGrid'
import { Disclosure } from '../Disclosure'
import { LinkRow } from '../LinkRow'
import { aria } from '../../../test-utils/aria'

const ICON = {} as never

describe('ListingCard', () => {
  it('is one button whose name carries title, meta and every badge', () => {
    const onPress = jest.fn()
    render(
      <ListingCard
        icon={ICON}
        title="UPCAT"
        meta="Exam Aug 10, 2027 · National"
        badges={[{ label: 'In 5 days', tone: 'warning' }, { label: 'Focus #1', tone: 'accent' }]}
        onPress={onPress}
      />,
    )
    const btn = screen.getByRole('button', { name: 'UPCAT, Exam Aug 10, 2027 · National, In 5 days, Focus #1' })
    fireEvent.press(btn)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByText('In 5 days')).toBeTruthy()
  })

  it('meets the 44pt target floor', () => {
    render(<ListingCard icon={ICON} title="X" onPress={() => {}} />)
    const btn = screen.getByRole('button')
    const style = typeof btn.props.style === 'function' ? btn.props.style({ pressed: false }) : btn.props.style
    const flat = Object.assign({}, ...[style].flat(3).filter(Boolean))
    expect(flat.minHeight).toBeGreaterThanOrEqual(44)
  })
})

describe('SearchField', () => {
  it('names the input and offers a labelled clear button only when there is text', () => {
    const onChange = jest.fn()
    const { rerender } = render(
      <SearchField value="" onChangeText={onChange} placeholder="Search" accessibilityLabel="Search scholarships" />,
    )
    expect(screen.getByLabelText('Search scholarships')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()

    rerender(<SearchField value="dost" onChangeText={onChange} placeholder="Search" accessibilityLabel="Search scholarships" />)
    fireEvent.press(screen.getByRole('button', { name: 'Clear search' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('submits on the keyboard search key', () => {
    const onSubmit = jest.fn()
    render(<SearchField value="x" onChangeText={() => {}} onSubmit={onSubmit} placeholder="p" accessibilityLabel="Search" />)
    fireEvent(screen.getByLabelText('Search'), 'submitEditing')
    expect(onSubmit).toHaveBeenCalled()
  })
})

describe('DetailTopBar', () => {
  beforeEach(() => jest.clearAllMocks())

  it('goes back when there is history', () => {
    mockRouter.canGoBack.mockReturnValue(true)
    render(<DetailTopBar fallbackHref="/explore" />)
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(mockRouter.back).toHaveBeenCalled()
  })

  it('falls back to its parent route after a deep link or web refresh', () => {
    mockRouter.canGoBack.mockReturnValue(false)
    render(<DetailTopBar fallbackHref="/explore?section=scholarships" />)
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(mockRouter.replace).toHaveBeenCalledWith('/explore?section=scholarships')
  })

  it('renders its title as the screen header when given one', () => {
    render(<DetailTopBar title="Requirements" fallbackHref="/" />)
    expect(screen.getByRole('header', { name: 'Requirements' })).toBeTruthy()
  })
})

describe('ExploreGrid', () => {
  const data = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const renderGrid = () => render(
    <ExploreGrid
      testID="grid"
      data={data}
      keyExtractor={i => i.id}
      renderItem={i => <Text>{`item-${i.id}`}</Text>}
    />,
  )

  it.each([
    ['compact', 1],
    ['medium', 2],
    ['expanded', 3],
  ] as const)('uses %s → %i columns', (bp, cols) => {
    mockBp.value = bp
    renderGrid()
    const list = screen.UNSAFE_getAllByType(FlatList).find(l => l.props.testID === 'grid')!
    expect(list.props.numColumns).toBe(cols)
    expect(screen.getByText('item-c')).toBeTruthy()
  })

  it('announces a skeleton once, as busy', () => {
    mockBp.value = 'compact'
    render(<GridSkeleton label="Loading scholarships" />)
    const sk = screen.getByTestId('explore-skeleton')
    expect(sk.props.accessibilityLabel).toBe('Loading scholarships')
    expect(aria(sk, 'aria-busy')).toBe(true)
  })
})

describe('Disclosure', () => {
  it('is a 44pt button that exposes expanded state and reveals its body', () => {
    render(<Disclosure title="About" preview="Short text"><Text>BODY</Text></Disclosure>)
    const btn = screen.getByRole('button', { name: 'About' })
    expect(aria(btn, 'aria-expanded')).toBe(false)
    expect(screen.queryByText('BODY')).toBeNull()
    fireEvent.press(btn)
    expect(screen.getByRole('button', { name: 'About', expanded: true })).toBeTruthy()
    expect(screen.getByText('BODY')).toBeTruthy()
  })
})

describe('LinkRow', () => {
  const originalOS = Platform.OS
  // jest-expo's Linking.openURL is already a jest.fn, so spyOn hands back that
  // same mock: clear its calls between tests, not just restore it.
  afterEach(() => {
    Platform.OS = originalOS
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it('is a link, named for where it goes, that opens the URL on native', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never)
    render(<LinkRow label="Official website" url="https://up.edu.ph" />)
    const link = screen.getByRole('link', { name: 'Official website, opens in your browser' })
    expect(link.props.href).toBeUndefined()
    fireEvent.press(link)
    expect(open).toHaveBeenCalledWith('https://up.edu.ph')
  })

  it('on web is a real anchor: href, new tab, no opener', () => {
    Platform.OS = 'web'
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never)
    render(<LinkRow label="Official website" url="https://up.edu.ph" />)
    const link = screen.getByRole('link', { name: 'Official website, opens in your browser' })
    expect(link.props.href).toBe('https://up.edu.ph')
    expect(link.props.hrefAttrs).toEqual({ target: '_blank', rel: 'noopener noreferrer' })
    // The browser follows the href itself; no scripted open on top of it.
    fireEvent.press(link)
    expect(open).not.toHaveBeenCalled()
  })
})
