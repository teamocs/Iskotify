import { rankUnseenFirst, unitLastSeen, shuffleWith, seqRng } from '../unseenFirst'

type U = { ids: string[] }
const idsOf = (u: U) => u.ids
const u = (...ids: string[]): U => ({ ids })

describe('unitLastSeen', () => {
  it('is null when no member was seen', () => {
    expect(unitLastSeen(['a', 'b'], new Map())).toBeNull()
  })
  it('is the most recent sighting of any member (a passage set seen once counts as seen)', () => {
    expect(unitLastSeen(['a', 'b', 'c'], new Map([['b', 50], ['c', 70]]))).toBe(70)
  })
})

describe('rankUnseenFirst', () => {
  it('puts never-seen units first, then seen ones oldest-first', () => {
    const units = [u('s-new'), u('old'), u('a-new'), u('recent'), u('mid')]
    const seen = new Map([['old', 10], ['recent', 300], ['mid', 200]])
    const out = rankUnseenFirst(units, idsOf, seen, seqRng(0.3))
    const keys = out.map(x => x.ids[0])
    expect(new Set(keys.slice(0, 2))).toEqual(new Set(['s-new', 'a-new']))
    expect(keys.slice(2)).toEqual(['old', 'mid', 'recent'])
  })

  it('keeps passage sets whole and ranks a set by its most recently seen member', () => {
    const set = u('p1', 'p2', 'p3')
    const single = u('x')
    const seen = new Map([['p2', 100], ['x', 50]])
    const out = rankUnseenFirst([set, single], idsOf, seen, seqRng(0.5))
    expect(out).toEqual([single, set])
    expect(out[1]).toBe(set)
    expect(out[1]!.ids).toEqual(['p1', 'p2', 'p3'])
  })

  it('orders unseen units randomly via the injected rng (deterministic for a fixed rng)', () => {
    const units = [u('a'), u('b'), u('c'), u('d')]
    const a = rankUnseenFirst(units, idsOf, new Map(), seqRng(0.1, 0.9, 0.4))
    const b = rankUnseenFirst(units, idsOf, new Map(), seqRng(0.1, 0.9, 0.4))
    expect(a).toEqual(b)
    expect(new Set(a)).toEqual(new Set(units))
    const c = rankUnseenFirst(units, idsOf, new Map(), seqRng(0.99, 0.99, 0.99))
    expect(c.map(x => x.ids[0])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('with no history at all is just a shuffle of the same units (old behaviour)', () => {
    const units = [u('a'), u('b'), u('c')]
    expect(rankUnseenFirst(units, idsOf, undefined, seqRng(0))).toEqual(shuffleWith(units, seqRng(0)))
  })

  it('never mutates its input', () => {
    const units = [u('a'), u('b')]
    const copy = [...units]
    rankUnseenFirst(units, idsOf, new Map([['a', 1]]), seqRng(0.2))
    expect(units).toEqual(copy)
  })
})

describe('seqRng', () => {
  it('cycles through the given values, always in [0, 1)', () => {
    const r = seqRng(0.2, 1, -1)
    expect([r(), r(), r(), r()]).toEqual([0.2, 0.999999, 0, 0.2])
  })
})
