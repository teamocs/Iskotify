import {
  localDayIndex, localDateISO, calendarDayIndex, daysUntilDate, localDayIndexOfDate, localDayOffsetMs, reminderDayIndices,
} from '../localDay'

const H = 3_600_000
const DAY = 86_400_000
const PH = 8 * H // Asia/Manila is UTC+8, no DST

// 2026-10-01 in Manila
const at = (h: number, m = 0) => Date.UTC(2026, 9, 1, h - 8, m) // local wall-clock h:m PH on 1 Oct

describe('localDayIndex (explicit +8h offset)', () => {
  const oct1 = Date.UTC(2026, 9, 1) / DAY

  it('07:59 and 08:01 local are the same calendar day (1 Oct)', () => {
    expect(localDayIndex(at(7, 59), PH)).toBe(oct1)
    expect(localDayIndex(at(8, 1), PH)).toBe(oct1)
  })

  it('00:00 and 23:59 local stay on 1 Oct, one minute later is 2 Oct', () => {
    expect(localDayIndex(at(0, 0), PH)).toBe(oct1)
    expect(localDayIndex(at(23, 59), PH)).toBe(oct1)
    expect(localDayIndex(at(24, 0), PH)).toBe(oct1 + 1)
  })

  it('a plain UTC floor gets 08:01-24:00 local wrong (the bug being fixed)', () => {
    expect(Math.floor(at(8, 1) / DAY)).toBe(oct1) // UTC 00:01 same day -> fine
    expect(Math.floor(at(7, 59) / DAY)).toBe(oct1 - 1) // UTC 23:59 previous day -> wrong
  })
})

describe('localDateISO', () => {
  it('formats the local calendar date', () => {
    expect(localDateISO(at(7, 59), PH)).toBe('2026-10-01')
    expect(localDateISO(at(23, 59), PH)).toBe('2026-10-01')
    expect(localDateISO(at(24, 0), PH)).toBe('2026-10-02')
    expect(new Date(at(7, 59)).toISOString().slice(0, 10)).toBe('2026-09-30') // UTC would say yesterday
  })
})

describe('calendarDayIndex / daysUntilDate', () => {
  const exam = Date.UTC(2026, 9, 1) // 'YYYY-MM-DD' exam date stored at UTC midnight

  it('an exam date-only value indexes to its own calendar date', () => {
    expect(calendarDayIndex(exam)).toBe(localDayIndex(at(12), PH))
  })

  it('is 0 days away all through exam day, including after 08:00 and at 23:59', () => {
    expect(daysUntilDate(exam, at(0, 0), PH)).toBe(0)
    expect(daysUntilDate(exam, at(7, 59), PH)).toBe(0)
    expect(daysUntilDate(exam, at(8, 1), PH)).toBe(0)
    expect(daysUntilDate(exam, at(23, 59), PH)).toBe(0)
  })

  it('is 1 the evening before and -1 the day after', () => {
    expect(daysUntilDate(exam, at(23, 59) - DAY, PH)).toBe(1)
    expect(daysUntilDate(exam, at(0, 1) + DAY, PH)).toBe(-1)
  })
})

describe('localDayIndexOfDate', () => {
  it('indexes a Date by its local calendar fields, whatever the zone', () => {
    expect(localDayIndexOfDate(new Date(2026, 9, 1, 15, 0))).toBe(Date.UTC(2026, 9, 1) / DAY)
  })
})

describe('localDayOffsetMs', () => {
  it('follows the device zone (Manila -> +8h)', () => {
    const spy = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-480)
    expect(localDayOffsetMs()).toBe(PH)
    spy.mockRestore()
  })
})

describe('reminderDayIndices (local calendar day of each reminder instant)', () => {
  it('buckets a 07:59 and a 08:01 local reminder on the same day, and 23:30 on it too', () => {
    const idx = reminderDayIndices([{ reminderAt: at(7, 59) }, { reminderAt: at(8, 1) }, { reminderAt: at(23, 30) }], PH)
    expect([...idx]).toEqual([Date.UTC(2026, 9, 1) / DAY])
  })
  it('a 00:30 local reminder is not pulled back to the previous UTC day', () => {
    expect([...reminderDayIndices([{ reminderAt: at(0, 30) }], PH)]).toEqual([Date.UTC(2026, 9, 1) / DAY])
  })
})
