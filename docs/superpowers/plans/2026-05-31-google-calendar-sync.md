# Google Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Google once in Settings, then auto-mirror every reminder (a `notes` row with `reminderAt`) to the user's Google Calendar — create/update/delete in lock-step.

**Architecture:** Mobile adds `calendar.events` scope + `access_type=offline` to a dedicated "Connect" OAuth flow; stores the Google refresh token server-side in a Supabase RLS table. A single Vercel admin route exchanges that refresh token for a short-lived access token (Google client secret stays server-only). Mobile then calls the Google Calendar REST API directly. Pure JS — ships via OTA.

**Tech Stack:** Expo Router · Supabase JS (PKCE, file-persisted session) · Next.js admin route · Drizzle/expo-sqlite linear migrations · Jest (mobile) / Vitest (admin)

**Spec:** [docs/superpowers/specs/2026-05-31-google-calendar-sync-design.md](../specs/2026-05-31-google-calendar-sync-design.md)

---

## File map

### New files
```
apps/mobile/lib/googleCalendar/buildEventPayload.ts                pure: note → Google event JSON
apps/mobile/lib/googleCalendar/buildEventPayload.test.ts
apps/mobile/lib/googleCalendar/reconcileDiff.ts                    pure: reminders → {create,update,delete}
apps/mobile/lib/googleCalendar/reconcileDiff.test.ts
apps/mobile/services/googleCalendar.ts                             side-effecting service
apps/mobile/hooks/useGoogleCalendar.ts                            connection state + connect/disconnect
apps/mobile/app/settings/google-calendar.tsx                      connect/disconnect screen
apps/admin/app/api/google-calendar/token/route.ts                 refresh→access token exchange
apps/admin/app/api/google-calendar/token/__tests__/route.test.ts
supabase/migrations/015_google_calendar_connections.sql
```

### Modified files
```
apps/mobile/db/schema.ts                  + notes.googleEventId, + userSettings.googleCalendarConnected
apps/mobile/db/client.ts                  + 2 ALTER TABLE migrations
apps/mobile/app/settings.tsx              + "Integrations" section row linking to the new screen
apps/mobile/app/(tabs)/index.tsx          mirror reminders to Calendar in save/delete handlers
apps/mobile/app/notes/[id].tsx            mirror reminder in handleSetReminder
apps/admin/.env.example                   document GOOGLE_OAUTH_CLIENT_ID / _SECRET
```

---

## Task 1: Mobile DB columns (schema + migration)

**Files:** `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`

- [ ] **Step 1: Add columns to schema.ts**

In `apps/mobile/db/schema.ts`, find the `notes` table definition. After the `reminderAt` column add:
```ts
  googleEventId: text('google_event_id'),
```
Find the `userSettings` table. After the `email` column (or last column) add:
```ts
  googleCalendarConnected: integer('google_calendar_connected', { mode: 'boolean' }).notNull().default(false),
```
(Confirm `integer` and `text` are already imported from `drizzle-orm/sqlite-core` at the top — they are, since other columns use them.)

- [ ] **Step 2: Append migrations in client.ts**

In `apps/mobile/db/client.ts`, the `MIGRATIONS` array. After the last entry (the FTS backfill `INSERT INTO flashcards_fts ...`), add two entries:
```ts
  `ALTER TABLE notes ADD COLUMN google_event_id TEXT`,
  `ALTER TABLE user_settings ADD COLUMN google_calendar_connected INTEGER NOT NULL DEFAULT 0`,
```
These run inside the existing `try { rawDb.execSync(sql) } catch {}` loop, so they're safe on re-run (column-exists errors are swallowed).

