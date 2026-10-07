import type { Listing, ListingStatus, ListingUpsert } from '@iskotify/utils'
import { SheetRowSchema, SHEET_OWNED_FIELDS, transformSheetRow, type SheetOwnedField } from '@iskotify/utils'
import { suggestColumnMap, type AskModel, type ColumnMapSpec } from '@/lib/ai/mapColumns'

export interface ImportRow {
  slug: string
  title: string
  action: 'new' | 'update' | 'unchanged'
  /** Sheet-owned field names that differ from the existing listing (only set for 'update'). */
  changes: string[]
  listing: ListingUpsert
}

export interface InvalidRow {
  /** The sheet row number — the header row is row 1, so the first data row is 2. */
  row: number
  slug?: string
  title?: string
  errors: string[]
}

export interface MissingListing {
  slug: string
  title: string
  status: ListingStatus
}

export interface ImportPlanCounts {
  new: number
  update: number
  unchanged: number
  invalid: number
}

export interface ImportPlan {
  rows: ImportRow[]
  invalid: InvalidRow[]
  missing: MissingListing[]
  /** field → source header, e.g. { title: "Program Name" }. */
  columnMap: Record<string, string>
  mappedByAi: boolean
  counts: ImportPlanCounts
}

export interface PlanImportOptions {
  /** Injected for tests; defaults to askGemini via suggestColumnMap. */
  ask?: AskModel
}

interface SheetData {
  headers: string[]
  records: Record<string, string>[]
}

// The exact key order SheetRowSchema expects (see packages/utils/src/sheets.ts).
const FIELD_KEYS = [
  'type', 'title', 'slug', 'provider', 'description', 'requirements', 'coverage',
  'deadline', 'exam_date', 'results_date', 'events', 'target_courses',
  'target_year_levels', 'tags', 'status', 'region', 'grant_amount',
  'external_url', 'image_url',
] as const

type FieldKey = typeof FIELD_KEYS[number]

const FIELD_DESCRIPTIONS: Record<FieldKey, string> = {
  type: '"scholarship" or "exam"',
  title: 'The listing\'s display name',
  slug: 'A URL-safe unique id for the listing (lowercase, hyphens); leave unmapped to derive it from the title',
  provider: 'The organization offering it (e.g. "DOST", "CHED")',
  description: 'A prose summary of the listing',
  requirements: 'Eligibility requirements, one thought per item',
  coverage: 'What is covered / awarded (e.g. tuition, stipend amount)',
  deadline: 'Application deadline date',
  exam_date: 'Entrance/qualifying exam date, if any',
  results_date: 'Results announcement date, if any',
  events: 'Named milestone events with dates (e.g. orientation, interview)',
  target_courses: 'Eligible courses/programs',
  target_year_levels: 'Eligible year levels (e.g. "Grade 12", "1st Year College")',
  tags: 'Free-form category tags',
  status: '"active", "closed" or "upcoming"',
  region: 'Where it applies (e.g. "Nationwide", "NCR")',
  grant_amount: 'A monetary amount, if the sheet has one column for it',
  external_url: 'A link to the official page or application form',
  image_url: 'A logo/banner image URL',
}

/** Normalized header → canonical field. Includes each field's own name (so an
 *  already-canonical header maps to itself) plus the common spreadsheet aliases. */
