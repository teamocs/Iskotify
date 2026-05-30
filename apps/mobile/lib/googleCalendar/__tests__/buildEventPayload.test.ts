import { buildEventPayload } from '../buildEventPayload'

describe('buildEventPayload', () => {
  const reminderAt = new Date(2026, 10, 16, 12, 0, 0).getTime() // local noon

  it('maps title to summary and sets a 30-minute timed event', () => {
    const ev = buildEventPayload({ title: 'Review Algebra', content: '', type: 'text', reminderAt })
    expect(ev.summary).toBe('Review Algebra')
    expect(new Date(ev.end.dateTime).getTime() - new Date(ev.start.dateTime).getTime()).toBe(30 * 60 * 1000)
  })

  it('falls back to "Reminder" when title is empty', () => {
    const ev = buildEventPayload({ title: '', content: '', type: 'text', reminderAt })
    expect(ev.summary).toBe('Reminder')
  })

  it('puts plain text content into description as-is', () => {
    const ev = buildEventPayload({ title: 'T', content: 'study chapter 4', type: 'text', reminderAt })
    expect(ev.description).toBe('study chapter 4')
  })

  it('renders checklist content as bullet lines in description', () => {
    const content = JSON.stringify([
      { id: 'a', text: 'Pens', isChecked: false },
      { id: 'b', text: 'Calculator', isChecked: true },
    ])
    const ev = buildEventPayload({ title: 'Pack', content, type: 'checklist', reminderAt })
    expect(ev.description).toBe('• Pens\n• Calculator')
  })

  it('tolerates malformed checklist JSON (empty description)', () => {
    const ev = buildEventPayload({ title: 'X', content: 'not json', type: 'checklist', reminderAt })
    expect(ev.description).toBe('')
  })

  it('includes a popup reminder override at 0 minutes', () => {
    const ev = buildEventPayload({ title: 'T', content: '', type: 'text', reminderAt })
    expect(ev.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] })
  })

  it('emits RFC3339 dateTime strings with a timeZone field', () => {
    const ev = buildEventPayload({ title: 'T', content: '', type: 'text', reminderAt })
    expect(ev.start.dateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(typeof ev.start.timeZone).toBe('string')
  })
})
