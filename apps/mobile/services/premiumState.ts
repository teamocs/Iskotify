// Iskotify Full Access (P3): the one app-wide premium state.
//
// The ONLY source of truth is the server entitlement row for the signed-in
// student (services/entitlements.ts), which the Play (RevenueCat) and PayMongo
// webhooks write. RevenueCat is used to make and restore a purchase, never to
// decide access: its app_user_id is client-asserted. The last known row value
// is cached on this device (services/premiumCache.ts) so an offline student
// keeps access (utils/premiumLimits.ts resolvePremium).
// Refreshed on launch, when the app comes back to the foreground, after a
// purchase or restore, and (web) while /upgrade?status=success waits for the
// payment webhook. Behind EXPO_PUBLIC_PAYWALL_ENABLED: with the flag off this
// module does nothing and everyone has unlimited access.
import { AppState } from 'react-native'
import type { DrizzleClient } from '../db/client'
import { isPaywallEnabled, resolvePremium } from '../utils/premiumLimits'
import { supabase } from './supabase'
import { fetchEntitlementPremium } from './entitlements'
import { readPremiumCache, writePremiumCache, clearPremiumCache } from './premiumCache'
import { configureStore, storeLogIn, storeLogOut, purchaseFullAccess, restoreFullAccess, type PurchaseOutcome } from './premium'

export interface PremiumSnapshot {
  /** The paywall flag. Off: no limits and no upgrade UI anywhere. */
  enabled: boolean
  /** The signed-in student has Iskotify Full Access. */
  isPremium: boolean
  /** No limit applies: the flag is off or the student has Full Access. */
  unlimited: boolean
  /** The first answer (cache or server) is not in yet. */
  loading: boolean
}

function initialSnapshot(): PremiumSnapshot {
  const enabled = isPaywallEnabled()
  return { enabled, isPremium: false, unlimited: !enabled, loading: enabled }
}

let snapshot: PremiumSnapshot = initialSnapshot()
const listeners = new Set<() => void>()
let boundDb: DrizzleClient | null = null
let inFlight: Promise<boolean> | null = null

function set(next: Partial<PremiumSnapshot>): void {
  const merged = { ...snapshot, ...next }
  merged.unlimited = !merged.enabled || merged.isPremium
  if (merged.enabled === snapshot.enabled && merged.isPremium === snapshot.isPremium && merged.loading === snapshot.loading) return
  snapshot = merged
  for (const l of listeners) l()
}

export function getPremiumSnapshot(): PremiumSnapshot {
  return snapshot
}

export function subscribePremium(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

async function currentUserId(): Promise<string | null | undefined> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  } catch (e) {
    console.warn('[premium] getSession failed:', e)
    return undefined // unknown: keep what we have
  }
}

async function doRefresh(db: DrizzleClient): Promise<boolean> {
  const cached = (await readPremiumCache(db).catch(() => ({ premium: false, checkedAt: 0 }))).premium
  const userId = await currentUserId()
  if (userId === undefined) {
    set({ isPremium: cached, loading: false })
    return cached
  }
  if (userId === null) {
    if (cached) await clearPremiumCache(db).catch(e => console.warn('[premium] cache clear failed:', e))
    set({ isPremium: false, loading: false })
    return false
  }
  // Show the cached answer straight away; the network answer follows.
  if (snapshot.loading) set({ isPremium: cached, loading: false })
  // RevenueCat follows the signed-in Supabase account (purchases are attributed to it).
  await storeLogIn(userId)
  const row = await fetchEntitlementPremium(userId)
  const premium = resolvePremium({ signedIn: true, row, cached })
  if (row !== null) {
    await writePremiumCache(db, premium).catch(e => console.warn('[premium] cache write failed:', e))
  }
  set({ isPremium: premium, loading: false })
  return premium
}

