import { supabase } from './supabase'
import type { GoogleEventPayload } from '../lib/googleCalendar/buildEventPayload'

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
