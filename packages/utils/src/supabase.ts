import { createClient } from '@supabase/supabase-js'

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase public env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
  return createClient(url, key)
}

/**
 * Server-only — uses the service role key which bypasses RLS.
 * Only call from Next.js API routes or Server Actions. Never import in client components or the mobile app.
 * TODO: replace with generated Database type once `supabase gen types typescript` is run.
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase server env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}