/** Re-check Full Access now. Concurrent calls share one check. */
export function refreshPremium(): Promise<boolean> {
  const db = boundDb
  if (!snapshot.enabled || !db) return Promise.resolve(snapshot.isPremium)
  if (!inFlight) {
    inFlight = doRefresh(db)
      .catch(e => { console.warn('[premium] refresh failed:', e); set({ loading: false }); return snapshot.isPremium })
      .finally(() => { inFlight = null })
  }
  return inFlight
}

/**
 * After a web payment PayMongo's webhook may land a few seconds after the
 * student is back: re-read until Full Access shows up or the attempts run out.
 */
export async function pollPremium(opts: { attempts?: number; intervalMs?: number } = {}): Promise<boolean> {
  const attempts = opts.attempts ?? 6
  const intervalMs = opts.intervalMs ?? 2500
  for (let i = 0; i < attempts; i++) {
    if (i > 0 && intervalMs > 0) await new Promise(r => setTimeout(r, intervalMs))
    if (await refreshPremium()) return true
  }
  return false
}

/**
 * A Play purchase or restore went through: wait for the webhook to write the
 * entitlement row (it can lag a few seconds). 'confirmed' once the row says
 * Full Access; 'pending' if it has not arrived after ~30 s (the screen then
 * says it may take a minute and offers a refresh). Never grants access itself.
 */
export async function confirmPurchase(opts: { attempts?: number; intervalMs?: number } = {}): Promise<'confirmed' | 'pending'> {
  const ok = await pollPremium({ attempts: opts.attempts ?? 12, intervalMs: opts.intervalMs ?? 2500 })
  return ok ? 'confirmed' : 'pending'
}

/**
 * Sign-out, account delete or reset: RevenueCat forgets the account and this
 * device starts free (the next person's own check decides). Never throws.
 */
export async function signOutPremium(db?: DrizzleClient | null): Promise<void> {
  try { await storeLogOut() } catch (e) { console.warn('[premium] store logout failed:', e) }
  const target = db ?? boundDb
  if (target) await clearPremiumCache(target).catch(e => console.warn('[premium] cache clear failed:', e))
  if (snapshot.enabled) set({ isPremium: false, loading: false })
}

/**
 * Account switch (services/sync.ts reconcileAccountOwner): the cache row was
 * already reset there; drop the previous person's state in memory and check
 * the new account. No RevenueCat logOut here: the refresh logs the new account
 * in, which switches the store identity directly (a logOut racing it could
 * leave the store anonymous).
 */
export function forgetPremiumState(): void {
  if (!snapshot.enabled) return
  set({ isPremium: false })
  void refreshPremium()
}

/** Buy Full Access as the signed-in student (the id comes from the Supabase session only). */
export async function buyFullAccess(): Promise<PurchaseOutcome> {
  const userId = await currentUserId()
  if (!userId) return { status: 'signed_out' }
  return purchaseFullAccess(userId)
}

/** Restore a store purchase for the signed-in student (Supabase session id only). */
export async function restoreFullAccessForUser(): Promise<PurchaseOutcome> {
  const userId = await currentUserId()
  if (!userId) return { status: 'signed_out' }
  return restoreFullAccess(userId)
}

/**
 * Start Full Access for this app run: configure the store, show the cached
 * state, check online, and keep it fresh on foreground and on auth changes.
 * Returns a cleanup. No-op with the flag off.
 */
export async function initPremium(db: DrizzleClient): Promise<() => void> {
  if (!isPaywallEnabled()) {
    set({ enabled: false, loading: false })
    return () => {}
  }
  set({ enabled: true })
  boundDb = db
  configureStore()

  const appState = AppState.addEventListener('change', (s) => { if (s === 'active') void refreshPremium() })
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    // Deferred: supabase-js must not be called back into from inside this callback.
    setTimeout(() => {
      if (event === 'SIGNED_OUT') void signOutPremium(db)
      else if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) void refreshPremium()
    }, 0)
  })

  await refreshPremium()
  return () => {
    appState.remove()
    subscription.unsubscribe()
  }
}

export function _resetPremiumForTests(): void {
  snapshot = initialSnapshot()
  listeners.clear()
  boundDb = null
  inFlight = null
}
