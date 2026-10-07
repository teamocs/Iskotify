// Weekly admissions report (a Google Doc, exported as plain text) → structured
// admissions_updates rows, through the AI. The model only points at findings;
// everything that matters is taken from, or checked against, the document:
//
//   - every item must quote the document verbatim (≥ 40 characters, found in
//     it), or it is left out — so a finding can't be invented;
//   - the section (and so the severity, and whether it is verified) comes from
//     the report heading above the quote, never from the model: Urgent →
//     urgent, New Announcements → important, Info Updates → info, Social Media
//     Findings → info and unverified. Quotes under No Change Confirmed, Unable
//     to Verify, the action items, or no heading at all are left out;
//   - a school/exam the item names must appear at, or just above, the quote;
//   - source URLs and the event date are kept only when written right after
//     the quote (≤ ~500 characters, within the same finding);
//   - a title or summary mostly not found in the report around the quote is
//     flagged: the preview starts it unticked and publishing needs an admin's tick;
//   - ids are deterministic: report date + school + a hash of the quote, so a
//     re-run over the same document updates the same rows.
//
// Nothing here publishes: the rows land in an announcement preview batch, and
// an admin publishes them (app/api/admin/announcements/import/[id]/publish).

import { createHash } from 'crypto'
import { extractJson, type AskModel } from '../ai/mapColumns'
import { slugify } from '../listings/planImport'
import { sourceUrls, toSourceLinks } from './sources'
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
/** Severity is a function of the report section — never taken from the model. */
export const severityOf = (section: ReportSection): UpdateSeverity => SEVERITY[section]
/** Only Social Media Findings publish unverified. */
export const verifiedOf = (section: ReportSection): boolean => section !== 'social'

export const EVENT_TYPES = ['application', 'deadline', 'exam', 'results', 'registration', 'interview', 'orientation', 'other'] as const

const MAX = { title: 160, body: 2000, school: 120, action: 500, quote: 1000 }
export const MIN_QUOTE = 40
/** How far after the quote its sources and date may be (and the summary is checked against). */
const AFTER_QUOTE = 500
/** How far above the quote the school/exam header may be. */
const BEFORE_QUOTE = 300
/** Below this share of a title's (or summary's) words found in the report, the row is flagged. */
const MIN_SUPPORT = 0.5
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const lowerAscii = (s: string) => s.replace(/[A-Z]/g, c => c.toLowerCase())

