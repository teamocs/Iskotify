import {
  breakpointForWidth,
  gridItemWidth,
  pagePadding,
  contentMaxWidth,
  columnCount,
  isCompact,
} from '../useBreakpoint'

// M1 responsive system: compact < 600, medium 600–1023, expanded >= 1024
// (Material 3 window-size classes; web-aware via useWindowDimensions).
describe('breakpointForWidth', () => {
  it('returns compact below 600', () => {
    expect(breakpointForWidth(0)).toBe('compact')
    expect(breakpointForWidth(360)).toBe('compact')
    expect(breakpointForWidth(390)).toBe('compact')
    expect(breakpointForWidth(599)).toBe('compact')
  })

  it('returns medium at exactly 600 (lower boundary)', () => {
    expect(breakpointForWidth(600)).toBe('medium')
  })

  it('returns medium through 1023 (tablet portrait, e.g. 820)', () => {
    expect(breakpointForWidth(768)).toBe('medium')
    expect(breakpointForWidth(820)).toBe('medium')
    expect(breakpointForWidth(1023)).toBe('medium')
  })

  it('returns expanded at exactly 1024 and above (desktop, e.g. 1440)', () => {
    expect(breakpointForWidth(1024)).toBe('expanded')
    expect(breakpointForWidth(1440)).toBe('expanded')
    expect(breakpointForWidth(2560)).toBe('expanded')
  })

  it('treats non-finite or negative widths as compact (defensive)', () => {
    expect(breakpointForWidth(Number.NaN)).toBe('compact')
    expect(breakpointForWidth(-1)).toBe('compact')
  })
})

describe('isCompact', () => {
  it('is true only for compact', () => {
    expect(isCompact('compact')).toBe(true)
    expect(isCompact('medium')).toBe(false)
    expect(isCompact('expanded')).toBe(false)
  })
})

describe('gridItemWidth', () => {
  it('returns 48% (2-col) on compact', () => {
    expect(gridItemWidth('compact')).toBe('48%')
  })

  it('returns 31% (3-col) on medium and expanded', () => {
    expect(gridItemWidth('medium')).toBe('31%')
    expect(gridItemWidth('expanded')).toBe('31%')
  })
})

describe('pagePadding', () => {
  it('grows with the window: 16 / 24 / 32', () => {
    expect(pagePadding('compact')).toBe(16)
    expect(pagePadding('medium')).toBe(24)
    expect(pagePadding('expanded')).toBe(32)
  })
})

describe('contentMaxWidth', () => {
  it('caps reading content at 720 so lines stay readable on wide screens', () => {
    expect(contentMaxWidth('reading')).toBe(720)
  })

  it('caps wide (dashboard / two-column) content at 1040', () => {
    expect(contentMaxWidth('wide')).toBe(1040)
  })
})

describe('columnCount', () => {
  it('is 2 only on expanded; compact and medium stack', () => {
    expect(columnCount('compact')).toBe(1)
    expect(columnCount('medium')).toBe(1)
    expect(columnCount('expanded')).toBe(2)
  })
})
