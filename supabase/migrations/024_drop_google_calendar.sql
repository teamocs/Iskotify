-- Remove the Google Calendar integration.
-- The mobile app no longer mirrors reminders to Google Calendar; deadlines and
-- note reminders are handled entirely by local device notifications.
-- The table holds only refresh tokens (0 rows in production), so dropping it is safe.

DROP TABLE IF EXISTS google_calendar_connections;
