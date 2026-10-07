// Weekly admissions report (a Google Doc, exported as plain text) → structured
// admissions_updates rows, through the AI. The model only reads; everything it
// returns is checked here before it can reach a preview:
//
//   - every item must quote the document verbatim (the quote must be found in
//     it), or it is left out — so a finding can't be invented;
//   - source URLs are kept only when they appear in the document;
//   - an event date is kept only when the document states that date;
//   - severity comes from the section (Urgent → urgent, New Announcements →
//     important, Info Updates / Social Media Findings → info), and social-media
//     findings stay unverified;
//   - ids are deterministic: report date + school + a hash of the quote, so a
//     re-run over the same document updates the same rows.
//
// Nothing here publishes: the rows land in an announcement preview batch, and
// an admin publishes them (app/api/admin/announcements/import/[id]/publish).

import { createHash } from 'crypto'
import { extractJson, type AskModel } from '../ai/mapColumns'
import { slugify } from '../listings/planImport'
import type {
  AdmissionsUpdateRow, AnnouncementCandidate, AnnouncementRow, ReportSection, SkippedItem, UpdateSeverity,
} from './types'

export interface ReportDoc {
  text: string
  fileName: string
  /** Drive modifiedTime — the last-resort report date. */
  modifiedTime?: string | null
}

export type ExtractResult =
  | { ok: true; reportDate: string; items: AnnouncementCandidate[]; skipped: SkippedItem[] }
  | { ok: false; message: string }

/** Long enough for any weekly report; a longer document is held, not truncated. */
export const MAX_REPORT_CHARS = 100_000

const SEVERITY: Record<ReportSection, UpdateSeverity> = { urgent: 'urgent', new: 'important', info: 'info', social: 'info' }
const SECTIONS = Object.keys(SEVERITY) as ReportSection[]
export const EVENT_TYPES = ['application', 'deadline', 'exam', 'results', 'registration', 'interview', 'orientation', 'other'] as const

const MAX = { title: 160, body: 2000, school: 120, action: 500, quote: 1000, sources: 5 }
const MIN_QUOTE = 12
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Case, spacing and dash/quote style don't count when matching or hashing text. */
function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

/** Whether the text states this calendar date (ISO, "June 20", "Jun. 20", "20 June", "06/20/2026"). */
export function dateMentioned(text: string, iso: string): boolean {
  if (!isIsoDate(iso)) return false
  if (text.includes(iso)) return true
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const full = MONTHS[m - 1]!
  const names = [full, full.slice(0, 3), ...(full === 'september' ? ['sept'] : [])].join('|')
  const day = `0?${d}(?:st|nd|rd|th)?`
  const patterns = [
    new RegExp(`\\b(?:${names})\\.?\\s+${day}(?![0-9])`, 'i'),
    new RegExp(`(?<![0-9])${day}\\s+(?:of\\s+)?(?:${names})\\b`, 'i'),
    new RegExp(`(?<![0-9])0?${m}/0?${d}/(?:${y}|${String(y).slice(2)})(?![0-9])`),
  ]
  return patterns.some(p => p.test(text))
}

/** Stable id: report date + school slug + a short hash of the (normalised) quoted finding. */
export function announcementId(reportDate: string, school: string | null, quote: string): string {
  const who = slugify(school ?? '').slice(0, 40).replace(/-+$/, '') || 'general'
  const hash = createHash('sha256').update(normalize(quote)).digest('hex').slice(0, 10)
  return `${reportDate}-${who}-${hash}`
}

