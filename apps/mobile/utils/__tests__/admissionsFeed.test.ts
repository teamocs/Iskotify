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
