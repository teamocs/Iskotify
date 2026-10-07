import React from 'react'
import { Linking } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { NewsDetailModal } from '../NewsDetailModal'
import type { FeedItem } from '../../../utils/admissionsFeed'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const item = (sources: unknown): FeedItem => ({
  id: 'n1', reportDate: '2026-06-14', severity: 'urgent', title: 'PUPCET deadline moved', body: 'Body',
  eventDate: null, eventType: null, schoolName: 'PUP — PUPCET', actionRequired: null, sources,
}) as FeedItem

describe('NewsDetailModal sources', () => {
  let openURL: jest.SpyInstance
  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  })
  afterEach(() => openURL.mockRestore())

  it('shows {label, url} links and opens them', () => {
    render(<NewsDetailModal item={item([{ label: 'pup.edu.ph', url: 'https://www.pup.edu.ph/iapply' }])} onClose={jest.fn()} />)
    fireEvent.press(screen.getByText('pup.edu.ph'))
    expect(openURL).toHaveBeenCalledWith('https://www.pup.edu.ph/iapply')
  })

  it('also shows plain URL strings (older rows) as links', () => {
    render(<NewsDetailModal item={item(['https://www.up.edu.ph/upcat'])} onClose={jest.fn()} />)
    fireEvent.press(screen.getByText('up.edu.ph'))
    expect(openURL).toHaveBeenCalledWith('https://www.up.edu.ph/upcat')
  })

  it('never shows or opens a non-http(s) link', () => {
    render(<NewsDetailModal item={item(['javascript:alert(1)', { label: 'Tap me', url: 'intent://x#Intent;end' }])} onClose={jest.fn()} />)
    expect(screen.queryByText('SOURCES')).toBeNull()
    expect(screen.queryByText('Tap me')).toBeNull()
    expect(openURL).not.toHaveBeenCalled()
  })
})
