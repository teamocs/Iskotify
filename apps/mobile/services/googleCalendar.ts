import { supabase } from './supabase'
import type { GoogleEventPayload } from '../lib/googleCalendar/buildEventPayload'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { eq, and } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { notes as notesTable, userSettings } from '../db/schema'
import { buildEventPayload, type ReminderNote } from '../lib/googleCalendar/buildEventPayload'

const CAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const ADMIN_BASE = process.env.EXPO_PUBLIC_ADMIN_BASE_URL ?? 'https://iskotify.vercel.app'

/**
 * Fetch a fresh Google access token from the admin route, authenticated with the
 * current Supabase session JWT. Returns null if not signed in or the route fails.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  const res = await fetch(`${ADMIN_BASE}/api/google-calendar/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) return null
  const body = await res.json() as { access_token?: string }
  return body.access_token ?? null
}

export async function createCalendarEvent(accessToken: string, ev: GoogleEventPayload): Promise<string> {
  const res = await fetch(CAL_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ev),
  })
  if (!res.ok) throw new Error(`Calendar create failed: ${res.status}`)
  const body = await res.json() as { id: string }
  return body.id
}

export async function updateCalendarEvent(accessToken: string, eventId: string, ev: GoogleEventPayload): Promise<void> {
  const res = await fetch(`${CAL_BASE}/${eventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ev),
  })
  if (!res.ok) throw new Error(`Calendar update failed: ${res.status}`)
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`${CAL_BASE}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // 410 Gone = already deleted; treat as success.
  if (!res.ok && res.status !== 410) throw new Error(`Calendar delete failed: ${res.status}`)
}

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

/**
 * Launch a scoped OAuth flow to obtain a Google refresh token with calendar
 * access, store it server-side (RLS table), flip the local connected flag, and
 * back-sync existing future reminders. Returns true on success.
 */
export async function connectGoogleCalendar(db: DrizzleClient): Promise<boolean> {
  const redirectUrl = Linking.createURL('auth/callback')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
      scopes: CALENDAR_SCOPE,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  if (error || !data.url) return false

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)
  if (result.type !== 'success') return false

  const parsed = new URL(result.url)
  const code = parsed.searchParams.get('code')
  if (code) {
    await supabase.auth.exchangeCodeForSession(code).catch(() => {})
  }

  const { data: { session } } = await supabase.auth.getSession()
  const refreshToken = session?.provider_refresh_token
  const user = session?.user
  if (!refreshToken || !user) return false

  const { error: upErr } = await supabase
    .from('google_calendar_connections')
    .upsert({ user_id: user.id, refresh_token: refreshToken }, { onConflict: 'user_id' })
  if (upErr) return false

  await db.update(userSettings).set({ googleCalendarConnected: true }).where(eq(userSettings.id, 1))

  // Back-sync: push existing FUTURE reminders that have no event yet (best-effort).
  try { await backSyncReminders(db) } catch (err) { console.warn('[calendar] back-sync failed:', err) }
  return true
}

/** Create Calendar events for all future reminders lacking a googleEventId. */
export async function backSyncReminders(db: DrizzleClient): Promise<void> {
  const now = Date.now()
  const rows = await db.select({
      id: notesTable.id, title: notesTable.title, content: notesTable.content,
      type: notesTable.type, reminderAt: notesTable.reminderAt, googleEventId: notesTable.googleEventId,
    })
    .from(notesTable)
    .where(and(eq(notesTable.isArchived, false), eq(notesTable.isTrashed, false)))
  const due = rows.filter(r => r.reminderAt != null && r.reminderAt >= now && !r.googleEventId)
  for (const r of due) {
    await syncReminderToCalendar(db, {
      id: r.id, title: r.title, content: r.content,
      type: (r.type === 'checklist' ? 'checklist' : 'text'),
      reminderAt: r.reminderAt as number, googleEventId: null,
    }).catch(() => {})
  }
}

export async function disconnectGoogleCalendar(db: DrizzleClient): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('google_calendar_connections').delete().eq('user_id', user.id)
  }
  await db.update(userSettings).set({ googleCalendarConnected: false }).where(eq(userSettings.id, 1))
}

/** Mirror a single reminder note to Calendar. Best-effort; persists googleEventId. */
export async function syncReminderToCalendar(
  db: DrizzleClient,
  note: ReminderNote & { id: string; googleEventId: string | null },
): Promise<void> {
  const accessToken = await getAccessToken()
  if (!accessToken) return
  const payload = buildEventPayload(note)
  if (note.googleEventId) {
    await updateCalendarEvent(accessToken, note.googleEventId, payload)
  } else {
    const eventId = await createCalendarEvent(accessToken, payload)
    await db.update(notesTable).set({ googleEventId: eventId }).where(eq(notesTable.id, note.id))
  }
}

/** Remove a reminder's Calendar event (on delete or reminder-cleared). */
export async function removeReminderFromCalendar(
  db: DrizzleClient,
  noteId: string,
  googleEventId: string | null,
): Promise<void> {
  if (!googleEventId) return
  const accessToken = await getAccessToken()
  if (!accessToken) return
  await deleteCalendarEvent(accessToken, googleEventId).catch(() => {})
  await db.update(notesTable).set({ googleEventId: null }).where(eq(notesTable.id, noteId))
}
