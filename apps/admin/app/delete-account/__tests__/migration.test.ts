import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Migrations are applied by hand, so this guards the SQL text of 064:
// public.delete_user_data(p_uid), the SECURITY DEFINER helper that the admin
// route /api/account/delete calls (service role only) to remove a departing
// user's rows. The route, not SQL, removes storage files and the auth user.
const dir = path.resolve(__dirname, '../../../../../supabase/migrations')
const file = fs.readdirSync(dir).find(f => f.startsWith('064_'))
const sql = file ? fs.readFileSync(path.join(dir, file), 'utf8') : ''
// Code only: comments may mention anything.
const code = sql.replace(/--[^\n]*/g, '')

describe('migration 064: delete_user_data(p_uid)', () => {
  it('exists as 064_delete_user_data.sql', () => {
    expect(file).toBe('064_delete_user_data.sql')
  })

  it('is a SECURITY DEFINER function with an empty search_path', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION\s+public\.delete_user_data\s*\(\s*p_uid\s+uuid\s*\)/i)
    expect(code).toMatch(/SECURITY DEFINER/i)
    expect(code).toMatch(/SET search_path\s*=\s*''/i)
  })

  it('is executable by the service role ONLY', () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.delete_user_data\(uuid\)\s+FROM\s+public\s*,\s*anon\s*,\s*authenticated/i)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_user_data\(uuid\)\s+TO\s+service_role\s*;/i)
    expect(code).not.toMatch(/GRANT[^;]*delete_user_data[^;]*\b(anon|public|authenticated)\b/i)
  })

  it('fails closed on a null user id', () => {
    expect(code).toMatch(/p_uid\s+IS NULL[\s\S]{0,80}RAISE EXCEPTION/i)
  })

  it('does not use auth.uid() (the caller is the server, the id is verified by the route)', () => {
    expect(code).not.toMatch(/auth\.uid\(\)/i)
  })

  it('does NOT touch storage.objects (the route uses the Storage API) or auth.users rows', () => {
    expect(code).not.toMatch(/storage\.objects/i)
    expect(code).not.toMatch(/DELETE FROM\s+auth\.users/i)
  })

  it('guards every table with to_regclass so a missing table cannot break the call', () => {
    expect(code).toMatch(/to_regclass\(\s*'public\.'\s*\|\|/i)
    // Table names only appear in the guarded lists, never as a bare DELETE/UPDATE.
    expect(code).not.toMatch(/DELETE FROM\s+public\.(?!early_access_registrations)[a-z_]+\s+WHERE/i)
    expect(code).not.toMatch(/UPDATE\s+public\.[a-z_]+\s+SET/i)
  })

  it('deletes the user-owned rows in every user-linked table (table:column pairs)', () => {
    for (const pair of [
      'app_bug_reports:user_id', 'app_feedback:user_id', 'question_reports:user_id',
      'listing_date_contributions:user_id', 'user_app_data:user_id',
      'google_calendar_connections:user_id', 'user_saved_listings:user_id',
      'practice_sessions:user_id', 'user_flashcard_progress:user_id', 'profiles:id',
    ]) {
      expect(code, pair).toContain(`'${pair}'`)
    }
    expect(code).toMatch(/DELETE FROM public\.%I WHERE %I = \$1/i)
  })

  it('profiles go after the tables that reference them', () => {
    expect(code.indexOf("'practice_sessions:user_id'")).toBeLessThan(code.indexOf("'profiles:id'"))
  })

  it('removes the early-access registration matched by the account email', () => {
    expect(code).toMatch(/SELECT email INTO v_email FROM auth\.users WHERE id = p_uid/i)
    expect(code).toMatch(/DELETE FROM\s+public\.early_access_registrations[\s\S]*?lower\(email\)/i)
  })

  it('only matches the early-access row by a CONFIRMED email (an unverified sign-up must not delete another person’s row)', () => {
    expect(code).toMatch(/SELECT email INTO v_email FROM auth\.users WHERE id = p_uid\s+AND email_confirmed_at IS NOT NULL/i)
  })

  it('keeps audit/admin rows but nulls the reference to the departing user', () => {
    for (const pair of [
      'question_flag_dismissals:dismissed_by', 'kb_publish_events:published_by',
      'listing_import_batches:created_by', 'listing_import_batches:published_by',
      'listing_date_contributions:reviewed_by',
    ]) {
      expect(code, pair).toContain(`'${pair}'`)
    }
    expect(code).toMatch(/UPDATE public\.%I SET %I = NULL WHERE %I = \$1/i)
    for (const t of ['question_flag_dismissals', 'kb_publish_events', 'listing_import_batches']) {
      // They appear only in the null list, never in the delete list.
      expect(code).not.toContain(`'${t}:user_id'`)
    }
  })

  it('schema-qualifies every table (search_path is empty)', () => {
    const noGrants = code.replace(/(REVOKE|GRANT)[^;]*;/gi, '')
    const bare = noGrants.match(/\b(?:FROM|UPDATE|JOIN)\s+(?!public\.|auth\.|\()[a-z_]+\b/gi) ?? []
    expect(bare).toEqual([])
  })

  it('documents manual verification', () => {
    expect(sql).toMatch(/MANUAL VERIFICATION/i)
  })
})
