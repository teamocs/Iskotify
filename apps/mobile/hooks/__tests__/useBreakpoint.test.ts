import { breakpointForWidth, gridItemWidth } from '../useBreakpoint'

describe('breakpointForWidth', () => {
  it('returns sm for widths below 768', () => {
    expect(breakpointForWidth(0)).toBe('sm')
    expect(breakpointForWidth(375)).toBe('sm')
    expect(breakpointForWidth(767)).toBe('sm')
  })

  it('returns md at exactly 768 (lower boundary)', () => {
    expect(breakpointForWidth(768)).toBe('md')
  })

  it('returns md for widths in the md range', () => {
    expect(breakpointForWidth(900)).toBe('md')
    expect(breakpointForWidth(1023)).toBe('md')
  })

  it('returns lg at exactly 1024 (lower boundary)', () => {
    expect(breakpointForWidth(1024)).toBe('lg')
  })

  it('returns lg for widths above 1024', () => {
    expect(breakpointForWidth(1280)).toBe('lg')
    expect(breakpointForWidth(1920)).toBe('lg')
  })
})

describe('gridItemWidth', () => {
  it('returns 48% for sm', () => {
    expect(gridItemWidth('sm')).toBe('48%')
  })

  it('returns 31% for md', () => {
    expect(gridItemWidth('md')).toBe('31%')
  })

  it('returns 31% for lg', () => {
    expect(gridItemWidth('lg')).toBe('31%')
  })
})
