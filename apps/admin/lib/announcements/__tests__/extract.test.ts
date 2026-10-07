import { describe, it, expect, vi } from 'vitest'
import {
  extractAnnouncements,
  parseExtraction,
  announcementId,
  dateMentioned,
  diffAnnouncements,
  buildExtractionPrompt,
  type ReportDoc,
} from '../extract'
import type { AdmissionsUpdateRow } from '../types'

const REPORT = `Iskotify Weekly Admissions Report
Report date: June 14, 2026

Urgent (Iskotify Action Required)
PUP — PUPCET
The PUPCET application deadline was moved to June 20, 2026. Applicants must submit through the iApply portal.
Source: https://www.pup.edu.ph/iapply

New Announcements
UP — UPCAT
UPCAT 2027 results will be released on June 30, 2026 via the UPCAT results portal.
Source: https://upcat.up.edu.ph/results

Info Updates
DLSU — DCAT
DLSU reminded applicants that DCAT testing slots are first-come, first-served.
Source: https://www.dlsu.edu.ph/admissions

Social Media Findings
UST — USTET
A Facebook post says USTET results may come out in early July.
Source: https://facebook.com/ustadmissions/posts/1

No Change Confirmed
ADMU — ACET: no new announcement.

Unable to Verify
FEU: rumored scholarship expansion.

Iskotify App Action Items
- Update the PUPCET deadline in the app to June 20.
`

const DOC: ReportDoc = { text: REPORT, fileName: 'Weekly Admissions Report', modifiedTime: '2026-06-15T03:00:00Z' }

const ITEMS = [
  {
    section: 'urgent', school: 'PUP', exam: 'PUPCET',
    title: 'PUPCET application deadline moved to June 20',
    body: 'The PUPCET application deadline was moved to June 20, 2026. Apply through the iApply portal.',
    quote: 'The PUPCET application deadline was moved to June 20, 2026.',
    event_date: '2026-06-20', event_type: 'deadline',
    action_required: 'Update the PUPCET deadline in the app to June 20.',
    sources: ['https://www.pup.edu.ph/iapply'],
  },
  {
    section: 'new', school: 'UP', exam: 'UPCAT',
    title: 'UPCAT 2027 results out June 30',
    body: 'UPCAT 2027 results will be released on June 30, 2026 via the results portal.',
    quote: 'UPCAT 2027 results will be released on June 30, 2026 via the UPCAT results portal.',
    event_date: '2026-06-30', event_type: 'results', action_required: null,
    sources: ['https://upcat.up.edu.ph/results'],
  },
  {
    section: 'info', school: 'DLSU', exam: 'DCAT',
    title: 'DCAT slots are first-come, first-served',
    body: 'DLSU reminded applicants that DCAT testing slots are first-come, first-served.',
    quote: 'DLSU reminded applicants that DCAT testing slots are first-come, first-served.',
    event_date: null, event_type: null, action_required: null,
    sources: ['https://www.dlsu.edu.ph/admissions'],
  },
  {
    section: 'social', school: 'UST', exam: 'USTET',
    title: 'USTET results may come out in early July',
    body: 'A Facebook post says USTET results may come out in early July.',
    quote: 'A Facebook post says USTET results may come out in early July.',
    event_date: null, event_type: 'results', action_required: null,
    sources: ['https://facebook.com/ustadmissions/posts/1'],
  },
]

const AI_JSON = { report_date: '2026-06-14', items: ITEMS }

describe('parseExtraction: valid AI output', () => {
  const out = parseExtraction(JSON.stringify(AI_JSON), DOC)

  it('returns one admissions_updates row per finding, with the report date', () => {
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.reportDate).toBe('2026-06-14')
    expect(out.items).toHaveLength(4)
    expect(out.skipped).toEqual([])
  })

  it('maps sections to severity: Urgent→urgent, New→important, Info→info, Social→info', () => {
    if (!out.ok) throw new Error('expected ok')
    expect(out.items.map(i => i.update.severity)).toEqual(['urgent', 'important', 'info', 'info'])
    expect(out.items.map(i => i.section)).toEqual(['urgent', 'new', 'info', 'social'])
  })

  it('marks social-media findings unverified and the rest verified-on-publish', () => {
    if (!out.ok) throw new Error('expected ok')
    expect(out.items.map(i => i.update.verified)).toEqual([true, true, true, false])
  })

  it('fills the row from the item and leaves school_slug unset (never guessed)', () => {
    if (!out.ok) throw new Error('expected ok')
    const pup = out.items[0]!.update
    expect(pup).toMatchObject({
      report_date: '2026-06-14',
      school_slug: null,
      school_name: 'PUP — PUPCET',
      title: 'PUPCET application deadline moved to June 20',
      event_date: '2026-06-20',
      event_type: 'deadline',
      action_required: 'Update the PUPCET deadline in the app to June 20.',
      sources: ['https://www.pup.edu.ph/iapply'],
    })
    expect(pup.id).toMatch(/^2026-06-14-pup-[0-9a-f]{10}$/)
  })

  it('accepts JSON wrapped in a code fence', () => {
    const fenced = parseExtraction('```json\n' + JSON.stringify(AI_JSON) + '\n```', DOC)
    expect(fenced.ok).toBe(true)
  })
})