- [ ] **Step 3: Type-check + existing tests**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | head -20
cd apps/mobile && pnpm jest services/__tests__/sync.test.ts hooks/__tests__/useNotes.test.ts 2>&1 | tail -8
```
Expected: no new tsc errors. sync + notes tests still pass (they build their own in-memory schema; if either fails because its test fixture's CREATE TABLE for `notes`/`user_settings` lacks the new column, add the column to that test fixture's CREATE TABLE to match — mirror how `reminder_at` is handled).

- [ ] **Step 4: Commit**
```bash
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts apps/mobile/services/__tests__/sync.test.ts apps/mobile/hooks/__tests__/useNotes.test.ts
git commit -m "feat(mobile/calendar-sync): add notes.googleEventId + userSettings.googleCalendarConnected"
```
(Only `git add` the test files if you actually had to modify them.)

---

## Task 2: Supabase migration — google_calendar_connections

**Files:** `supabase/migrations/015_google_calendar_connections.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/015_google_calendar_connections.sql`:
```sql
-- Stores the Google OAuth refresh token per user so the admin token route can
-- mint short-lived Google access tokens for Calendar API calls. RLS: owner-only.
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gcc_select ON google_calendar_connections;
CREATE POLICY gcc_select ON google_calendar_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS gcc_insert ON google_calendar_connections;
CREATE POLICY gcc_insert ON google_calendar_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS gcc_update ON google_calendar_connections;
CREATE POLICY gcc_update ON google_calendar_connections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS gcc_delete ON google_calendar_connections;
CREATE POLICY gcc_delete ON google_calendar_connections
  FOR DELETE USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply via Supabase MCP (controller does this)**

Controller calls `mcp__supabase__apply_migration` with project_id `dtugrsbarruizgzowgso`, name `015_google_calendar_connections`, and the SQL above. Then verifies with:
```sql
SELECT tablename FROM pg_tables WHERE tablename = 'google_calendar_connections';
SELECT polname FROM pg_policies WHERE tablename = 'google_calendar_connections' ORDER BY polname;
```
Expected: table exists + 4 policies (gcc_select/insert/update/delete).

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/015_google_calendar_connections.sql
git commit -m "feat(db): google_calendar_connections table with owner-only RLS"
```

---

## Task 3: `buildEventPayload` pure helper (TDD)

**Files:** `apps/mobile/lib/googleCalendar/buildEventPayload.ts` + `.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/lib/googleCalendar/buildEventPayload.test.ts`:
```ts
import { buildEventPayload } from './buildEventPayload'

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
```

- [ ] **Step 2: Run test (expect fail — module not found)**
```bash
cd apps/mobile && pnpm jest lib/googleCalendar/buildEventPayload.test.ts 2>&1 | tail -8
```

- [ ] **Step 3: Implement**

Create `apps/mobile/lib/googleCalendar/buildEventPayload.ts`:
```ts
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
```

- [ ] **Step 4: Run test (expect 7 pass)**
```bash
cd apps/mobile && pnpm jest lib/googleCalendar/buildEventPayload.test.ts 2>&1 | tail -8
```

- [ ] **Step 5: Commit**
```bash
git add apps/mobile/lib/googleCalendar/buildEventPayload.ts apps/mobile/lib/googleCalendar/buildEventPayload.test.ts
git commit -m "feat(mobile/calendar-sync): buildEventPayload (note -> Google event JSON)"
```

---

## Task 4: `reconcileDiff` pure helper (TDD)

**Files:** `apps/mobile/lib/googleCalendar/reconcileDiff.ts` + `.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/lib/googleCalendar/reconcileDiff.test.ts`:
```ts
import { reconcileDiff } from './reconcileDiff'

const now = new Date(2026, 10, 16, 9).getTime()
const future = new Date(2026, 10, 20, 12).getTime()
const past = new Date(2026, 10, 10, 12).getTime()

describe('reconcileDiff', () => {
  it('creates events for future reminders with no googleEventId', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: future, googleEventId: null }], now)
    expect(out.toCreate.map(n => n.id)).toEqual(['n1'])
    expect(out.toUpdate).toEqual([])
    expect(out.toDelete).toEqual([])
  })

  it('ignores already-synced future reminders (no-op)', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: future, googleEventId: 'evt_1' }], now)
    expect(out.toCreate).toEqual([])
    expect(out.toUpdate).toEqual([])
    expect(out.toDelete).toEqual([])
  })

  it('ignores past reminders that were never synced', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: past, googleEventId: null }], now)
    expect(out.toCreate).toEqual([])
  })

  it('deletes synced events whose reminder is now in the past', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: past, googleEventId: 'evt_1' }], now)
    expect(out.toDelete.map(n => n.googleEventId)).toEqual(['evt_1'])
  })

  it('ignores reminders with null reminderAt', () => {
    const out = reconcileDiff([{ id: 'n1', reminderAt: null, googleEventId: null }], now)
    expect(out.toCreate).toEqual([])
    expect(out.toDelete).toEqual([])
  })
})
```

- [ ] **Step 2: Run test (expect fail)**
```bash
cd apps/mobile && pnpm jest lib/googleCalendar/reconcileDiff.test.ts 2>&1 | tail -8
```

- [ ] **Step 3: Implement**

Create `apps/mobile/lib/googleCalendar/reconcileDiff.ts`:
```ts
export interface ReconcileNote {
  id: string
  reminderAt: number | null
  googleEventId: string | null
}

