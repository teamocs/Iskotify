/**
 * Old tab routes keep working after the M1 restructure so deep links,
 * notifications and bookmarks don't break:
 *   /listings[?tab=x] → /explore[?section=x]
 *   /updates          → /explore?section=news
 *   /analytics        → /progress
 */
import React from 'react'
import { render } from '@testing-library/react-native'

const mockParams: { value: Record<string, string | undefined> } = { value: {} }
const mockRedirect = jest.fn()

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href)
    return null
  },
  useLocalSearchParams: () => mockParams.value,
}))

import ListingsRedirect from '../listings'
import { exploreHrefForLegacyTab } from '../../../components/navigation/destinations'
import UpdatesRedirect from '../updates'
import AnalyticsRedirect from '../analytics'

describe('legacy tab redirects', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    mockParams.value = {}
  })

  it('/listings → /explore', () => {
    render(<ListingsRedirect />)
    expect(mockRedirect).toHaveBeenCalledWith('/explore')
  })

  it('/listings?tab=scholarships → /explore?section=scholarships', () => {
    mockParams.value = { tab: 'scholarships' }
    render(<ListingsRedirect />)
    expect(mockRedirect).toHaveBeenCalledWith('/explore?section=scholarships')
  })

  it('ignores an unknown ?tab value', () => {
    expect(exploreHrefForLegacyTab('bogus')).toBe('/explore')
    expect(exploreHrefForLegacyTab(undefined)).toBe('/explore')
    expect(exploreHrefForLegacyTab('destinations')).toBe('/explore?section=destinations')
  })

  it('/updates → /explore?section=news', () => {
    render(<UpdatesRedirect />)
    expect(mockRedirect).toHaveBeenCalledWith('/explore?section=news')
  })

  it('/analytics → /progress', () => {
    render(<AnalyticsRedirect />)
    expect(mockRedirect).toHaveBeenCalledWith('/progress')
  })
})
