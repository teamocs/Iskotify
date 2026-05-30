export interface ReminderNote {
  title: string
  content: string
  type: 'text' | 'checklist'
  reminderAt: number   // ms epoch
}

export interface GoogleEventPayload {
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  reminders: { useDefault: false; overrides: Array<{ method: 'popup'; minutes: number }> }
}

const EVENT_DURATION_MS = 30 * 60 * 1000

// RFC3339 local-offset string, e.g. 2026-11-16T12:00:00+08:00
function toRfc3339(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`
}

function renderDescription(note: ReminderNote): string {
  if (note.type !== 'checklist') return note.content ?? ''
  try {
    const items = JSON.parse(note.content) as Array<{ text: string }>
    if (!Array.isArray(items)) return ''
    return items.map(i => `• ${i.text}`).join('\n')
  } catch {
    return ''
  }
}

export function buildEventPayload(note: ReminderNote): GoogleEventPayload {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return {
    summary: note.title.trim() || 'Reminder',
    description: renderDescription(note),
    start: { dateTime: toRfc3339(note.reminderAt), timeZone: tz },
    end: { dateTime: toRfc3339(note.reminderAt + EVENT_DURATION_MS), timeZone: tz },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
  }
}
