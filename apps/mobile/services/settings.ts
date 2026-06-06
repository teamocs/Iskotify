import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { userSettings } from '../db/schema'
import type { IncomeBracket } from '../utils/scholarshipMatch'

export interface UserSettingsData {
  selectedListingSlug: string
  lastSyncedAt: number
  fullName: string
  school: string
  gradeLevel: number | null
  googleId: string | null
  email: string | null
  notificationsEnabled: boolean | null
  theme: string
  focusModeEnabled: boolean
  googleCalendarConnected: boolean
  incomeBracket: IncomeBracket | null
  gwa: number | null
  province: string | null
  city: string | null
}

const DEFAULTS: UserSettingsData = {
  selectedListingSlug: '',
  lastSyncedAt: 0,
  fullName: '',
  school: '',
  gradeLevel: null,
  googleId: null,
  email: null,
  notificationsEnabled: true,
  theme: 'system',
  focusModeEnabled: true,
  googleCalendarConnected: false,
  incomeBracket: null,
  gwa: null,
  province: null,
  city: null,
}

/** Read the singleton user_settings row (id = 1). Returns defaults when no row exists. */
export async function getSettings(db: DrizzleClient): Promise<UserSettingsData> {
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.id, 1))
    .limit(1)

  const row = rows[0]
  if (!row) return { ...DEFAULTS }

  return {
    selectedListingSlug: row.selectedListingSlug ?? '',
    lastSyncedAt: row.lastSyncedAt ?? 0,
    fullName: row.fullName ?? '',
    school: row.school ?? '',
    gradeLevel: row.gradeLevel ?? null,
    googleId: row.googleId ?? null,
    email: row.email ?? null,
    notificationsEnabled: row.notificationsEnabled ?? true,
    theme: row.theme ?? 'system',
    focusModeEnabled: row.focusModeEnabled ?? true,
    googleCalendarConnected: row.googleCalendarConnected ?? false,
    incomeBracket: (row.incomeBracket as IncomeBracket | null) ?? null,
    gwa: row.gwa ?? null,
    province: row.province ?? null,
    city: row.city ?? null,
  }
}

/** Upsert a partial update to the singleton user_settings row (id = 1). */
export async function updateSettings(
  db: DrizzleClient,
  patch: Partial<UserSettingsData>,
): Promise<void> {
  const set: Record<string, unknown> = {}

  if (patch.selectedListingSlug !== undefined) set.selectedListingSlug = patch.selectedListingSlug
  if (patch.lastSyncedAt !== undefined) set.lastSyncedAt = patch.lastSyncedAt
  if (patch.fullName !== undefined) set.fullName = patch.fullName
  if (patch.school !== undefined) set.school = patch.school
  if ('gradeLevel' in patch) set.gradeLevel = patch.gradeLevel ?? null
  if ('googleId' in patch) set.googleId = patch.googleId ?? null
  if ('email' in patch) set.email = patch.email ?? null
  if ('notificationsEnabled' in patch) set.notificationsEnabled = patch.notificationsEnabled ?? true
  if (patch.theme !== undefined) set.theme = patch.theme
  if ('focusModeEnabled' in patch) set.focusModeEnabled = patch.focusModeEnabled ?? true
  if ('googleCalendarConnected' in patch) set.googleCalendarConnected = patch.googleCalendarConnected ?? false
  if ('incomeBracket' in patch) set.incomeBracket = patch.incomeBracket ?? null
  if ('gwa' in patch) set.gwa = patch.gwa ?? null
  if ('province' in patch) set.province = patch.province ?? null
  if ('city' in patch) set.city = patch.city ?? null

  await db
    .insert(userSettings)
    .values({ id: 1, ...set } as typeof userSettings.$inferInsert)
    .onConflictDoUpdate({ target: userSettings.id, set })
}
