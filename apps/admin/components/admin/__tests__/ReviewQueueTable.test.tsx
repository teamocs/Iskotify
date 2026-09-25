import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/upcat/review-queue',
  useSearchParams: () => new URLSearchParams(search),
}))

import fs from 'fs'
import path from 'path'
import { ReviewQueueTable, type ReviewItem } from '../ReviewQueueTable'
import { optionsFingerprint } from '@/lib/admin/reviewQueue'

const items: ReviewItem[] = [
  {
    question_id: 'M001', question_text: 'Which is prime?', options: ['12', '15', '13', 'All of the above'],
    correct_index: 2, main_subject: 'Math', topic: 'Number theory', flags: ['none_or_all_of_above'],
  },
  {
    question_id: 'S002', question_text: 'Unit of force?', options: ['N', 'Joule', 'Watt', 'Pascal'],
    correct_index: 0, main_subject: 'Science', topic: 'Physics', flags: ['length_asymmetry'],
  },
]

type Dismissal = { question_id: string; options_fingerprint: string }
const render = (q = '', dismissals: Dismissal[] = []) => {
  search = q
  return renderToStaticMarkup(<ReviewQueueTable items={items} dismissals={dismissals} />)
}

describe('ReviewQueueTable', () => {
  it('uses human column labels', () => {
    const html = render()
    for (const h of ['Question ID', 'Subject / topic', 'Question', 'Options', 'Flags']) {
      expect(html).toContain(`>${h}<`)
    }
  })

  it('marks the correct option with a check glyph and screen-reader text, not colour alone', () => {
    const html = render()
    expect(html).toContain('data-correct="true"')
    expect(html).toMatch(/data-correct="true"[^>]*>[\s\S]*?<svg[\s\S]*?13[\s\S]*?\(correct answer\)/)
    expect(html).toContain('<span class="sr-only">(correct answer)</span>')
  })

  it('offers labelled Edit and Dismiss flag actions per row', () => {
    const html = render()
    expect(html).toContain('aria-label="Edit question M001"')
    expect(html).toContain('aria-label="Dismiss flag on M001"')
  })

  it('filters by flag type and by subject', () => {
    const html = render()
    expect(html).toContain('>Flag<')
    expect(html).toContain('>Subject<')
    expect(html).toContain('None/All of the above')
    expect(html).toContain('<option value="Science">Science</option>')
    const onlyScience = render('subject=Science')
    expect(onlyScience).toContain('S002')
    expect(onlyScience).not.toContain('M001')
    const onlyNone = render('flag=none_or_all_of_above')
    expect(onlyNone).toContain('M001')
    expect(onlyNone).not.toContain('S002')
  })

  it('has a Show dismissed toggle with a count', () => {
    expect(render()).toMatch(/Show dismissed \(0\)/)
  })

  it('says the queue is clear when nothing is flagged', () => {
    search = ''
    const html = renderToStaticMarkup(<ReviewQueueTable items={[]} dismissals={[]} />)
    expect(html).toContain('No flagged questions')
    expect(html).not.toMatch(/🎉/u)
  })

  it('hides a question dismissed on the server and counts it in the toggle', () => {
    const html = render('', [{ question_id: 'M001', options_fingerprint: optionsFingerprint(items[0]!.options) }])
    expect(html).not.toContain('Which is prime?')
    expect(html).toContain('Unit of force?')
    expect(html).toMatch(/Show dismissed \(1\)/)
  })

  it('brings a flag back when the options changed since it was dismissed', () => {
    const html = render('', [{ question_id: 'M001', options_fingerprint: optionsFingerprint(['12', '15', '13', '11']) }])
    expect(html).toContain('Which is prime?')
    expect(html).toMatch(/Show dismissed \(0\)/)
  })

  it('keeps dismissals on the server, not in browser storage', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../ReviewQueueTable.tsx'), 'utf8')
    expect(src).not.toMatch(/localStorage/)
    expect(src).toContain('/api/admin/question-flags')
  })
})
