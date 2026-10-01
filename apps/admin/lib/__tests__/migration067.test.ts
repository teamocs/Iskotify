import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Guards the SQL text of 067: entitlements (who has Full Access) and
// payment_events (webhook idempotency + purchase records). Clients may only READ
// their own entitlement; every write goes through the service role. Applied to
// prod by hand.
const dir = path.resolve(__dirname, '../../../../supabase/migrations')
const file = fs.readdirSync(dir).find(f => f.startsWith('067_'))
const sql = file ? fs.readFileSync(path.join(dir, file), 'utf8') : ''
const code = sql.replace(/--[^\n]*/g, '')
const sql064 = fs.readFileSync(path.join(dir, '064_delete_user_data.sql'), 'utf8')

function fnBody(text: string): string {
  const m = text.match(/CREATE OR REPLACE FUNCTION public\.delete_user_data[\s\S]*?\$\$;/)
  return m ? m[0] : ''
}

describe('migration 067: entitlements and payment_events', () => {
  it('exists as 067_entitlements_and_payments.sql', () => {
    expect(file).toBe('067_entitlements_and_payments.sql')
  })

  it('creates entitlements keyed by the auth user, cascading on account deletion', () => {
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.entitlements\s*\(/)
    expect(code).toMatch(/user_id\s+uuid\s+PRIMARY KEY\s+REFERENCES auth\.users\s*\(id\)\s+ON DELETE CASCADE/i)
    expect(code).toMatch(/premium\s+boolean\s+NOT NULL\s+DEFAULT false/i)
    expect(code).toMatch(/source\s+text\s+NOT NULL\s+CHECK\s*\(\s*source IN \('play',\s*'web',\s*'grandfather',\s*'admin'\)\s*\)/i)
    expect(code).toMatch(/granted_at\s+timestamptz/i)
    expect(code).toMatch(/revoked_at\s+timestamptz/i)
    expect(code).toMatch(/updated_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/i)
  })

  it('lets a signed-in user read ONLY their own entitlement, and write nothing', () => {
    expect(code).toMatch(/ALTER TABLE public\.entitlements ENABLE ROW LEVEL SECURITY;/)
    expect(code).toMatch(/CREATE POLICY[^;]*ON public\.entitlements\s+FOR SELECT\s+TO authenticated\s+USING \(user_id = auth\.uid\(\)\);/i)
    expect(code).toMatch(/REVOKE ALL ON public\.entitlements FROM anon, authenticated;/)
    expect(code).toMatch(/GRANT SELECT ON public\.entitlements TO authenticated;/)
    expect(code).not.toMatch(/CREATE POLICY[^;]*ON public\.entitlements[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i)
    expect(code).not.toMatch(/GRANT (ALL|INSERT|UPDATE|DELETE)[^;]*ON (TABLE )?public\.entitlements TO (anon|authenticated)/i)
  })

  it('creates payment_events keyed by the provider event id, with no client access at all', () => {
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.payment_events\s*\(/)
    expect(code).toMatch(/id\s+text\s+PRIMARY KEY/i)
    expect(code).toMatch(/provider\s+text\s+NOT NULL\s+CHECK\s*\(\s*provider IN \('paymongo',\s*'revenuecat'\)\s*\)/i)
    expect(code).toMatch(/amount_centavos\s+int/i)
    expect(code).toMatch(/payload\s+jsonb\s+NOT NULL/i)
    expect(code).toMatch(/received_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/i)
    expect(code).toMatch(/ALTER TABLE public\.payment_events ENABLE ROW LEVEL SECURITY;/)
    expect(code).toMatch(/REVOKE ALL ON public\.payment_events FROM anon, authenticated;/)
    expect(code).not.toMatch(/CREATE POLICY[^;]*ON public\.payment_events/i)
  })

  it('payment_events.user_id has no FK, so purchase records survive account deletion', () => {
    const table = code.match(/CREATE TABLE IF NOT EXISTS public\.payment_events\s*\(([\s\S]*?)\);/)
    expect(table).not.toBeNull()
    expect(table![1]).not.toMatch(/REFERENCES/i)
  })

  it('does not add a premium column to profiles (entitlements is the source of truth)', () => {
    expect(code).not.toMatch(/ALTER TABLE public\.profiles/i)
  })

  it('delete_user_data deletes entitlements before profiles and unlinks payment_events', () => {
    const body = fnBody(code)
    expect(body).toContain("'entitlements:user_id'")
    expect(body.indexOf("'entitlements:user_id'")).toBeLessThan(body.indexOf("'profiles:id'"))
    // In the null-out list (after the early-access block), never the delete list.
    expect(body.match(/'payment_events:user_id'/g)).toHaveLength(1)
    expect(body.indexOf("'payment_events:user_id'")).toBeGreaterThan(body.indexOf('DELETE FROM public.early_access_registrations'))
  })

  it('delete_user_data is otherwise identical to 064 (same lists, same security, same grants)', () => {
    const strip = (s: string) =>
      fnBody(s.replace(/--[^\n]*/g, ''))
        .replace(/\s*'entitlements:user_id',/, '')
        .replace(/,\s*'payment_events:user_id'/, '')
        .replace(/\s+/g, ' ')
    expect(strip(code)).toBe(strip(sql064))
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.delete_user_data\(uuid\) FROM public, anon, authenticated;/)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_user_data\(uuid\) TO service_role;/)
  })

  it('documents manual verification', () => {
    expect(sql).toMatch(/MANUAL VERIFICATION/i)
  })

  it('documents the RevenueCat restore behaviour the TRANSFER handling relies on', () => {
    expect(sql).toMatch(/Keep with original App User ID/)
  })
})