/** Spacing and dash/quote style don't count; case is kept (and only ASCII is lower-cased later, so offsets line up). */
function normalizeKeepCase(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Case, spacing and dash/quote style don't count when matching or hashing text. */
const normalize = (s: string) => lowerAscii(normalizeKeepCase(s))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

/**
 * Whether the text states this calendar date: ISO, "06/20/2026", or a month
 * name + day ("June 20", "Jun. 20", "20 June", "JUNE 20"). The month must be
 * capitalised, or a full name in lower case — but never "may", so the verb
 * ("results may 5…") can't pass for a date.
 */
export function dateMentioned(text: string, iso: string): boolean {
  if (!isIsoDate(iso)) return false
  if (text.includes(iso)) return true
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const full = MONTHS[m - 1]!
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1)
  const names = [full, full.slice(0, 3), ...(full === 'september' ? ['sept'] : [])]
  const forms = [...new Set([...names.map(cap), ...names.map(n => n.toUpperCase()), ...(full !== 'may' ? [full] : [])])].join('|')
  const day = `0?${d}(?:st|nd|rd|th)?`
  const patterns = [
    new RegExp(`(?<![A-Za-z])(?:${forms})\\.?\\s+${day}(?![0-9])`),
    new RegExp(`(?<![0-9])${day}\\s+(?:of\\s+)?(?:${forms})(?![A-Za-z])`),
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

// ── The document, indexed ──────────────────────────────────────────────────

const HEADINGS: { re: RegExp; section: ReportSection | null; name: string }[] = [
  { re: /^urgent\b/, section: 'urgent', name: 'Urgent' },
  { re: /^new announcements?\b/, section: 'new', name: 'New Announcements' },
  { re: /^info(?:rmation)? updates?\b/, section: 'info', name: 'Info Updates' },
  { re: /^social media findings?\b/, section: 'social', name: 'Social Media Findings' },
  { re: /^no changes?(?: confirmed)?\b/, section: null, name: 'No Change Confirmed' },
  { re: /^unable to verify\b/, section: null, name: 'Unable to Verify' },
  { re: /^iskotify app action items?\b/, section: null, name: 'Iskotify App Action Items' },
]
// A heading is a short line of its own; a finding sentence that merely starts with "Urgent" is not.
const MAX_HEADING_CHARS = 60
// "PUP — PUPCET": a short line that starts the next finding.
const ITEM_HEADER = /^[A-Za-z][^.!?]{0,50}\s[-–—]\s[^.!?]{1,50}$/

interface Heading { at: number; section: ReportSection | null; name: string }

interface DocIndex {
  /** The document normalised (case kept), lines joined by single spaces. */
  keep: string
  /** `keep` with ASCII lower-cased — same length, so offsets are shared. */
  low: string
  headings: Heading[]
  /** Offsets where a section heading or a finding's header line starts. */
  boundaries: number[]
}

function indexDoc(text: string): DocIndex {
  const parts: string[] = []
  const headings: Heading[] = []
  const boundaries: number[] = []
  let length = 0
  for (const line of text.split(/\r?\n/)) {
    const n = normalizeKeepCase(line)
    if (!n) continue
    const at = parts.length === 0 ? 0 : length + 1
    if (n.length <= MAX_HEADING_CHARS) {
      const bare = lowerAscii(n).replace(/^[^a-z]+/, '')
      const h = HEADINGS.find(x => x.re.test(bare))
      if (h) {
        headings.push({ at, section: h.section, name: h.name })
        boundaries.push(at)
      } else if (ITEM_HEADER.test(n) && !/https?:/.test(n)) {
        boundaries.push(at)
      }
    }
    parts.push(n)
    length = at + n.length
  }
  const keep = parts.join(' ')
  return { keep, low: lowerAscii(keep), headings, boundaries }
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'are', 'was', 'were', 'has', 'have', 'its', 'into',
  'via', 'about', 'after', 'before', 'their', 'they', 'you', 'your', 'can', 'not', 'all', 'now', 'than', 'then',
  'been', 'also', 'may', 'per', 'our', 'out', 'who', 'what', 'when', 'which', 'should', 'would', 'could',
])

function words(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !STOP.has(w))
    .map(w => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w))
}

/** Share of `text`'s distinct words found in `reference` (1 when it has none). */
function support(text: string, reference: string): number {
  const ws = [...new Set(words(text))]
  if (ws.length === 0) return 1
  const ref = new Set(words(reference))
  return ws.filter(w => ref.has(w)).length / ws.length
}