describe('parseExtraction: never invents facts', () => {
  it('drops a source URL that is not in the document', () => {
    const out = parseExtraction(JSON.stringify({ ...AI_JSON, items: [{ ...ITEMS[0], sources: ['https://www.pup.edu.ph/iapply', 'https://made-up.example.com/x'] }] }), DOC)
    if (!out.ok) throw new Error('expected ok')
    expect(out.items[0]!.update.sources).toEqual(['https://www.pup.edu.ph/iapply'])
  })

  it('clears an event date the document does not state', () => {
    const out = parseExtraction(JSON.stringify({ ...AI_JSON, items: [{ ...ITEMS[2], event_date: '2026-07-15' }] }), DOC)
    if (!out.ok) throw new Error('expected ok')
    expect(out.items[0]!.update.event_date).toBeNull()
  })

  it('clears a malformed date, an unknown event type and over-long fields', () => {
    const out = parseExtraction(JSON.stringify({ ...AI_JSON, items: [{ ...ITEMS[2], event_date: 'next week', event_type: 'party', school: 'x'.repeat(500) }] }), DOC)
    if (!out.ok) throw new Error('expected ok')
    expect(out.items[0]!.update).toMatchObject({ event_date: null, event_type: null })
    expect(out.items[0]!.update.school_name!.length).toBeLessThanOrEqual(130)
  })

  it('leaves out an item whose quote is not in the document', () => {
    const out = parseExtraction(JSON.stringify({ ...AI_JSON, items: [ITEMS[0], { ...ITEMS[1], quote: 'UPCAT is cancelled this year.' }] }), DOC)
    if (!out.ok) throw new Error('expected ok')
    expect(out.items).toHaveLength(1)
    expect(out.skipped).toEqual([{ title: ITEMS[1]!.title, reason: expect.stringMatching(/not found in the document/) }])
  })

  it('leaves out No Change / Unable to Verify / unknown sections and items without a title or body', () => {
    const out = parseExtraction(JSON.stringify({ ...AI_JSON, items: [
      { ...ITEMS[0], section: 'no_change' },
      { ...ITEMS[0], section: 'unable_to_verify' },
      { ...ITEMS[1], title: '' },
      { ...ITEMS[2], body: '   ' },
      'not an object',
    ] }), DOC)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.message).toMatch(/No announcements could be read/)
  })

  it('keeps the first of two items with the same id', () => {
    const out = parseExtraction(JSON.stringify({ ...AI_JSON, items: [ITEMS[0], { ...ITEMS[0], title: 'Again' }] }), DOC)
    if (!out.ok) throw new Error('expected ok')
    expect(out.items).toHaveLength(1)
    expect(out.skipped[0]!.reason).toMatch(/duplicate/i)
  })
})

describe('parseExtraction: malformed output holds the file', () => {
  it('is not ok, with a clear message, for text that is not JSON', () => {
    const out = parseExtraction('Sure! Here are the announcements: …', DOC)
    expect(out).toEqual({ ok: false, message: expect.stringMatching(/wasn.t valid JSON/) })
  })

  it('is not ok when items is missing or not a list', () => {
    expect(parseExtraction(JSON.stringify({ report_date: '2026-06-14' }), DOC).ok).toBe(false)
    expect(parseExtraction(JSON.stringify({ items: 'none' }), DOC).ok).toBe(false)
    expect(parseExtraction('[1,2]', DOC).ok).toBe(false)
  })
})

describe('report date', () => {
  it('uses the AI date only when the document states it', () => {
    const out = parseExtraction(JSON.stringify({ ...AI_JSON, report_date: '2026-06-01' }), { ...DOC, fileName: 'Report 2026-06-13' })
    if (!out.ok) throw new Error('expected ok')
    expect(out.reportDate).toBe('2026-06-13')
  })

  it('falls back to the file name, then the Drive modified date (Manila)', () => {
    const fromName = parseExtraction(JSON.stringify({ ...AI_JSON, report_date: null }), { ...DOC, fileName: 'Admissions report 2026-06-13' })
    const fromModified = parseExtraction(JSON.stringify({ ...AI_JSON, report_date: null }), { ...DOC, modifiedTime: '2026-06-15T18:00:00Z' })
    if (!fromName.ok || !fromModified.ok) throw new Error('expected ok')
    expect(fromName.reportDate).toBe('2026-06-13')
    expect(fromModified.reportDate).toBe('2026-06-16') // 02:00 on the 16th in Manila
  })
})