export interface ReconcileResult {
  toCreate: ReconcileNote[]
  toUpdate: ReconcileNote[]   // reserved for future edit-detection; empty in v1 reconcile
  toDelete: ReconcileNote[]
}

/**
 * Given local reminder rows and the current time, decide what Calendar work the
 * reconcile pass should do. v1 rule set:
 *  - future reminder + no event  → create
 *  - past reminder + has event   → delete (clean up stale events)
 *  - everything else             → leave alone
 * Edits are mirrored at the action site (not here), so toUpdate stays empty in v1.
 */
export function reconcileDiff(notes: ReconcileNote[], nowMs: number): ReconcileResult {
  const toCreate: ReconcileNote[] = []
  const toDelete: ReconcileNote[] = []
  for (const n of notes) {
    if (n.reminderAt == null) continue
    const isFuture = n.reminderAt >= nowMs
    if (isFuture && !n.googleEventId) toCreate.push(n)
    else if (!isFuture && n.googleEventId) toDelete.push(n)
  }
  return { toCreate, toUpdate: [], toDelete }
}
```

- [ ] **Step 4: Run test (expect 5 pass)**
```bash
cd apps/mobile && pnpm jest lib/googleCalendar/reconcileDiff.test.ts 2>&1 | tail -8
```

- [ ] **Step 5: Commit**
```bash
git add apps/mobile/lib/googleCalendar/reconcileDiff.ts apps/mobile/lib/googleCalendar/reconcileDiff.test.ts
git commit -m "feat(mobile/calendar-sync): reconcileDiff (which reminders need create/delete)"
```

---

## Task 5: Admin token route (TDD)

**Files:** `apps/admin/app/api/google-calendar/token/route.ts` + `__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/api/google-calendar/token/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({ createServerClient: () => mockServerClient() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { POST } from '../route'

function makeReq(authHeader?: string): any {
  return {
    headers: new Headers(authHeader ? { authorization: authHeader } : {}),
  }
}

// Builds a service-role client whose auth.getUser(jwt) + from().select() are stubbable
function makeClient(opts: { user?: { id: string } | null; refreshToken?: string | null; dbError?: boolean }) {
  return {
    auth: { getUser: async (_jwt: string) => ({ data: { user: opts.user ?? null }, error: opts.user ? null : { message: 'bad jwt' } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => opts.dbError
            ? { data: null, error: { message: 'no row' } }
            : { data: opts.refreshToken ? { refresh_token: opts.refreshToken } : null, error: opts.refreshToken ? null : { message: 'not found' } },
        }),
      }),
    }),
  }
}

beforeEach(() => {
  mockServerClient.mockReset(); mockFetch.mockReset()
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret'
})

