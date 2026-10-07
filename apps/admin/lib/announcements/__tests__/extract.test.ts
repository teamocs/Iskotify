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
This report covers admissions news gathered during the week of June 8 to June 14.

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
ADMU — ACET: no new announcement was posted on the ACET admissions page this week.

Unable to Verify
FEU: a rumored expansion of the FEU scholarship program could not be confirmed.

Iskotify App Action Items
- Update the PUPCET deadline in the app to June 20.
`

const DOC: ReportDoc = { text: REPORT, fileName: 'Weekly Admissions Report', modifiedTime: '2026-06-15T03:00:00Z' }

const PUP = {
  section: 'urgent', school: 'PUP', exam: 'PUPCET',
  title: 'PUPCET application deadline moved to June 20',
  body: 'The PUPCET application deadline was moved to June 20, 2026. Applicants submit through the iApply portal.',
  quote: 'The PUPCET application deadline was moved to June 20, 2026.',
  event_date: '2026-06-20', event_type: 'deadline',
  action_required: 'Update the PUPCET deadline in the app to June 20.',
  sources: ['https://www.pup.edu.ph/iapply'],
}
const UP = {
  section: 'new', school: 'UP', exam: 'UPCAT',
  title: 'UPCAT 2027 results released June 30',
  body: 'UPCAT 2027 results will be released on June 30, 2026 via the UPCAT results portal.',
  quote: 'UPCAT 2027 results will be released on June 30, 2026 via the UPCAT results portal.',
  event_date: '2026-06-30', event_type: 'results', action_required: null,
  sources: ['https://upcat.up.edu.ph/results'],
}
const DLSU = {
  section: 'info', school: 'DLSU', exam: 'DCAT',
  title: 'DCAT testing slots are first-come, first-served',
  body: 'DLSU reminded applicants that DCAT testing slots are first-come, first-served.',
  quote: 'DLSU reminded applicants that DCAT testing slots are first-come, first-served.',
  event_date: null, event_type: null, action_required: null,
  sources: ['https://www.dlsu.edu.ph/admissions'],
}
const UST = {
  section: 'social', school: 'UST', exam: 'USTET',
  title: 'USTET results may come out in early July',
  body: 'A Facebook post says USTET results may come out in early July.',
  quote: 'A Facebook post says USTET results may come out in early July.',
  event_date: null, event_type: 'results', action_required: null,
  sources: ['https://facebook.com/ustadmissions/posts/1'],
}
const ITEMS = [PUP, UP, DLSU, UST]
const AI_JSON = { report_date: '2026-06-14', items: ITEMS }
const parse = (items: unknown[], doc: ReportDoc = DOC) => parseExtraction(JSON.stringify({ ...AI_JSON, items }), doc)
const ok = (r: ReturnType<typeof parseExtraction>) => {
  if (!r.ok) throw new Error(`expected ok: ${r.message}`)
  return r
}

describe('parseExtraction: valid AI output', () => {
  const out = ok(parseExtraction(JSON.stringify(AI_JSON), DOC))

  it('returns one admissions_updates row per finding, with the report date', () => {
    expect(out.reportDate).toBe('2026-06-14')
    expect(out.items).toHaveLength(4)
    expect(out.skipped).toEqual([])
  })

  it('maps sections to severity: Urgent→urgent, New→important, Info→info, Social→info', () => {
    expect(out.items.map(i => i.update.severity)).toEqual(['urgent', 'important', 'info', 'info'])
    expect(out.items.map(i => i.section)).toEqual(['urgent', 'new', 'info', 'social'])
  })

  it('marks social-media findings unverified and the rest verified-on-publish', () => {
    expect(out.items.map(i => i.update.verified)).toEqual([true, true, true, false])
  })

  it('fills the row from the item, with sources as {label, url} links, and leaves school_slug unset', () => {
    const pup = out.items[0]!.update
    expect(pup).toMatchObject({
      report_date: '2026-06-14',
      school_slug: null,
      school_name: 'PUP — PUPCET',
      title: 'PUPCET application deadline moved to June 20',
      event_date: '2026-06-20',
      event_type: 'deadline',
      action_required: 'Update the PUPCET deadline in the app to June 20.',
      sources: [{ label: 'pup.edu.ph', url: 'https://www.pup.edu.ph/iapply' }],
    })
    expect(pup.id).toMatch(/^2026-06-14-pup-[0-9a-f]{10}$/)
  })

  it('raises no review warning when the title and body come from the quoted text', () => {
    expect(out.items.map(i => i.warning)).toEqual([null, null, null, null])
  })

  it('accepts JSON wrapped in a code fence', () => {
    expect(parseExtraction('```json\n' + JSON.stringify(AI_JSON) + '\n```', DOC).ok).toBe(true)
  })
})

describe('parseExtraction: the section comes from the document, not the model', () => {
  it('uses the heading above the quote, whatever section the model claimed', () => {
    const out = ok(parse([{ ...DLSU, section: 'urgent' }, { ...UST, section: 'urgent' }]))
    expect(out.items.map(i => [i.section, i.update.severity, i.update.verified])).toEqual([
      ['info', 'info', true],
      ['social', 'info', false],
    ])
  })

  it('also works when the model leaves the section out', () => {
    const out = ok(parse([{ ...UP, section: undefined }]))
    expect(out.items[0]!.section).toBe('new')
  })

  it('leaves out findings quoted from No Change Confirmed, Unable to Verify or before any section', () => {
    const out = parse([
      { ...PUP, quote: 'ADMU — ACET: no new announcement was posted on the ACET admissions page this week.', school: 'ADMU', exam: 'ACET' },
      { ...PUP, quote: 'a rumored expansion of the FEU scholarship program could not be confirmed.', school: 'FEU', exam: null },
      { ...PUP, quote: 'This report covers admissions news gathered during the week of June 8 to June 14.', school: null, exam: null },
    ])
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.message).toMatch(/No announcements could be read/)
    const reasons = ok(parse([PUP, { ...PUP, quote: 'ADMU — ACET: no new announcement was posted on the ACET admissions page this week.', school: 'ADMU', exam: 'ACET' }])).skipped
    expect(reasons[0]!.reason).toMatch(/No Change Confirmed/)
  })
})

describe('parseExtraction: never invents facts', () => {
  it('requires a quote of at least 40 characters that is in the document', () => {
    const out = ok(parse([PUP, { ...UP, quote: 'UPCAT 2027 results' }, { ...DLSU, quote: 'DLSU cancelled the DCAT for everyone this year, effective now.' }]))
    expect(out.items).toHaveLength(1)
    expect(out.skipped.map(s => s.reason)).toEqual([
      expect.stringMatching(/not found in the document/),
      expect.stringMatching(/not found in the document/),
    ])
  })

  it('requires the school and exam it names to appear at or just above the quote', () => {
    const out = ok(parse([PUP, { ...DLSU, school: 'ADMU', exam: 'ACET' }]))
    expect(out.items).toHaveLength(1)
    expect(out.skipped[0]).toEqual({ title: DLSU.title, reason: expect.stringMatching(/ADMU.*isn’t named/) })
  })

  it('keeps a source only when it is written within ~500 characters after the quote', () => {
    const out = ok(parse([{ ...DLSU, sources: ['https://www.dlsu.edu.ph/admissions', 'https://www.pup.edu.ph/iapply', 'https://made-up.example.com/x', 'javascript:alert(1)'] }]))
    expect(out.items[0]!.update.sources).toEqual([{ label: 'dlsu.edu.ph', url: 'https://www.dlsu.edu.ph/admissions' }])
  })

  it('keeps an event date only when it is stated near the quote', () => {
    // June 30 is in the document, but under the UP finding, not this one.
    const out = ok(parse([{ ...PUP, event_date: '2026-06-30' }, { ...DLSU, event_date: '2026-07-15' }]))
    expect(out.items.map(i => i.update.event_date)).toEqual([null, null])
  })

  it('clears a malformed date, an unknown event type and over-long fields', () => {
    const out = ok(parse([{ ...DLSU, event_date: 'next week', event_type: 'party', exam: 'DCAT', school: 'DLSU' }]))
    expect(out.items[0]!.update).toMatchObject({ event_date: null, event_type: null })
  })

  it('flags (for the admin) a row whose title is mostly not in the quote', () => {
    const out = ok(parse([PUP, { ...UP, title: 'UPCAT cancelled nationwide, refunds promised' }]))
    expect(out.items[0]!.warning).toBeNull()
    expect(out.items[1]!.warning).toMatch(/title/i)
  })

  it('flags a row whose body is mostly not in the report around the quote', () => {
    const out = ok(parse([{ ...DLSU, body: 'Every applicant must bring two valid identification cards and a printed permit to campus.' }]))
    expect(out.items[0]!.warning).toMatch(/summary/i)
  })

  it('keeps the first of two items with the same id', () => {
    const out = ok(parse([PUP, { ...PUP, title: 'Again' }]))
    expect(out.items).toHaveLength(1)
    expect(out.skipped[0]!.reason).toMatch(/duplicate/i)
  })

  it('leaves out items without a title or body, and non-objects', () => {
    const out = parse([{ ...UP, title: '' }, { ...DLSU, body: '   ' }, 'not an object'])
    expect(out.ok).toBe(false)
  })
})

describe('parseExtraction: malformed output holds the file', () => {
  it('is not ok, with a clear message, for text that is not JSON', () => {
    expect(parseExtraction('Sure! Here are the announcements: …', DOC)).toEqual({ ok: false, message: expect.stringMatching(/wasn.t valid JSON/) })
  })

  it('is not ok when items is missing or not a list', () => {
    expect(parseExtraction(JSON.stringify({ report_date: '2026-06-14' }), DOC).ok).toBe(false)
    expect(parseExtraction(JSON.stringify({ items: 'none' }), DOC).ok).toBe(false)
    expect(parseExtraction('[1,2]', DOC).ok).toBe(false)
  })
})

describe('report date', () => {
  it('uses the AI date only when the document states it', () => {
    const out = ok(parseExtraction(JSON.stringify({ ...AI_JSON, report_date: '2026-06-01' }), { ...DOC, fileName: 'Report 2026-06-13' }))
    expect(out.reportDate).toBe('2026-06-13')
  })

  it('falls back to the file name, then the Drive modified date (Manila)', () => {
    const fromName = ok(parseExtraction(JSON.stringify({ ...AI_JSON, report_date: null }), { ...DOC, fileName: 'Admissions report 2026-06-13' }))
    const fromModified = ok(parseExtraction(JSON.stringify({ ...AI_JSON, report_date: null }), { ...DOC, modifiedTime: '2026-06-15T18:00:00Z' }))
    expect(fromName.reportDate).toBe('2026-06-13')
    expect(fromModified.reportDate).toBe('2026-06-16')
  })
})

describe('ids are stable', () => {
  it('re-running on the same document gives the same ids', () => {
    const a = ok(parseExtraction(JSON.stringify(AI_JSON), DOC))
    const b = ok(parseExtraction(JSON.stringify(AI_JSON), DOC))
    expect(a.items.map(i => i.id)).toEqual(b.items.map(i => i.id))
    expect(new Set(a.items.map(i => i.id)).size).toBe(4)
  })

  it('ignores case, spacing and dash/quote style in the finding, and the AI’s title wording', () => {
    expect(announcementId('2026-06-14', 'PUP', 'The PUPCET deadline — moved')).toBe(announcementId('2026-06-14', 'PUP', '  the pupcet   deadline - moved '))
    const reworded = ok(parse([{ ...PUP, title: 'PUPCET deadline is now June 20' }]))
    const first = ok(parse([PUP]))
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
    expect(dateMentioned('EXAM ON JUNE 20', '2026-06-20')).toBe(true)
    expect(dateMentioned('opens on May 5', '2026-05-05')).toBe(true)
    expect(dateMentioned('on june 20', '2026-06-20')).toBe(true) // a full month name may be lower-case…
  })

  it('does not take the verb "may", a lower-case abbreviation, or another day/month', () => {
    expect(dateMentioned('results may 5 people say', '2026-05-05')).toBe(false) // …but never "may"
    expect(dateMentioned('5 may change', '2026-05-05')).toBe(false)
    expect(dateMentioned('on jun 20', '2026-06-20')).toBe(false)
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
    expect(await extractAnnouncements(DOC, async () => null)).toEqual({ ok: false, message: expect.stringMatching(/GEMINI_API_KEY/) })
  })

  it('holds the file when the model call fails', async () => {
    expect(await extractAnnouncements(DOC, async () => { throw new Error('quota exceeded') })).toEqual({ ok: false, message: expect.stringMatching(/quota exceeded/) })
  })

  it('the prompt pins the schema and the rules, including the 40-character quote', () => {
    const p = buildExtractionPrompt(DOC)
    for (const s of ['"section"', '"quote"', '"event_date"', '"sources"', 'No Change Confirmed', 'Unable to Verify', 'Iskotify App Action Items', 'null', 'at least 40 characters']) {
      expect(p).toContain(s)
    }
  })
})

describe('diffAnnouncements', () => {
  const parsed = ok(parseExtraction(JSON.stringify(AI_JSON), DOC))
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

  it('compares sources by URL, whether the live row holds strings or {label, url} links', () => {
    const rows = diffAnnouncements([pup!], [{ ...pup!.update, sources: ['https://www.pup.edu.ph/iapply'] as never }])
    expect(rows[0]!.action).toBe('unchanged')
  })

  it('does not count verified as a change (an admin may have verified a row by hand)', () => {
    const rows = diffAnnouncements([parsed.items[3]!], [{ ...parsed.items[3]!.update, verified: true }])
    expect(rows[0]!.action).toBe('unchanged')
  })
})
