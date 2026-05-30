# Google Calendar Sync — Design

**Date:** 2026-05-31
**Author:** session brainstorming with user
**Status:** Spec 3 of 3 in the calendar/reminders/google-sync arc (Spec 1 = subject accordion, Spec 2 = calendar interactivity — both shipped).

## 1. Goal

Let a signed-in user connect their Google account once and have every Iskotify reminder (a `notes` row with `reminderAt` set) automatically mirrored as a real event in their Google Calendar — created, updated, and deleted in lock-step with the in-app reminder.

## 2. Critical context discovered during brainstorming

The mobile app authenticates with **Supabase-managed Google OAuth via the system browser** (`supabase.auth.signInWithOAuth({ provider: 'google' })` in `apps/mobile/app/landing.tsx:24`). It does **NOT** use the native `@react-native-google-signin/google-signin` SDK (an earlier memory note claimed otherwise; that note was stale and is being corrected).

Consequences that shape this design:
- We can request the Calendar scope by adding it to the OAuth call, and request `access_type=offline` to receive a Google **refresh token** (`session.provider_refresh_token`) on the callback.
- Refreshing a Google access token requires the Google OAuth **client_id + client_secret**. The secret cannot ship in the mobile bundle, so a tiny server endpoint must perform the refresh. The app already has a Vercel-hosted admin backend — we add one route there.
- This keeps the feature **OTA-deliverable on mobile** (no new native module, no app-store update).

## 3. Architecture

```
CONNECT (Settings → "Connect Google Calendar")
  mobile: supabase.auth.signInWithOAuth(google,
            scopes: 'https://www.googleapis.com/auth/calendar.events',
            queryParams: { access_type: 'offline', prompt: 'consent' })
  callback: read session.provider_refresh_token
  mobile: upsert { user_id, refresh_token } → Supabase google_calendar_connections (RLS owner-only)
  mobile: set local connected flag (userSettings.googleCalendarConnected)
  mobile: back-sync — create events for all future reminders missing googleEventId

SYNC A REMINDER (while connected)
  mobile: POST /api/google-calendar/token   (Authorization: Bearer <supabase access token>)
            admin verifies the Supabase JWT → user_id
            admin reads google_calendar_connections.refresh_token for that user (service role)
            admin POSTs to https://oauth2.googleapis.com/token
                  (grant_type=refresh_token, client_id, client_secret, refresh_token)
            admin returns { access_token, expires_in }
  mobile: call Google Calendar REST directly with the access token:
            create → POST   /calendar/v3/calendars/primary/events  → store eventId in notes.googleEventId
            edit   → PATCH  /calendar/v3/calendars/primary/events/{eventId}
            delete → DELETE /calendar/v3/calendars/primary/events/{eventId}

DISCONNECT (Settings → "Disconnect")
  mobile: delete own google_calendar_connections row, clear local flag
  (existing Google events are left in place — no mass delete)
```

### Why the client secret stays server-side
The only operation that needs the secret is the refresh-token → access-token exchange. That is the single responsibility of the new admin route. All actual Calendar mutations run from the device with a short-lived access token, so we avoid proxying every create/update/delete through the server.

## 4. Components

### New — Supabase
- Migration `015_google_calendar_connections.sql`:
  ```sql
  CREATE TABLE google_calendar_connections (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token text NOT NULL,
    connected_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;
  -- owner can read/insert/update/delete only their own row
  CREATE POLICY gcc_select ON google_calendar_connections FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY gcc_insert ON google_calendar_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY gcc_update ON google_calendar_connections FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY gcc_delete ON google_calendar_connections FOR DELETE USING (auth.uid() = user_id);
  ```
  (The admin route reads via the service-role key, which bypasses RLS.)

### New — Admin (Vercel)
- `apps/admin/app/api/google-calendar/token/route.ts` (POST)
  - Auth: requires a valid Supabase user JWT in `Authorization: Bearer`. Verify via `supabase.auth.getUser(jwt)`. Reject 401 otherwise.
  - Reads `google_calendar_connections.refresh_token` for that user_id (service-role client).
  - Calls Google token endpoint with `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`.
  - Returns `{ access_token, expires_in }`. On Google "invalid_grant" (revoked), returns 409 so mobile can prompt re-connect.
  - Env vars (new): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (the same Google OAuth client Supabase uses for the Google provider).