describe('ids are stable', () => {
  it('re-running on the same document gives the same ids', () => {
    const a = parseExtraction(JSON.stringify(AI_JSON), DOC)
    const b = parseExtraction(JSON.stringify(AI_JSON), DOC)
    if (!a.ok || !b.ok) throw new Error('expected ok')
    expect(a.items.map(i => i.id)).toEqual(b.items.map(i => i.id))
    expect(new Set(a.items.map(i => i.id)).size).toBe(4)
  })

  it('ignores case, spacing and dash/quote style in the finding, and the AI’s title wording', () => {
    expect(announcementId('2026-06-14', 'PUP', 'The PUPCET deadline — moved')).toBe(announcementId('2026-06-14', 'PUP', '  the pupcet   deadline - moved '))
    const reworded = parseExtraction(JSON.stringify({ ...AI_JSON, items: [{ ...ITEMS[0], title: 'PUPCET deadline is now June 20' }] }), DOC)
    const first = parseExtraction(JSON.stringify(AI_JSON), DOC)
    if (!reworded.ok || !first.ok) throw new Error('expected ok')
    expect(reworded.items[0]!.id).toBe(first.items[0]!.id)
  })

  it('differs by report date and school', () => {
    const q = 'The PUPCET deadline moved.'
    expect(announcementId('2026-06-14', 'PUP', q)).not.toBe(announcementId('2026-06-21', 'PUP', q))
    expect(announcementId('2026-06-14', 'PUP', q)).not.toBe(announcementId('2026-06-14', 'UP', q))
    expect(announcementId('2026-06-14', null, q)).toMatch(/^2026-06-14-general-/)
  })
})

describe('dateMentioned', () => {
  it('finds the common ways a report writes a date', () => {
    expect(dateMentioned('deadline is June 20, 2026', '2026-06-20')).toBe(true)
    expect(dateMentioned('deadline: Jun. 20', '2026-06-20')).toBe(true)
    expect(dateMentioned('on 20 June 2026', '2026-06-20')).toBe(true)
    expect(dateMentioned('on 06/20/2026', '2026-06-20')).toBe(true)
    expect(dateMentioned('on 2026-06-20', '2026-06-20')).toBe(true)
    expect(dateMentioned('Sept 3', '2026-09-03')).toBe(true)
  })

  it('does not match a different day or month', () => {
    expect(dateMentioned('June 2, 2026', '2026-06-20')).toBe(false)
    expect(dateMentioned('July 20', '2026-06-20')).toBe(false)
    expect(dateMentioned('June 200 people', '2026-06-20')).toBe(false)
  })
})

describe('extractAnnouncements', () => {
  it('asks the model once with the document and parses its answer', async () => {
    const ask = vi.fn(async (_prompt: string) => JSON.stringify(AI_JSON))
    const out = await extractAnnouncements(DOC, ask)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0]![0]).toContain('PUPCET application deadline')
    expect(out.ok).toBe(true)
  })

  it('holds the file when no model is configured', async () => {
    const out = await extractAnnouncements(DOC, async () => null)
    expect(out).toEqual({ ok: false, message: expect.stringMatching(/GEMINI_API_KEY/) })
  })

  it('holds the file when the model call fails', async () => {
    const out = await extractAnnouncements(DOC, async () => { throw new Error('quota exceeded') })
    expect(out).toEqual({ ok: false, message: expect.stringMatching(/quota exceeded/) })
  })

  it('the prompt pins the schema and the rules', () => {
    const p = buildExtractionPrompt(DOC)
    for (const s of ['"section"', '"quote"', '"event_date"', '"sources"', 'No Change Confirmed', 'Unable to Verify', 'Iskotify App Action Items', 'null']) {
      expect(p).toContain(s)
    }
  })
})

describe('diffAnnouncements', () => {
  const parsed = parseExtraction(JSON.stringify(AI_JSON), DOC)
  if (!parsed.ok) throw new Error('expected ok')
  const [pup, up] = parsed.items

  it('labels rows new, update (with the changed fields) or unchanged against live rows', () => {
    const live: AdmissionsUpdateRow[] = [
      { ...pup!.update },
      { ...up!.update, title: 'Old title', sources: [] },
    ]
    const rows = diffAnnouncements(parsed.items, live)
    expect(rows.map(r => r.action)).toEqual(['unchanged', 'update', 'new', 'new'])
    expect(rows[1]!.changes).toEqual(['title', 'sources'])
  })

  it('does not count verified as a change (an admin may have verified a row by hand)', () => {
    const rows = diffAnnouncements([parsed.items[3]!], [{ ...parsed.items[3]!.update, verified: true }])
    expect(rows[0]!.action).toBe('unchanged')
  })
})
