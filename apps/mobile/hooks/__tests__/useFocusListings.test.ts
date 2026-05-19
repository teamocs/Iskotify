import { normalizePriorities, swapPriority } from '../useFocusListings'

const make = (overrides: Partial<{ slug: string; priority: number; addedAt: number; title: string; type: string }> = {}) => ({
  slug: 'upcat-2025',
  priority: 1,
  addedAt: 1000,
  title: 'UPCAT 2025',
  type: 'exam',
  ...overrides,
})

describe('normalizePriorities', () => {
  it('assigns sequential 1-based priorities sorted by current priority', () => {
    const input = [make({ slug: 'b', priority: 3 }), make({ slug: 'a', priority: 1 })]
    const result = normalizePriorities(input)
    expect(result[0]!.slug).toBe('a')
    expect(result[0]!.priority).toBe(1)
    expect(result[1]!.slug).toBe('b')
    expect(result[1]!.priority).toBe(2)
  })

  it('returns empty array for empty input', () => {
    expect(normalizePriorities([])).toEqual([])
  })
})

describe('swapPriority', () => {
  const rows = [
    make({ slug: 'a', priority: 1 }),
    make({ slug: 'b', priority: 2 }),
    make({ slug: 'c', priority: 3 }),
  ]

  it('moves item up', () => {
    const result = swapPriority(rows, 'b', 'up')
    expect(result[0]!.slug).toBe('b')
    expect(result[1]!.slug).toBe('a')
  })

  it('moves item down', () => {
    const result = swapPriority(rows, 'b', 'down')
    expect(result[1]!.slug).toBe('c')
    expect(result[2]!.slug).toBe('b')
  })

  it('is noop when moving first item up', () => {
    const result = swapPriority(rows, 'a', 'up')
    expect(result.map(r => r.slug)).toEqual(['a', 'b', 'c'])
  })

  it('is noop when moving last item down', () => {
    const result = swapPriority(rows, 'c', 'down')
    expect(result.map(r => r.slug)).toEqual(['a', 'b', 'c'])
  })

  it('is noop when slug not found', () => {
    const result = swapPriority(rows, 'x', 'up')
    expect(result.map(r => r.slug)).toEqual(['a', 'b', 'c'])
  })
})
