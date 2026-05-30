import { filterDayItems, type DayItems } from '../useDateReminders'

describe('filterDayItems', () => {
  const noon = (yyyy: number, mm: number, dd: number) => new Date(yyyy, mm - 1, dd, 12).getTime()
  const midnight = (yyyy: number, mm: number, dd: number) => new Date(yyyy, mm - 1, dd).getTime()

  const dayStart = midnight(2026, 11, 16)
  const dayEnd = dayStart + 86_400_000

  it('returns empty arrays when nothing matches the day', () => {
    const out = filterDayItems({
      dayStartMs: dayStart,
      dayEndMs: dayEnd,
      reminders: [{ noteId: 'n1', noteTitle: 'Other day', reminderAt: noon(2026, 11, 15), type: 'text' }],
      listings: [{ slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: noon(2026, 11, 20), deadline: null }],
    })
    expect(out.reminders).toEqual([])
    expect(out.exams).toEqual([])
  })

  it('matches reminders whose reminderAt falls inside the day [start, end)', () => {
    const r1 = { noteId: 'n1', noteTitle: 'Algebra', reminderAt: noon(2026, 11, 16), type: 'text' as const }
    const r2 = { noteId: 'n2', noteTitle: 'Tomorrow', reminderAt: dayEnd, type: 'text' as const }
    const r3 = { noteId: 'n3', noteTitle: 'Midnight start', reminderAt: dayStart, type: 'checklist' as const }
    const out = filterDayItems({ dayStartMs: dayStart, dayEndMs: dayEnd, reminders: [r1, r2, r3], listings: [] })
    expect(out.reminders.map(r => r.noteId).sort()).toEqual(['n1', 'n3'])
  })

  it('matches listings on examDate OR deadline within the day', () => {
    const l1 = { slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: noon(2026, 11, 16), deadline: null }
    const l2 = { slug: 'dost', title: 'DOST-SEI', type: 'scholarship', examDate: null, deadline: noon(2026, 11, 16) }
    const l3 = { slug: 'other', title: 'Other', type: 'exam', examDate: noon(2026, 11, 17), deadline: null }
    const out = filterDayItems({ dayStartMs: dayStart, dayEndMs: dayEnd, reminders: [], listings: [l1, l2, l3] })
    expect(out.exams.map(e => e.slug).sort()).toEqual(['dost', 'upcat'])
  })

  it('infers label "Exam" for examDate hit and "Deadline" for deadline hit', () => {
    const l1 = { slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: noon(2026, 11, 16), deadline: null }
    const l2 = { slug: 'dost', title: 'DOST-SEI', type: 'scholarship', examDate: null, deadline: noon(2026, 11, 16) }
    const out = filterDayItems({ dayStartMs: dayStart, dayEndMs: dayEnd, reminders: [], listings: [l1, l2] })
    expect(out.exams.find(e => e.slug === 'upcat')?.label).toBe('Exam')
    expect(out.exams.find(e => e.slug === 'dost')?.label).toBe('Deadline')
  })

  it('returns reminders sorted by reminderAt ascending', () => {
    const reminders = [
      { noteId: 'b', noteTitle: 'B', reminderAt: noon(2026, 11, 16) + 3_600_000, type: 'text' as const },
      { noteId: 'a', noteTitle: 'A', reminderAt: noon(2026, 11, 16), type: 'text' as const },
    ]
    const out = filterDayItems({ dayStartMs: dayStart, dayEndMs: dayEnd, reminders, listings: [] })
    expect(out.reminders.map(r => r.noteId)).toEqual(['a', 'b'])
  })
})
