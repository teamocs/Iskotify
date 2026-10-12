/**
 * Route hygiene (iOS redesign P2a): Profile and the legacy redirects live at
 * the root, outside the tab navigator, with the same URLs; Search is a tab
 * route but not one of the four drawn destinations.
 */
import fs from 'fs'
import path from 'path'
import { profileScreenOptions } from '../profileSheet'
import {
  SEARCH_DESTINATION, TAB_DESTINATIONS, LEGACY_ROUTE_OWNER, activeDestination, destinationForRoute,
} from '../destinations'

const app = path.join(__dirname, '..', '..', '..', 'app')
const exists = (rel: string) => fs.existsSync(path.join(app, rel))

describe('route files', () => {
  it.each([
    ['profile/index.tsx', '/profile'],
    ['listings/index.tsx', '/listings'],
    ['updates.tsx', '/updates'],
    ['analytics.tsx', '/analytics'],
    ['(tabs)/search.tsx', '/search'],
  ])('app/%s serves %s', rel => {
    expect(exists(rel)).toBe(true)
  })

  it.each(['profile', 'listings', 'updates', 'analytics'])('(tabs)/%s.tsx is gone (no duplicate route for the URL)', name => {
    expect(exists(`(tabs)/${name}.tsx`)).toBe(false)
  })

  it('nothing links to the old /(tabs)/profile path', () => {
    const root = path.join(__dirname, '..', '..', '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.') || e.name === 'dist') continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.(tsx?|json)$/.test(e.name) && fs.readFileSync(full, 'utf8').includes('(tabs)/profile')) hits.push(full)
      }
    }
    for (const d of ['app', 'components', 'services', 'hooks', 'lib', 'utils']) walk(path.join(root, d))
    expect(hits).toEqual([])
  })
})

describe('Profile presentation', () => {
  it('is a half-height formSheet with a grabber and the 28pt corner on native', () => {
    for (const os of ['ios', 'android']) {
      expect(profileScreenOptions(os)).toEqual({
        presentation: 'formSheet', sheetAllowedDetents: [0.5, 1], sheetGrabberVisible: true, sheetCornerRadius: 28,
      })
    }
  })

  it('is a plain push on web', () => {
    expect(profileScreenOptions('web')).toEqual({})
  })
})

describe('destinations', () => {
  it('keeps four drawn tabs; Search is separate', () => {
    expect(TAB_DESTINATIONS).toHaveLength(4)
    expect(TAB_DESTINATIONS.some(d => d.name === 'search')).toBe(false)
    expect(SEARCH_DESTINATION).toMatchObject({ name: 'search', label: 'Search', href: '/search' })
  })

  it('maps the search route and pathname to search, legacy routes to their owners', () => {
    expect(destinationForRoute('search')).toBe('search')
    expect(activeDestination('/search')).toBe('search')
    expect(LEGACY_ROUTE_OWNER).toEqual({ listings: 'explore', updates: 'explore', analytics: 'progress' })
    expect(activeDestination('/listings')).toBe('explore')
  })
})
