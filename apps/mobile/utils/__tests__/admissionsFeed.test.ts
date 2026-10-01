import { daysUntil, sortBySeverityThenDate, upcomingEvents, SEVERITY_ORDER, type FeedItem } from '../admissionsFeed'
const item = (p: Partial<FeedItem>): FeedItem => ({ id:'x', reportDate:'2026-06-03', severity:'info', title:'t', body:'b', eventDate:null, eventType:null, ...p } as any)

describe('daysUntil', () => {
  it('positive future, 0 today, negative past', () => {
    const today = '2026-06-03'
    expect(daysUntil('2026-06-10', today)).toBe(7)
    expect(daysUntil('2026-06-03', today)).toBe(0)
    expect(daysUntil('2026-06-01', today)).toBe(-2)
  })
})
describe('"today" is the local calendar date (Asia/Manila, +8h)', () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })
  const manila = (d: number, h: number, m: number) => Date.UTC(2026, 9, d, h - 8, m)
  const setNow = (now: number) => {
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-480)
    jest.useFakeTimers({ now })
  }

  it('01:00 on 2 Oct local is 2 Oct: a 1 Oct event is past though UTC still says 1 Oct', () => {
    setNow(manila(2, 1, 0))
    const ev = [item({ id: 'a', eventDate: '2026-10-01' }), item({ id: 'b', eventDate: '2026-10-02' })]
    expect(upcomingEvents(ev).map(x => x.id)).toEqual(['b'])
    expect(daysUntil('2026-10-02')).toBe(0)
  })

  it.each([[7, 59], [8, 1], [23, 59]])('%i:%i local on 1 Oct keeps a 1 Oct event upcoming (0 days)', (h, m) => {
    setNow(manila(1, h, m))
    expect(daysUntil('2026-10-01')).toBe(0)
    expect(upcomingEvents([item({ id: 'a', eventDate: '2026-10-01' })]).map(x => x.id)).toEqual(['a'])
  })
})
describe('sortBySeverityThenDate', () => {
  it('urgent first, then reportDate desc', () => {
    const a = item({ id:'a', severity:'info', reportDate:'2026-06-03' })
    const b = item({ id:'b', severity:'urgent', reportDate:'2026-05-01' })
    const c = item({ id:'c', severity:'urgent', reportDate:'2026-06-02' })
    expect(sortBySeverityThenDate([a,b,c]).map(x=>x.id)).toEqual(['c','b','a'])
  })
})
describe('upcomingEvents', () => {
  it('keeps only future event_date, sorted asc', () => {
    const past = item({ id:'p', eventDate:'2026-06-01' })
    const f1 = item({ id:'f1', eventDate:'2026-08-01' })
    const f2 = item({ id:'f2', eventDate:'2026-07-01' })
    expect(upcomingEvents([past,f1,f2], '2026-06-03').map(x=>x.id)).toEqual(['f2','f1'])
  })
  it('excludes items without event_date', () => {
    expect(upcomingEvents([item({ id:'n', eventDate:null })], '2026-06-03')).toEqual([])
  })
  it('SEVERITY_ORDER ranks urgent<important<info<no_change', () => {
    expect(SEVERITY_ORDER.urgent!).toBeLessThan(SEVERITY_ORDER.no_change!)
  })
})