const named = (low: string, name: string) =>
  new RegExp(`(?<![a-z0-9])${escapeRe(normalize(name))}(?![a-z0-9])`).test(low)

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
- "quote" must be copied EXACTLY, character for character, from the report: the sentence(s) the finding comes from (at least 40 characters). Items without such a quote are discarded.
- "title" and "body" must use the words of the finding itself; do not add facts.
- "event_date" only when the finding itself clearly states the date of the deadline/exam/release (YYYY-MM-DD); otherwise null. Never guess a date.
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
      "quote": "an exact excerpt of the report, at least 40 characters",
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
    return { ok: false, message: 'The AI’s answer wasn’t valid JSON, so nothing was imported. The file will be read again on a later sync.' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray((parsed as { items?: unknown }).items)) {
    return { ok: false, message: 'The AI’s answer didn’t have the expected shape (an "items" list), so nothing was imported. The file will be read again on a later sync.' }
  }
  const { report_date: aiDate, items: rawItems } = parsed as { report_date?: unknown; items: unknown[] }
  const reportDate = resolveReportDate(aiDate, doc)
  const index = indexDoc(doc.text)

  const items: AnnouncementCandidate[] = []
  const skipped: SkippedItem[] = []
  const seen = new Set<string>()

  for (const it of rawItems) {
    if (!it || typeof it !== 'object') { skipped.push({ title: '(unreadable item)', reason: 'Not an object' }); continue }
    const o = it as Record<string, unknown>
    const title = str(o.title, MAX.title)
    const label = title ?? (str(o.quote, 80) ?? '(untitled item)')
    const skip = (reason: string) => skipped.push({ title: label, reason })

    if (!title) { skip('No title'); continue }
    const body = str(o.body, MAX.body)
    if (!body) { skip('No finding text'); continue }

    // Where the finding is in the report.
    const quote = str(o.quote, MAX.quote)
    const pos = quote && quote.length >= MIN_QUOTE ? index.low.indexOf(normalize(quote)) : -1
    if (!quote || pos < 0) {
      skip(`Its quoted text (at least ${MIN_QUOTE} characters) was not found in the document, so it was left out (nothing is invented)`)
      continue
    }
    const end = pos + normalize(quote).length

    // Its section: the heading above it — never the model's say-so.
    const heading = [...index.headings].reverse().find(h => h.at <= pos)
    if (!heading) { skip('It isn’t under any of the report’s section headings'); continue }
    if (!heading.section) { skip(`It sits under “${heading.name}”, which isn’t published`); continue }
    const section = heading.section

    // The school/exam it names must be at, or just above, the quote (within its section).
    const school = str(o.school, MAX.school)
    const exam = str(o.exam, MAX.school)
    const around = index.low.slice(Math.max(heading.at, pos - BEFORE_QUOTE), end)
    const missing = [school, exam].find(n => n && !named(around, n))
    if (missing) { skip(`“${missing}” isn’t named at or just above the quoted text`); continue }

    // What follows the quote, up to the next finding or section (≤ AFTER_QUOTE characters).
    const next = index.boundaries.find(b => b > end)
    const after = index.keep.slice(pos, Math.min(end + AFTER_QUOTE, next ?? Infinity))

    const eventDate = isIsoDate(o.event_date) && dateMentioned(after, o.event_date) ? o.event_date : null
    const eventType = (EVENT_TYPES as readonly string[]).includes(o.event_type as string) ? (o.event_type as string) : null
    const sources = toSourceLinks(
      sourceUrls(o.sources).map(trimUrl).filter(u => after.includes(u)),
    )

    const id = announcementId(reportDate, school ?? exam, quote)
    if (seen.has(id)) { skip('Duplicate of another item from the same finding'); continue }
    seen.add(id)

    const warnings = [
      support(title, quote) < MIN_SUPPORT ? 'The title is mostly not in the quoted text' : '',
      support(body, after) < MIN_SUPPORT ? 'The summary is mostly not in the report around the quote' : '',
    ].filter(Boolean)

    const update: AdmissionsUpdateRow = {
      id,
      report_date: reportDate,
      severity: severityOf(section),
      school_slug: null,
      school_name: [school, exam].filter(Boolean).join(' — ') || null,
      title,
      body,
      action_required: str(o.action_required, MAX.action),
      event_date: eventDate,
      event_type: eventType,
      sources,
      verified: verifiedOf(section),
    }
    items.push({ id, section, quote, warning: warnings.length ? `${warnings.join('; ')} — check it before publishing.` : null, update })
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
    return { ok: false, message: `AI extraction failed (${err instanceof Error ? err.message : String(err)}). The file will be read again on a later sync.` }
  }
  if (raw === null) {
    return { ok: false, message: 'AI isn’t available (GEMINI_API_KEY is not set, or this run’s AI budget is spent), so the report can’t be read yet.' }
  }
  return parseExtraction(raw, doc)
}

const DIFF_FIELDS = ['report_date', 'severity', 'school_name', 'title', 'body', 'action_required', 'event_date', 'event_type', 'sources'] as const

function comparable(field: typeof DIFF_FIELDS[number], v: unknown): string {
  if (field === 'sources') return JSON.stringify(sourceUrls(v))
  if (field === 'report_date' || field === 'event_date') return v ? String(v).slice(0, 10) : ''
  return v === null || v === undefined ? '' : String(v)
}

/**
 * Labels each candidate against the live admissions_updates rows: new, update
 * (with the changed fields) or unchanged. `verified` is not compared — an admin
 * may have verified a row by hand, and publishing never un-verifies one.
 * Sources compare by URL, whichever shape the live row holds.
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
