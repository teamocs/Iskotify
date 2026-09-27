import { z } from 'zod'
import type { ListingUpsert } from './types'

// Empty, or an http(s) URL: these are rendered as links and images in the apps.
const webLink = z.string().trim().refine(v => v === '' || /^https?:\/\//i.test(v), 'Links must start with http:// or https://').default('')

export const SheetRowSchema = z.object({
  type: z.enum(['scholarship', 'exam']),
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  provider: z.string().default(''),
  description: z.string().default(''),
  requirements: z.string().default(''),
  coverage: z.string().default(''),
  deadline: z.string().default(''),
  exam_date: z.string().default(''),
  results_date: z.string().default(''),
  events: z.string().default(''),
  target_courses: z.string().default(''),
  target_year_levels: z.string().default(''),
  tags: z.string().default(''),
  status: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.enum(['active', 'closed', 'upcoming']).default('active')
  ),
  region: z.string().default(''),
  grant_amount: z.string().default(''),
  external_url: webLink,
  image_url: webLink,
})

export function splitPipe(value: string): string[] {
  if (!value.trim()) return []
  return value.split('|').map(s => s.trim()).filter(Boolean)
}

export function parseEvents(value: string): Array<{ name: string; date: string }> {
  const parts = splitPipe(value)
  const events: Array<{ name: string; date: string }> = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const name = parts[i] ?? ''
    const date = parts[i + 1] ?? ''
    events.push({ name, date })
  }
  return events
}

export function parseDate(value: string): string | null {
  return value.trim() || null
}

export function parseNumber(value: string): number | null {
  if (!value.trim()) return null
  const n = Number(value.trim())
  return isNaN(n) ? null : n
}

/**
 * The columns a sheet import is allowed to touch on an EXISTING listing.
 * Everything else on `Listing` (id, slug, timestamps, and the Epic B
 * scholarship-typed fields — province, city, scope, is_verified,
 * income_ceiling, gwa_requirement, monthly_stipend, service_obligation_years,
 * has_entrance_exam, application_window, scholarship_meta) is admin-owned and
 * a re-sync must never overwrite it on a row that already exists.
 */
export const SHEET_OWNED_FIELDS = [
  'type', 'title', 'provider', 'description', 'requirements', 'coverage',
  'deadline', 'exam_date', 'results_date', 'events', 'target_courses',
  'target_year_levels', 'tags', 'status', 'region', 'grant_amount',
  'external_url', 'image_url',
] as const satisfies readonly (keyof ListingUpsert)[]

export type SheetOwnedField = typeof SHEET_OWNED_FIELDS[number]
export type SheetOwnedFields = Pick<ListingUpsert, SheetOwnedField>

type ParsedSheetRow = ReturnType<typeof SheetRowSchema.parse>

/** The sheet-owned fields only, parsed from one validated row — shared by
 *  `transformSheetRow` (new rows, full defaults) and the import planner
 *  (existing rows, sheet-owned fields only). */
export function sheetOwnedFields(d: ParsedSheetRow): SheetOwnedFields {
  return {
    type: d.type,
    title: d.title,
    provider: d.provider,
    description: d.description,
    requirements: splitPipe(d.requirements),
    coverage: d.coverage,
    deadline: parseDate(d.deadline),
    exam_date: parseDate(d.exam_date),
    results_date: parseDate(d.results_date),
    events: parseEvents(d.events),
    target_courses: splitPipe(d.target_courses),
    target_year_levels: splitPipe(d.target_year_levels),
    tags: splitPipe(d.tags),
    status: d.status,
    region: d.region,
    grant_amount: parseNumber(d.grant_amount),
    external_url: d.external_url,
    image_url: d.image_url,
  }
}

export function transformSheetRow(row: Record<string, string>): ListingUpsert | null {
  const parsed = SheetRowSchema.safeParse(row)
  if (!parsed.success) return null
  const d = parsed.data
  return {
    slug: d.slug,
    ...sheetOwnedFields(d),
    // Epic B scholarship typed fields (sheet rows don't supply these; default values)
    province: null,
    city: null,
    scope: 'national',
    is_verified: false,
    income_ceiling: null,
    gwa_requirement: null,
    monthly_stipend: null,
    service_obligation_years: null,
    has_entrance_exam: false,
    application_window: null,
    scholarship_meta: null,
    updated_at: new Date().toISOString(),
  }
}
