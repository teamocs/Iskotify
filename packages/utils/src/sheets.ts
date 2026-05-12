import { z } from 'zod'
import type { ListingUpsert } from './types'

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
  external_url: z.string().default(''),
  image_url: z.string().default(''),
})

function splitPipe(value: string): string[] {
  if (!value.trim()) return []
  return value.split('|').map(s => s.trim()).filter(Boolean)
}

function parseEvents(value: string): Array<{ name: string; date: string }> {
  const parts = splitPipe(value)
  const events: Array<{ name: string; date: string }> = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const name = parts[i] ?? ''
    const date = parts[i + 1] ?? ''
    events.push({ name, date })
  }
  return events
}

function parseDate(value: string): string | null {
  return value.trim() || null
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null
  const n = Number(value.trim())
  return isNaN(n) ? null : n
}

export function transformSheetRow(row: Record<string, string>): ListingUpsert | null {
  const parsed = SheetRowSchema.safeParse(row)
  if (!parsed.success) return null
  const d = parsed.data
  return {
    type: d.type,
    title: d.title,
    slug: d.slug,
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
    updated_at: new Date().toISOString(),
  }
}
