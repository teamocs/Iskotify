import { examPace, examPaceLabel, WEEKLY_SESSIONS } from '../examPace'

const TODAY = 20_000

describe('examPace', () => {
  it('shows nothing before there is any practice to measure', () => {
    expect(examPace(30, [], TODAY)).toBeNull()
  })

  it('is on pace once the week meets the band target', () => {
    // 21–60 days out asks for 4 practice days a week.
    expect(examPace(30, [TODAY, TODAY - 1, TODAY - 2, TODAY - 6], TODAY)).toEqual({ kind: 'on_pace' })
  })

  it('counts the sessions still to catch up this week, ignoring older days and duplicates', () => {
    expect(examPace(10, [TODAY, TODAY, TODAY - 7, TODAY - 30], TODAY)).toEqual({ kind: 'catch_up', sessions: WEEKLY_SESSIONS.heavy - 1 })
  })

  it('paces light with no exam date', () => {
    expect(examPace(null, [TODAY - 1], TODAY)).toEqual({ kind: 'catch_up', sessions: WEEKLY_SESSIONS.light - 1 })
  })

  it('reads calmly and never says "behind"', () => {
    expect(examPaceLabel({ kind: 'on_pace' })).toBe('On pace')
    expect(examPaceLabel({ kind: 'catch_up', sessions: 1 })).toBe('1 session to catch up')
    expect(examPaceLabel({ kind: 'catch_up', sessions: 3 })).toBe('3 sessions to catch up')
    for (const p of [{ kind: 'on_pace' as const }, { kind: 'catch_up' as const, sessions: 2 }]) {
      expect(examPaceLabel(p)).not.toMatch(/behind/i)
    }
  })
})