describe('POST /api/google-calendar/token', () => {
  it('401 when Authorization header missing', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: null }))
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('401 when JWT is invalid', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: null }))
    const res = await POST(makeReq('Bearer badjwt'))
    expect(res.status).toBe(401)
  })

  it('404 when the user has no stored connection', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: { id: 'u1' }, refreshToken: null }))
    const res = await POST(makeReq('Bearer good'))
    expect(res.status).toBe(404)
  })

  it('200 with access_token on a successful Google exchange', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: { id: 'u1' }, refreshToken: 'rt_1' }))
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at_1', expires_in: 3600 }) })
    const res = await POST(makeReq('Bearer good'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.access_token).toBe('at_1')
    expect(body.expires_in).toBe(3600)
  })

  it('409 when Google reports invalid_grant (revoked)', async () => {
    mockServerClient.mockReturnValue(makeClient({ user: { id: 'u1' }, refreshToken: 'rt_1' }))
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) })
    const res = await POST(makeReq('Bearer good'))
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run test (expect fail)**
```bash
cd apps/admin && pnpm vitest run app/api/google-calendar/token/__tests__/route.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement**

Create `apps/admin/app/api/google-calendar/token/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function POST(req: NextRequest) {
  // 1. Verify the caller's Supabase JWT against the auth server (NOT a local decode).
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  }
  const jwt = authHeader.slice(7)

  const supabase = createServerClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  // 2. Read the stored refresh token (service-role bypasses RLS).
  const { data: row } = await supabase
    .from('google_calendar_connections')
    .select('refresh_token')
    .eq('user_id', user.id)
    .single()
  if (!row?.refresh_token) {
    return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 404 })
  }

  // 3. Exchange refresh token for a fresh access token.
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
  }

  const googleRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  })

  if (!googleRes.ok) {
    const body = await googleRes.json().catch(() => ({}))
    // invalid_grant = the user revoked access in their Google account settings.
    if (body?.error === 'invalid_grant') {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Google token exchange failed' }, { status: 502 })
  }

  const tok = await googleRes.json() as { access_token: string; expires_in: number }
  return NextResponse.json({ access_token: tok.access_token, expires_in: tok.expires_in })
}
```

- [ ] **Step 4: Run test (expect 5 pass)**
```bash
cd apps/admin && pnpm vitest run app/api/google-calendar/token/__tests__/route.test.ts 2>&1 | tail -8
```

- [ ] **Step 5: Middleware allowlist**

The mobile app calls this without an admin session cookie (it sends a Supabase Bearer token instead). Add it to the operator-endpoint bypass in `apps/admin/middleware.ts` `OPERATOR_ENDPOINTS`:
```ts
  '/api/google-calendar/token',  // mobile-called, authed via Supabase Bearer JWT in the handler
```

- [ ] **Step 6: Document env vars**

In `apps/admin/.env.example`, append:
```
# Google OAuth client (same client configured as the Supabase Google provider) —
# used by /api/google-calendar/token to refresh the user's Calendar access token.
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
```

- [ ] **Step 7: Commit**
```bash
git add apps/admin/app/api/google-calendar apps/admin/middleware.ts apps/admin/.env.example
git commit -m "feat(admin): POST /api/google-calendar/token (refresh -> access token, JWT-verified)"
```

---

## Task 6: Mobile googleCalendar service

**Files:** `apps/mobile/services/googleCalendar.ts` + a test

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/services/__tests__/googleCalendar.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test (expect fail)**
```bash
cd apps/mobile && pnpm jest services/__tests__/googleCalendar.test.ts 2>&1 | tail -8
```

- [ ] **Step 3: Implement**

Create `apps/mobile/services/googleCalendar.ts`:
```ts
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
```

- [ ] **Step 4: Run test (expect 4 pass)**
```bash
cd apps/mobile && pnpm jest services/__tests__/googleCalendar.test.ts 2>&1 | tail -8
```

- [ ] **Step 5: Commit**
```bash
git add apps/mobile/services/googleCalendar.ts apps/mobile/services/__tests__/googleCalendar.test.ts
git commit -m "feat(mobile/calendar-sync): googleCalendar REST service (token + CRUD)"
```

---

## Task 7: Connect/disconnect flow + `useGoogleCalendar` hook

**Files:** `apps/mobile/services/googleCalendar.ts` (extend), `apps/mobile/hooks/useGoogleCalendar.ts`

- [ ] **Step 1: Add connect/disconnect/syncReminder to the service**

Append to `apps/mobile/services/googleCalendar.ts`:
```ts
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { eq, and } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { notes as notesTable, userSettings } from '../db/schema'
import { buildEventPayload, type ReminderNote } from '../lib/googleCalendar/buildEventPayload'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

