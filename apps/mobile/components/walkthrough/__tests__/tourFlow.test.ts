import {
  TOUR_CARDS, afterOnboardingHref, tourExit, tourPositionLabel, keyAction, swipeAction, parseTourSource,
} from '../tourFlow'

describe('tour cards', () => {
  it('has six cards: the idea, the four tabs in tab-bar order, then ready', () => {
    expect(TOUR_CARDS.map(c => c.id)).toEqual(['welcome', 'today', 'practice', 'explore', 'progress', 'ready'])
  })

  it('only the tab cards offer "Take me there", each to its own tab', () => {
    const withTarget = TOUR_CARDS.filter(c => c.href).map(c => [c.id, c.href])
    expect(withTarget).toEqual([
      ['today', '/(tabs)'], ['practice', '/practice'], ['explore', '/explore'], ['progress', '/progress'],
    ])
  })

  it('every card has a one-line title and exactly two short body lines', () => {
    for (const c of TOUR_CARDS) {
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.title.length).toBeLessThanOrEqual(40)
      expect(c.body).toHaveLength(2)
      for (const line of c.body) expect(line.length).toBeLessThanOrEqual(80)
    }
  })

  it('the Practice card says mock exams save as you go', () => {
    const practice = TOUR_CARDS.find(c => c.id === 'practice')!
    expect(practice.body.join(' ')).toMatch(/mock/i)
    expect(practice.body.join(' ')).toMatch(/save/i)
  })

  it('never promises admission or uses pass/fail language', () => {
    const all = TOUR_CARDS.flatMap(c => [c.title, ...c.body]).join(' ')
    expect(all).not.toMatch(/will qualify|your UPG is|\bpass\b|\bfail\b|guarantee/i)
  })
})

describe('tourPositionLabel', () => {
  it('reads "n of N" for the announcement', () => {
    expect(tourPositionLabel(0)).toBe('1 of 6')
    expect(tourPositionLabel(5)).toBe('6 of 6')
  })
})

describe('afterOnboardingHref: the tour shows once', () => {
  it('first finish of onboarding opens the tour', () => {
    expect(afterOnboardingHref(0)).toBe('/tour?from=onboarding')
    expect(afterOnboardingHref(null)).toBe('/tour?from=onboarding')
  })

  it('once seen, finishing goes straight to Today', () => {
    expect(afterOnboardingHref(1_758_000_000_000)).toBe('/(tabs)')
  })
})

describe('parseTourSource', () => {
  it('reads the from= param and defaults to a replay', () => {
    expect(parseTourSource('onboarding')).toBe('onboarding')
    expect(parseTourSource('help')).toBe('help')
    expect(parseTourSource('settings')).toBe('settings')
    expect(parseTourSource(undefined)).toBe('replay')
    expect(parseTourSource(['onboarding'])).toBe('onboarding')
    expect(parseTourSource('evil')).toBe('replay')
  })
})

describe('tourExit', () => {
  it('after onboarding there is nothing behind the tour: replace', () => {
    expect(tourExit('onboarding', 'skip')).toEqual({ method: 'replace', href: '/(tabs)' })
    expect(tourExit('onboarding', 'finish')).toEqual({ method: 'replace', href: '/(tabs)' })
    expect(tourExit('onboarding', '/practice')).toEqual({ method: 'replace', href: '/practice' })
  })

  it('a replay from Help closes back to Help on Skip', () => {
    expect(tourExit('help', 'skip')).toEqual({ method: 'back', href: '/(tabs)' })
  })

  it('a replay goes to the tab without piling screens on the stack', () => {
    expect(tourExit('help', '/explore')).toEqual({ method: 'dismissTo', href: '/explore' })
    expect(tourExit('replay', 'finish')).toEqual({ method: 'dismissTo', href: '/(tabs)' })
  })
})

describe('keyAction (web arrow keys)', () => {
  it('maps arrows to next/back and ignores everything else', () => {
    expect(keyAction('ArrowRight')).toBe('next')
    expect(keyAction('ArrowLeft')).toBe('back')
    expect(keyAction('Enter')).toBeNull()
    expect(keyAction('a')).toBeNull()
  })
})

describe('swipeAction (native)', () => {
  it('a clear horizontal swipe left is next, right is back', () => {
    expect(swipeAction(-80, 5)).toBe('next')
    expect(swipeAction(90, -10)).toBe('back')
  })

  it('short or mostly vertical drags do nothing (scrolling stays scrolling)', () => {
    expect(swipeAction(-30, 0)).toBeNull()
    expect(swipeAction(-80, 120)).toBeNull()
  })

  it('a fast flick counts even when short', () => {
    expect(swipeAction(-30, 0, -0.9)).toBe('next')
  })
})