### New — Mobile
- `apps/mobile/lib/googleCalendar/buildEventPayload.ts` — pure: `(note, opts) → Google event JSON`. Unit-tested.
- `apps/mobile/lib/googleCalendar/reconcile.ts` — pure: given local reminders + their googleEventId state, returns `{ toCreate, toUpdate, toDelete }`. Unit-tested.
- `apps/mobile/services/googleCalendar.ts` — side-effecting: `getAccessToken()` (calls admin route), `createEvent`, `updateEvent`, `deleteEvent`, `connect()`, `disconnect()`, `reconcile()`.
- `apps/mobile/hooks/useGoogleCalendar.ts` — exposes `{ connected, connecting, connect, disconnect, error }`.

### Modified — Mobile
- `db/schema.ts` — add `googleEventId: text('google_event_id')` to `notes`; add `googleCalendarConnected: integer(...,{mode:'boolean'})` to `userSettings`.
- Local SQLite migration to add the two columns (follow the existing migration mechanism; `reminder_at` was added the same way).
- Settings screen — a "Google Calendar" row: shows Connect button, or "Connected" + Disconnect.
- `app/(tabs)/index.tsx` `handleSaveReminder` / `handleSaveAndOpenEditor` / `handleDeleteReminder` — after the local DB write, if connected, fire the matching Calendar mutation (best-effort).
- `app/notes/[id].tsx` — when a reminder is set/changed/cleared on an existing note, mirror to Calendar if connected.

## 5. Event mapping

| Reminder field | Google event field |
|---|---|
| `note.title` (fallback "Reminder") | `summary` |
| `note.content` (checklist → "• item" lines) | `description` |
| `note.reminderAt` | `start.dateTime` (RFC3339, device tz) |
| `note.reminderAt + 30 min` | `end.dateTime` |
| — | `reminders.overrides`: popup at 0 min |

## 6. Sync behaviour (global auto-sync)

- **On connect:** reconcile pass creates events for every note with `reminderAt > now` and no `googleEventId`.
- **On reminder create:** create event, persist `googleEventId`.
- **On reminder edit:** if `googleEventId` present → PATCH; else create.
- **On reminder delete / reminder cleared:** if `googleEventId` present → DELETE, then null the column.
- **Best-effort:** any failure (offline, token 409/expired) leaves `googleEventId` null and is retried by a reconcile pass on next app open while connected.
- **Not connected:** no Calendar calls at all; reminders behave exactly as today.

## 7. Error handling

- **Admin route 401** (bad/expired Supabase JWT) → mobile refreshes Supabase session, retries once.
- **Admin route 409** (`invalid_grant`, user revoked access in Google settings) → mobile clears connected flag + connection row, surfaces a non-blocking "Reconnect Google Calendar" notice.
- **Google API 401** (access token expired mid-batch) → mobile re-fetches a token once and retries the call.
- **Network failure** → skip, reconcile later. Never block the reminder save itself.
- **Re-consent:** if the user previously connected but Google didn't return a refresh token (can happen if `prompt=consent` is omitted on a repeat consent), force `prompt=consent` so a refresh token is always issued.

## 8. Security

- Client secret only in admin env; never in the mobile bundle.
- Refresh token stored server-side in an RLS-protected table; the device keeps only ephemeral access tokens in memory.
- The admin token route requires a valid Supabase JWT, so it can't be used as an open token-refresh oracle.
- Disconnect deletes the stored refresh token row.

## 9. Testing strategy

- **Pure unit:** `buildEventPayload` (timed event, checklist rendering, tz formatting, missing title); `reconcile` (create/update/delete diff, ignores past reminders, ignores already-synced).
- **Admin route:** mocked Supabase `getUser` + mocked Google token endpoint — covers 200, 401 (no/invalid JWT), 404 (no connection row), 409 (invalid_grant).
- **Mobile service:** mocked `fetch` to the admin route + Google Calendar API — create/update/delete happy paths + token-expired retry.
- **Manual:** real connect on a device, create a reminder, verify the event appears in Google Calendar; edit + delete; disconnect.

## 10. Delivery

- Mobile: pure JS — ships via **EAS OTA** (no native module, no appVersion bump).
- Admin: one new route — auto-deploys on Vercel push.
- Manual one-time setup: set `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` in Vercel env; run the Supabase migration; ensure the Google Cloud OAuth consent screen lists the `calendar.events` scope and (if the app is in "Testing") the tester accounts, or is published.

## 11. Out of scope (future)

- Two-way sync (Google → app)
- Recurring reminders / events
- Syncing exam/scholarship listing dates (only user reminders sync)
- Choosing a non-primary calendar
- Background sync while the app is fully closed
- Bulk "delete all synced events" on disconnect
