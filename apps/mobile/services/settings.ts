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
  hsGwaG8?: number | null
  hsGwaG9?: number | null
  hsGwaG10?: number | null
  hsGwaG11?: number | null
  schoolType?: string | null
  isIndigenous?: boolean | null
  targetCampus?: string | null
  scoreDisclaimerAck?: boolean
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
  hsGwaG8: null,
  hsGwaG9: null,
  hsGwaG10: null,
  hsGwaG11: null,
  schoolType: null,
  isIndigenous: null,
  targetCampus: null,
  scoreDisclaimerAck: false,
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
    hsGwaG8: row.hsGwaG8 ?? null,
    hsGwaG9: row.hsGwaG9 ?? null,
    hsGwaG10: row.hsGwaG10 ?? null,
    hsGwaG11: row.hsGwaG11 ?? null,
    schoolType: row.schoolType ?? null,
    isIndigenous: row.isIndigenous ?? null,
    targetCampus: row.targetCampus ?? null,
    scoreDisclaimerAck: row.scoreDisclaimerAck ?? false,
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
  if ('hsGwaG8' in patch) set.hsGwaG8 = patch.hsGwaG8 ?? null
  if ('hsGwaG9' in patch) set.hsGwaG9 = patch.hsGwaG9 ?? null
  if ('hsGwaG10' in patch) set.hsGwaG10 = patch.hsGwaG10 ?? null
  if ('hsGwaG11' in patch) set.hsGwaG11 = patch.hsGwaG11 ?? null
  if ('schoolType' in patch) set.schoolType = patch.schoolType ?? null
  if ('isIndigenous' in patch) set.isIndigenous = patch.isIndigenous ?? null
  if ('targetCampus' in patch) set.targetCampus = patch.targetCampus ?? null
  if ('scoreDisclaimerAck' in patch) set.scoreDisclaimerAck = patch.scoreDisclaimerAck ?? false

  await db
    .insert(userSettings)
    .values({ id: 1, ...set } as typeof userSettings.$inferInsert)
    .onConflictDoUpdate({ target: userSettings.id, set })
}