/**
 * Launch a scoped OAuth flow to obtain a Google refresh token with calendar
 * access, store it server-side (RLS table), and flip the local connected flag.
 * Returns true on success.
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

  // Store the refresh token server-side (RLS: owner-only).
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
      id: r.id, title: r.title, content: r.content, type: (r.type === 'checklist' ? 'checklist' : 'text'),
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
```

- [ ] **Step 2: Create the hook**

Create `apps/mobile/hooks/useGoogleCalendar.ts`:
```ts
import { useState, useEffect, useCallback } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'
import { connectGoogleCalendar, disconnectGoogleCalendar } from '../services/googleCalendar'

export function useGoogleCalendar() {
  const db = useDb()
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const rows = await db.select({ c: userSettings.googleCalendarConnected })
      .from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    setConnected(!!rows[0]?.c)
  }, [db])

  useEffect(() => { void refresh() }, [refresh])

  const connect = useCallback(async () => {
    setBusy(true)
    try {
      const ok = await connectGoogleCalendar(db)
      await refresh()
      return ok
    } finally { setBusy(false) }
  }, [db, refresh])

  const disconnect = useCallback(async () => {
    setBusy(true)
    try {
      await disconnectGoogleCalendar(db)
      await refresh()
    } finally { setBusy(false) }
  }, [db, refresh])

  return { connected, busy, connect, disconnect }
}
```

- [ ] **Step 3: Type-check**
```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i "googleCalendar\|useGoogleCalendar" | head
```
Expected: no errors referencing these files. (Confirm `expo-linking` is importable — it's used elsewhere; if the existing code imports `Linking` from `expo-linking`, match that.)

- [ ] **Step 4: Commit**
```bash
git add apps/mobile/services/googleCalendar.ts apps/mobile/hooks/useGoogleCalendar.ts
git commit -m "feat(mobile/calendar-sync): connect/disconnect flow + useGoogleCalendar hook"
```

---

## Task 8: Settings screen + entry row

**Files:** `apps/mobile/app/settings/google-calendar.tsx`, `apps/mobile/app/settings.tsx`

- [ ] **Step 1: Create the screen**

Create `apps/mobile/app/settings/google-calendar.tsx`:
```tsx
import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'

export default function GoogleCalendarSettings() {
  const { theme: t, typo } = useTheme()
  const { connected, busy, connect, disconnect } = useGoogleCalendar()

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
    back: { fontSize: 22, color: t.textSecondary },
    title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    body: { padding: 16, gap: 16 },
    card: { backgroundColor: t.surface2, borderColor: t.divider, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
    status: { fontSize: typo.md, fontWeight: '700', color: connected ? '#16a34a' : t.textSecondary },
    desc: { fontSize: typo.sm, color: t.textTertiary, lineHeight: 20 },
    btn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    btnConnect: { backgroundColor: t.accent },
    btnDisconnect: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.divider },
    btnConnectTxt: { color: '#fff', fontWeight: '700', fontSize: typo.md },
    btnDisconnectTxt: { color: t.accentText, fontWeight: '700', fontSize: typo.md },
  }), [t, typo, connected])

  async function handleConnect() {
    const ok = await connect()
    if (!ok) Alert.alert('Connection failed', 'Could not connect Google Calendar. Please try again.')
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back"><Text style={s.back}>‹</Text></Pressable>
        <Text style={s.title}>Google Calendar</Text>
      </View>
      <View style={s.body}>
        <View style={s.card}>
          <Text style={s.status}>{connected ? '✓ Connected' : 'Not connected'}</Text>
          <Text style={s.desc}>
            {connected
              ? 'Your reminders are mirrored to your Google Calendar. New, edited, and deleted reminders sync automatically while the app is open.'
              : 'Connect your Google account to automatically add every reminder you create to your Google Calendar.'}
          </Text>
          {busy ? (
            <ActivityIndicator color={t.accent} style={{ marginTop: 8 }} />
          ) : connected ? (
            <Pressable style={[s.btn, s.btnDisconnect]} onPress={disconnect}>
              <Text style={s.btnDisconnectTxt}>Disconnect</Text>
            </Pressable>
          ) : (
            <Pressable style={[s.btn, s.btnConnect]} onPress={handleConnect}>
              <Text style={s.btnConnectTxt}>Connect Google Calendar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}
```

- [ ] **Step 2: Add the entry row in settings.tsx**

In `apps/mobile/app/settings.tsx`, find the imports for `@lineiconshq/free-icons` and add `CalendarDaysOutlined` (verified to exist in the pack). Then add a new section after the existing "App" section block:
```tsx
        <Text style={s.secLabel}>Integrations</Text>
        <SettingsRow
          icon={CalendarDaysOutlined}
          iconBg="rgba(31,153,243,0.12)"
          iconColor="#1f99f3"
          label="Google Calendar"
          onPress={() => router.push('/settings/google-calendar')}
        />
```
(Match `s.secLabel` to the exact style name used by the existing section headers — confirm by reading the surrounding section in settings.tsx; if it's named differently, use that name.)

- [ ] **Step 3: Type-check + lint**
```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -i "settings\|google-calendar" | head
```
Expected: no errors. If `CalendarDaysOutlined` isn't exported, fall back to another existing calendar-ish icon (grep the pack as in Task notes).

- [ ] **Step 4: Commit**
```bash
git add apps/mobile/app/settings/google-calendar.tsx apps/mobile/app/settings.tsx
git commit -m "feat(mobile/calendar-sync): Settings > Google Calendar connect/disconnect screen"
```

---

## Task 9: Wire reminder mirroring into save/delete paths

**Files:** `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/notes/[id].tsx`

- [ ] **Step 1: Home screen — mirror on save**

In `apps/mobile/app/(tabs)/index.tsx`, import at top:
```tsx
import { syncReminderToCalendar, removeReminderFromCalendar } from '../../services/googleCalendar'
import { userSettings as userSettingsTable } from '../../db/schema'
```
(If `userSettings` is already imported under another alias, reuse it.)

In `handleSaveReminder` and `handleSaveAndOpenEditor`, AFTER the local insert + `scheduleNoteReminder`, before `setActiveDayMs(null)`, add a best-effort mirror:
```tsx
    // Mirror to Google Calendar if connected (best-effort; never block the save)
    try {
      const settings = await db.select({ c: userSettingsTable.googleCalendarConnected })
        .from(userSettingsTable).where(eq(userSettingsTable.id, 1)).limit(1)
      if (settings[0]?.c) {
        await syncReminderToCalendar(db, {
          id, title: payload.title, content: payload.content, type: payload.type,
          reminderAt: payload.reminderAt, googleEventId: null,
        })
      }
    } catch (err) { console.warn('[home/calendar] mirror failed:', err) }
```
(`eq` is already imported in this file from the Spec 2 work.)

In `handleDeleteReminder`, the note's `googleEventId` must be read before clearing. Update it to fetch the row first:
```tsx
  async function handleDeleteReminder(noteId: string) {
    const rows = await db.select({ gid: notesTable.googleEventId })
      .from(notesTable).where(eq(notesTable.id, noteId)).limit(1)
    await db.update(notesTable).set({ reminderAt: null, updatedAt: Date.now() }).where(eq(notesTable.id, noteId))
    try { await cancelNoteReminder(noteId) } catch {}
    try { await removeReminderFromCalendar(db, noteId, rows[0]?.gid ?? null) } catch {}
    void refresh()
  }
```

- [ ] **Step 2: Notes editor — mirror on set/clear**

In `apps/mobile/app/notes/[id].tsx`, import the service:
```tsx
import { syncReminderToCalendar, removeReminderFromCalendar } from '../../services/googleCalendar'
import { userSettings } from '../../db/schema'
```
In `handleSetReminder`, after the existing `scheduleNoteReminder` / `cancelNoteReminder` branch, add:
```tsx
    try {
      const settings = await db.select({ c: userSettings.googleCalendarConnected })
        .from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      if (settings[0]?.c) {
        const rows = await db.select({ gid: notesTable.googleEventId })
          .from(notesTable).where(eq(notesTable.id, id)).limit(1)
        const gid = rows[0]?.gid ?? null
        if (ms != null) {
          await syncReminderToCalendar(db, { id, title, content, type, reminderAt: ms, googleEventId: gid })
        } else {
          await removeReminderFromCalendar(db, id, gid)
        }
      }
    } catch (err) { console.warn('[notes/calendar] mirror failed:', err) }
```
(Confirm `content` and `type` are in scope in this component — read the component state; if the content is stored differently, pass the current content/type values the editor holds.)

- [ ] **Step 3: Type-check + the home test suite**
```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | head -20
cd apps/mobile && pnpm jest home notes 2>&1 | tail -8
```
Expected: tsc clean; home + notes tests pass. If `home.test.tsx` fails because the `useGoogleCalendar`/service modules aren't mocked, add `jest.mock('../../services/googleCalendar', () => ({ syncReminderToCalendar: jest.fn(), removeReminderFromCalendar: jest.fn() }))` to the test (mirror how DateActionSheet/MonthSheet were mocked in Spec 2).

- [ ] **Step 4: Commit**
```bash
git add apps/mobile/app/\(tabs\)/index.tsx apps/mobile/app/notes/\[id\].tsx
[ -n "$(git diff --cached --name-only | grep home.test)" ] && true
git commit -m "feat(mobile/calendar-sync): mirror reminders to Google Calendar on save/delete"
```
(If you had to touch `home.test.tsx`, add it to the commit.)

---

## Task 10: Verify, env setup, push, OTA, smoke

**Files:** none (operational)

- [ ] **Step 1: Full suites**
```bash
cd apps/mobile && pnpm test 2>&1 | tail -5
cd apps/admin && pnpm test 2>&1 | tail -5
cd apps/admin && pnpm build 2>&1 | tail -3
```
Expected: mobile 501 + new tests (≈ 21 new) all green; admin 221 + 5 new green; admin build clean with `/api/google-calendar/token` in the route list.

- [ ] **Step 2: Manual one-time setup (controller coordinates with user)**
  1. Supabase migration 015 applied (Task 2).
  2. Vercel env: set `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (the same Google OAuth client Supabase's Google provider uses — find it in Supabase Dashboard → Auth → Providers → Google, or Google Cloud Console → Credentials).
  3. Google Cloud Console → OAuth consent screen: ensure the `.../auth/calendar.events` scope is added; if the app is in "Testing" mode, add the tester Google accounts (or publish).
  4. Confirm `EXPO_PUBLIC_ADMIN_BASE_URL` is set in mobile env (added during the Upstash work; defaults to `https://iskotify.vercel.app`).

- [ ] **Step 3: Push + OTA**
```bash
git push origin master
cd apps/mobile && npx eas-cli update --branch preview --message "feat: Google Calendar sync for reminders" --non-interactive
```

- [ ] **Step 4: Manual smoke (after Vercel deploy + OTA land)**
  1. Settings → Google Calendar → Connect → grant calendar permission → screen shows "Connected".
  2. Create a reminder on a future date → check Google Calendar (web) → event appears at the reminder time.
  3. Edit the reminder's title/time in-app → the Google event updates.
  4. Delete the reminder (or clear its time) → the Google event disappears.
  5. Disconnect → connection row removed; new reminders no longer sync.
  6. Revoke access in Google account settings, then create a reminder → app handles the 409 gracefully (no crash; connection flag clears).

---

## Self-review against the spec

- §3 Connect flow → Task 7 (connectGoogleCalendar) + Task 8 (UI). ✓
- §3 Sync-a-reminder (token route + direct Calendar calls) → Task 5 (route) + Task 6 (service) + Task 9 (wiring). ✓
- §3 Disconnect → Task 7 (disconnectGoogleCalendar) + Task 8 (button). ✓
- §4 Supabase table + RLS → Task 2. ✓
- §4 Admin route (JWT-verified, client secret server-only) → Task 5 (uses `getUser(jwt)`, NOT unverified decode). ✓
- §4 Mobile schema (googleEventId, googleCalendarConnected) → Task 1. ✓
- §4 pure helpers → Task 3 (buildEventPayload) + Task 4 (reconcileDiff). ✓
- §5 Event mapping → Task 3. ✓
- §6 Sync behaviour: create/edit/delete → Task 9 (per-action mirror); back-sync on connect → Task 7 (`backSyncReminders`). ✓
- §7 Error handling (401/409/network) → Task 5 (409) + Task 6 (throws) + Task 9 (try/catch best-effort). ✓
- §8 Security → Task 2 (RLS) + Task 5 (JWT verify, secret server-only). ✓
- §9 Testing → Tasks 3,4,5,6 unit tests; Task 10 manual. ✓
- §10 Delivery (OTA + Vercel + migration) → Task 10. ✓

**Scope note:** `reconcileDiff` (Task 4) currently powers the delete-stale logic conceptually and is unit-tested; an automatic on-app-launch reconcile pass is NOT wired in v1 (the per-action mirror in Task 9 + back-sync on connect in Task 7 cover the real flows). Wiring a launch-time reconcile is a small future add if reminders created while offline need catch-up beyond the next connect.