function manilaDate(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? null : new Date(t + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

function resolveReportDate(aiDate: unknown, doc: ReportDoc): string {
  if (isIsoDate(aiDate) && dateMentioned(doc.text, aiDate)) return aiDate
  const inName = doc.fileName.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  if (isIsoDate(inName)) return inName
  return manilaDate(doc.modifiedTime) ?? manilaDate(new Date().toISOString())!
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}

const trimUrl = (u: string) => u.trim().replace(/[).,;:!?\]}>'"]+$/, '')

export function buildExtractionPrompt(doc: ReportDoc): string {
  return `You read a weekly Philippine college admissions report and turn its findings into JSON for the Iskotify app's news feed.

The report has sections. Use ONLY these:
- "Urgent (Iskotify Action Required)" → "section": "urgent"
- "New Announcements" → "section": "new"
- "Info Updates" → "section": "info"
- "Social Media Findings" → "section": "social"
Never output items from "No Change Confirmed" or "Unable to Verify".
"Iskotify App Action Items" are not items: when an action item clearly belongs to one finding, put its text in that finding's "action_required"; otherwise leave it out.

Each finding usually starts with the school and exam in bold (e.g. "PUP — PUPCET"), then the finding, dates, and "Source: <url>" lines.

Rules — never invent anything:
- Use only facts written in the report. If a field is not in the text, use null (or [] for sources).
- "quote" must be copied EXACTLY, character for character, from the report: the sentence(s) the finding comes from (at least 20 characters).
- "event_date" only when the text clearly states the date of the deadline/exam/release (YYYY-MM-DD); otherwise null. Never guess a date.
- "sources": only URLs written in the report for that finding, exactly as written.
- "report_date": the report's own date if the text states it (YYYY-MM-DD), else null.

Output ONLY JSON in this shape:
{
  "report_date": "YYYY-MM-DD" | null,
  "items": [
    {
      "section": "urgent" | "new" | "info" | "social",
      "school": "the school as written, e.g. \\"PUP\\"" | null,
      "exam": "the exam code as written, e.g. \\"PUPCET\\"" | null,
      "title": "a short headline (max 120 characters) using only facts in the finding",
      "body": "the finding in 1–3 plain sentences, faithful to the text",
      "quote": "an exact excerpt of the report",
      "event_date": "YYYY-MM-DD" | null,
      "event_type": ${EVENT_TYPES.map(t => `"${t}"`).join(' | ')} | null,
      "action_required": "the linked Iskotify action item, as written" | null,
      "sources": ["https://…"]
    }
  ]
}

Document file name: ${JSON.stringify(doc.fileName)}

Report text:
<<<REPORT
${doc.text}
REPORT>>>`
}

/** Validates the model's raw reply against the document. Pure: no network, no clock unless the doc has no date at all. */
export function parseExtraction(raw: string, doc: ReportDoc): ExtractResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch {
    return { ok: false, message: 'The AI’s answer wasn’t valid JSON, so nothing was imported. The file will be read again on the next sync.' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray((parsed as { items?: unknown }).items)) {
    return { ok: false, message: 'The AI’s answer didn’t have the expected shape (an "items" list), so nothing was imported. The file will be read again on the next sync.' }
  }
  const { report_date: aiDate, items: rawItems } = parsed as { report_date?: unknown; items: unknown[] }
  const reportDate = resolveReportDate(aiDate, doc)
  const docNorm = normalize(doc.text)

  const items: AnnouncementCandidate[] = []
  const skipped: SkippedItem[] = []
  const seen = new Set<string>()

  for (const it of rawItems) {
    if (!it || typeof it !== 'object') { skipped.push({ title: '(unreadable item)', reason: 'Not an object' }); continue }
    const o = it as Record<string, unknown>
    const title = str(o.title, MAX.title)
    const label = title ?? (str(o.quote, 80) ?? '(untitled item)')
    const skip = (reason: string) => skipped.push({ title: label, reason })

    const section = SECTIONS.find(s => s === o.section)
    if (!section) { skip(`Section "${String(o.section)}" isn’t published (only Urgent, New Announcements, Info Updates and Social Media Findings are)`); continue }
    if (!title) { skip('No title'); continue }
    const body = str(o.body, MAX.body)
    if (!body) { skip('No finding text'); continue }
    const quote = str(o.quote, MAX.quote)
    if (!quote || quote.length < MIN_QUOTE || !docNorm.includes(normalize(quote))) {
      skip('Its quoted text was not found in the document, so it was left out (nothing is invented)')
      continue
    }

    const school = str(o.school, MAX.school)
    const exam = str(o.exam, MAX.school)
    const eventDate = isIsoDate(o.event_date) && dateMentioned(doc.text, o.event_date) ? o.event_date : null
    const eventType = (EVENT_TYPES as readonly string[]).includes(o.event_type as string) ? (o.event_type as string) : null
    const sources = [...new Set(
      (Array.isArray(o.sources) ? o.sources : [])
        .filter((u): u is string => typeof u === 'string')
        .map(trimUrl)
        .filter(u => /^https?:\/\/[^\s]+$/i.test(u) && doc.text.includes(u)),
    )].slice(0, MAX.sources)

    const id = announcementId(reportDate, school ?? exam, quote)
    if (seen.has(id)) { skip('Duplicate of another item from the same finding'); continue }
    seen.add(id)

    const update: AdmissionsUpdateRow = {
      id,
      report_date: reportDate,
      severity: SEVERITY[section],
      school_slug: null,
      school_name: [school, exam].filter(Boolean).join(' — ') || null,
      title,
      body,
      action_required: str(o.action_required, MAX.action),
      event_date: eventDate,
      event_type: eventType,
      sources,
      verified: section !== 'social',
    }
    items.push({ id, section, quote, update })
  }

  if (items.length === 0) {
    const why = [...new Set(skipped.map(s => s.reason))].slice(0, 3).join('; ')
    return { ok: false, message: `No announcements could be read from this document${why ? ` (${why})` : ''}.` }
  }
  return { ok: true, reportDate, items, skipped }
}

/** One model call per document, then parseExtraction. Never throws. */
export async function extractAnnouncements(doc: ReportDoc, ask: AskModel): Promise<ExtractResult> {
  if (!doc.text.trim()) return { ok: false, message: 'The document is empty.' }
  if (doc.text.length > MAX_REPORT_CHARS) {
    return { ok: false, message: `The document is longer than ${MAX_REPORT_CHARS.toLocaleString('en-US')} characters — split it into one report per Doc.` }
  }
  let raw: string | null
  try {
    raw = await ask(buildExtractionPrompt(doc))
  } catch (err) {
    return { ok: false, message: `AI extraction failed (${err instanceof Error ? err.message : String(err)}). The file will be read again on the next sync.` }
  }
  if (raw === null) {
    return { ok: false, message: 'AI isn’t available (GEMINI_API_KEY is not set, or this run’s AI budget is spent), so the report can’t be read yet.' }
  }
  return parseExtraction(raw, doc)
}

const DIFF_FIELDS = ['report_date', 'severity', 'school_name', 'title', 'body', 'action_required', 'event_date', 'event_type', 'sources'] as const

function comparable(field: typeof DIFF_FIELDS[number], v: unknown): string {
  if (field === 'sources') return JSON.stringify(Array.isArray(v) ? v : [])
  if (field === 'report_date' || field === 'event_date') return v ? String(v).slice(0, 10) : ''
  return v === null || v === undefined ? '' : String(v)
}

/**
 * Labels each candidate against the live admissions_updates rows: new, update
 * (with the changed fields) or unchanged. `verified` is not compared — an admin
 * may have verified a row by hand, and publishing never un-verifies one.
 */
export function diffAnnouncements(
  items: AnnouncementCandidate[],
  live: (Pick<AdmissionsUpdateRow, 'id' | typeof DIFF_FIELDS[number]> & Partial<AdmissionsUpdateRow>)[],
): AnnouncementRow[] {
  const byId = new Map(live.map(r => [r.id, r]))
  return items.map(item => {
    const cur = byId.get(item.id)
    if (!cur) return { ...item, action: 'new', changes: [] }
    const changes = DIFF_FIELDS.filter(f => comparable(f, cur[f]) !== comparable(f, item.update[f]))
    return { ...item, action: changes.length ? 'update' : 'unchanged', changes }
  })
}
