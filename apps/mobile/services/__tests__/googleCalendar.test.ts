import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../googleCalendar'

const ev = {
  summary: 'T', description: '',
  start: { dateTime: '2026-11-16T12:00:00+08:00', timeZone: 'Asia/Manila' },
  end: { dateTime: '2026-11-16T12:30:00+08:00', timeZone: 'Asia/Manila' },
  reminders: { useDefault: false as const, overrides: [{ method: 'popup' as const, minutes: 0 }] },
}

describe('googleCalendar REST helpers', () => {
  let fetchMock: jest.Mock
  beforeEach(() => { fetchMock = jest.fn(); (global as any).fetch = fetchMock })

  it('createCalendarEvent POSTs to /events and returns the new event id', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'evt_1' }) })
    const id = await createCalendarEvent('at_1', ev)
    expect(id).toBe('evt_1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/calendars/primary/events')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer at_1')
  })

  it('updateCalendarEvent PATCHes /events/{id}', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'evt_1' }) })
    await updateCalendarEvent('at_1', 'evt_1', ev)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/events/evt_1')
    expect(init.method).toBe('PATCH')
  })

  it('deleteCalendarEvent DELETEs /events/{id}', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
    await deleteCalendarEvent('at_1', 'evt_1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/events/evt_1')
    expect(init.method).toBe('DELETE')
  })

  it('createCalendarEvent throws on non-OK', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    await expect(createCalendarEvent('at_1', ev)).rejects.toThrow()
  })
})