describe('migration 067: atomic grant/revoke functions (service role only)', () => {
  const fn = (name: string) => {
    const m = code.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))
    return m ? m[0] : ''
  }
  const grant = fn('grant_entitlement')
  const revoke = fn('revoke_play_entitlement')

  it('defines both functions with an empty search_path and NOT security definer', () => {
    expect(grant).toMatch(/grant_entitlement\(p_uid uuid, p_source text\)/)
    expect(revoke).toMatch(/revoke_play_entitlement\(p_uid uuid\)/)
    for (const f of [grant, revoke]) {
      expect(f).toMatch(/SET search_path = ''/)
      expect(f).not.toMatch(/SECURITY DEFINER/i)
      expect(f).toMatch(/p_uid IS NULL[\s\S]{0,80}RAISE EXCEPTION/)
    }
  })

  it('grant is one atomic upsert: play never overrides another source, granted_at kept on replay', () => {
    expect(grant).toMatch(/INSERT INTO public\.entitlements AS e/)
    expect(grant).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/)
    expect(grant).toMatch(/WHERE NOT \(e\.premium AND EXCLUDED\.source = 'play' AND e\.source <> 'play'\)/)
    expect(grant).toMatch(/granted_at = CASE WHEN e\.premium THEN COALESCE\(e\.granted_at, EXCLUDED\.granted_at\) ELSE EXCLUDED\.granted_at END/)
    expect(grant).toMatch(/revoked_at = NULL/)
    expect(grant).toMatch(/p_source NOT IN \('play', 'web', 'grandfather', 'admin'\)/)
  })

  it('revoke is one conditional UPDATE that only ever touches an active play grant', () => {
    expect(revoke).toMatch(/UPDATE public\.entitlements\s+SET premium = false, revoked_at = now\(\), updated_at = now\(\)\s+WHERE user_id = p_uid AND premium AND source = 'play'/)
  })

  it('both are executable by the service role only', () => {
    for (const sig of ['grant_entitlement\\(uuid, text\\)', 'revoke_play_entitlement\\(uuid\\)']) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig} FROM public, anon, authenticated;`))
      expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig} TO service_role;`))
    }
    expect(code).not.toMatch(/GRANT[^;]*(grant_entitlement|revoke_play_entitlement)[^;]*\b(anon|authenticated)\b/i)
  })
})