const ALIASES: Record<string, FieldKey> = {
  type: 'type', kind: 'type', category: 'type', listing_type: 'type',
  title: 'title', name: 'title',
  slug: 'slug', id: 'slug',
  provider: 'provider', org: 'provider', organization: 'provider', organisation: 'provider', sponsor: 'provider',
  description: 'description', desc: 'description', summary: 'description', details: 'description',
  requirements: 'requirements', requirement: 'requirements', eligibility: 'requirements',
  coverage: 'coverage', benefits: 'coverage', benefit: 'coverage',
  deadline: 'deadline', application_deadline: 'deadline', due_date: 'deadline',
  exam_date: 'exam_date', examdate: 'exam_date', test_date: 'exam_date',
  results_date: 'results_date', result_date: 'results_date', announcement_date: 'results_date',
  events: 'events', schedule: 'events',
  target_courses: 'target_courses', courses: 'target_courses', eligible_courses: 'target_courses',
  target_year_levels: 'target_year_levels', year_levels: 'target_year_levels', year_level: 'target_year_levels',
  tags: 'tags', categories: 'tags', keywords: 'tags',
  status: 'status',
  region: 'region', location: 'region', area: 'region',
  grant_amount: 'grant_amount', amount: 'grant_amount', stipend_amount: 'grant_amount', stipend: 'grant_amount',
  external_url: 'external_url', link: 'external_url', url: 'external_url', website: 'external_url',
  image_url: 'image_url', image: 'image_url', photo: 'image_url', logo: 'image_url',
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/**
 * Whether a sheet row is the listings header: a title column plus at least one
 * other known column. Lets the sheet readers skip a title banner (merged
 * across one or more cells) above the real header.
 */
export function looksLikeListingHeader(cells: string[]): boolean {
  const fields = new Set(cells.map(c => ALIASES[normalizeHeader(c)]).filter(Boolean))
  return fields.has('title') && fields.size >= 2
}

/** Converts a title into a URL-safe slug: lowercase, ascii, hyphen-separated. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface ColumnMapResult {
  fieldToHeader: Partial<Record<FieldKey, string>>
  mappedByAi: boolean
}

async function buildColumnMap(headers: string[], sample: Record<string, string>[], ask?: AskModel): Promise<ColumnMapResult> {
  const fieldToHeader: Partial<Record<FieldKey, string>> = {}
  for (const header of headers) {
    const field = ALIASES[normalizeHeader(header)]
    if (field && !fieldToHeader[field]) fieldToHeader[field] = header
  }

  let mappedByAi = false
  if (!fieldToHeader.type || !fieldToHeader.title) {
    const spec: ColumnMapSpec = {
      purpose: 'scholarship and exam listings for the Iskotify app',
      fields: FIELD_KEYS.map(key => ({
        key,
        description: FIELD_DESCRIPTIONS[key],
        // Only ask the model for what aliasing hasn't already resolved —
        // marking an already-resolved field required here would make
        // validateColumnMap reject an otherwise-good response that omits it.
        required: (key === 'type' && !fieldToHeader.type) || (key === 'title' && !fieldToHeader.title),
      })),
      headers,
      sample: sample.slice(0, 5),
    }
    const result = await suggestColumnMap(spec, ask)
    if (result) {
      mappedByAi = true
      for (const [field, header] of Object.entries(result.columns)) {
        const key = field as FieldKey
        if (!fieldToHeader[key]) fieldToHeader[key] = header
      }
    }
  }

  return { fieldToHeader, mappedByAi }
}

function toCanonicalRecord(raw: Record<string, string>, fieldToHeader: Partial<Record<FieldKey, string>>): Record<FieldKey, string> {
  const out = {} as Record<FieldKey, string>
  for (const field of FIELD_KEYS) {
    const header = fieldToHeader[field]
    out[field] = header !== undefined ? (raw[header] ?? '') : ''
  }
  return out
}

const DATE_FIELDS = new Set<SheetOwnedField>(['deadline', 'exam_date', 'results_date'])

function normalizeForCompare(field: SheetOwnedField, value: unknown): string {
  if (field === 'events') {
    const arr = (value as { name: string; date: string }[] | null | undefined) ?? []
    return JSON.stringify([...arr].map(e => `${e.name}|${e.date}`).sort())
  }
  if (Array.isArray(value)) return JSON.stringify([...value].sort())
  if (DATE_FIELDS.has(field)) return value ? String(value).slice(0, 10) : ''
  if (value === null || value === undefined) return ''
  return String(value)
}

function diffAgainstExisting(existing: Listing, listing: ListingUpsert): string[] {
  return SHEET_OWNED_FIELDS.filter(
    field => normalizeForCompare(field, existing[field]) !== normalizeForCompare(field, listing[field]),
  )
}

function zodErrorMessages(error: { issues: { path: (string | number)[]; message: string }[] }): string[] {
  return error.issues.map(issue => `${issue.path[0] ?? 'row'}: ${issue.message}`)
}

/**
 * Turns a read sheet into a preview plan: resolves the header → field mapping
 * (aliases, then AI as a fallback for the required columns), validates and
 * diffs every row against the current listings, and lists existing listings
 * the sheet no longer mentions. Pure aside from the injected `ask` — no
 * network or database calls — so it is fully unit-testable.
 */
export async function planImport(sheet: SheetData, existing: Listing[], opts: PlanImportOptions = {}): Promise<ImportPlan> {
  const { fieldToHeader, mappedByAi } = await buildColumnMap(sheet.headers, sheet.records, opts.ask)
  const existingBySlug = new Map(existing.map(l => [l.slug, l]))
  const seenSlugs = new Map<string, number>()

  const rows: ImportRow[] = []
  const invalid: InvalidRow[] = []

  sheet.records.forEach((raw, index) => {
    const rowNum = index + 2 // row 1 is the header
    const canonical = toCanonicalRecord(raw, fieldToHeader)

    let slug = canonical.slug.trim()
    if (!slug && canonical.title.trim()) slug = slugify(canonical.title)
    canonical.slug = slug

    if (slug && seenSlugs.has(slug)) {
      invalid.push({
        row: rowNum,
        slug,
        title: canonical.title || undefined,
        errors: [`duplicate slug, first seen on row ${seenSlugs.get(slug)}`],
      })
      return
    }
    if (slug) seenSlugs.set(slug, rowNum)

    const parsed = SheetRowSchema.safeParse(canonical)
    if (!parsed.success) {
      invalid.push({
        row: rowNum,
        slug: slug || undefined,
        title: canonical.title || undefined,
        errors: zodErrorMessages(parsed.error),
      })
      return
    }

    const listing = transformSheetRow(canonical)!
    const existingListing = existingBySlug.get(listing.slug)
    if (!existingListing) {
      rows.push({ slug: listing.slug, title: listing.title, action: 'new', changes: [], listing })
    } else {
      const changes = diffAgainstExisting(existingListing, listing)
      rows.push({
        slug: listing.slug,
        title: listing.title,
        action: changes.length > 0 ? 'update' : 'unchanged',
        changes,
        listing,
      })
    }
  })

  const missing: MissingListing[] = existing
    .filter(l => l.status !== 'closed' && !seenSlugs.has(l.slug))
    .map(l => ({ slug: l.slug, title: l.title, status: l.status }))

  const counts: ImportPlanCounts = {
    new: rows.filter(r => r.action === 'new').length,
    update: rows.filter(r => r.action === 'update').length,
    unchanged: rows.filter(r => r.action === 'unchanged').length,
    invalid: invalid.length,
  }

  return { rows, invalid, missing, columnMap: fieldToHeader as Record<string, string>, mappedByAi, counts }
}
