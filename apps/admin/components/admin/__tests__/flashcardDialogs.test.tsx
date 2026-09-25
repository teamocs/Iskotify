import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/flashcards',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

import { AddCardModal } from '../AddCardModal'
import { AddTopicModal, validateTopicName } from '../AddTopicModal'
import { GenerateMoreModal } from '../GenerateMoreModal'
import { EditCardDialog, validateCard } from '../cardForm'
import { RenameTopicDialog } from '../RenameTopicDialog'
import { SubjectFormDialog, validateSubjectName } from '../SubjectsView'

const noop = () => {}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The dialog's accessible name: the text of the heading its aria-labelledby points at. */
function dialogName(html: string): string {
  const m = html.match(/role="dialog"[^>]*aria-labelledby="([^"]+)"/)
  expect(m, 'dialog with aria-labelledby').toBeTruthy()
  const h = html.match(new RegExp(`id="${esc(m![1]!)}"[^>]*>([^<]+)<`))
  expect(h, 'heading for aria-labelledby').toBeTruthy()
  return h![1]!
}

/** The control a visible <label> is wired to via htmlFor/id. */
function control(html: string, label: string): string {
  const m = html.match(new RegExp(`<label for="([^"]+)"[^>]*>${esc(label)}(<|$)`))
  expect(m, `label "${label}" with htmlFor`).toBeTruthy()
  const c = html.match(new RegExp(`<(input|textarea|select)[^>]*id="${esc(m![1]!)}"[^>]*>`))
  expect(c, `control wired to "${label}"`).toBeTruthy()
  return c![0]
}

const isForm = (html: string) => /<form[^>]*noValidate|<form[^>]*novalidate/i.test(html)

describe('AddCardModal', () => {
  const html = renderToStaticMarkup(<AddCardModal topicId="t1" topicStatus="published" onClose={noop} />)
  it('is a dialog named "Add card" with a real form', () => {
    expect(dialogName(html)).toBe('Add card')
    expect(isForm(html)).toBe(true)
    expect(html).toMatch(/<button type="submit"[^>]*>(<[^>]+>)*Add card/)
  })
  it('wires Question and Answer as required fields and Explanation as optional', () => {
    expect(control(html, 'Question')).toContain('required')
    expect(control(html, 'Answer')).toContain('required')
    expect(control(html, 'Explanation')).not.toContain('required')
  })
})

describe('validateCard', () => {
  it('names each missing required field', () => {
    const e = validateCard({ question: ' ', answer: '', explanation: '' })
    expect(e.question).toBeTruthy()
    expect(e.answer).toBeTruthy()
  })
  it('passes a complete card', () => {
    expect(validateCard({ question: 'Q?', answer: 'A', explanation: '' })).toEqual({})
  })
})

describe('AddTopicModal', () => {
  const html = renderToStaticMarkup(<AddTopicModal subjectId="s1" onClose={noop} />)
  it('is a dialog named "Add topic" with a real form and a required, wired name', () => {
    expect(dialogName(html)).toBe('Add topic')
    expect(isForm(html)).toBe(true)
    expect(control(html, 'Topic name')).toContain('required')
  })
  it('validates a blank name', () => {
    expect(validateTopicName('  ')).toBeTruthy()
    expect(validateTopicName('Algebra')).toBeUndefined()
  })
})

describe('GenerateMoreModal', () => {
  const html = renderToStaticMarkup(
    <GenerateMoreModal open onClose={noop} topicId="t1" topicName="Algebra" subjectName="Math" existingQuestions={['a']} listingSlugs={[]} onSuccess={noop} />,
  )
  it('is a labelled dialog form with a wired count control and no emoji', () => {
    expect(dialogName(html)).toBe('Generate cards with AI')
    expect(isForm(html)).toBe(true)
    expect(control(html, 'Number of cards')).toMatch(/^<select/)
    expect(html).not.toContain('✨')
  })
  it('renders nothing when closed', () => {
    expect(renderToStaticMarkup(
      <GenerateMoreModal open={false} onClose={noop} topicId="t1" topicName="Algebra" subjectName="Math" existingQuestions={[]} listingSlugs={[]} onSuccess={noop} />,
    )).toBe('')
  })
})

describe('EditCardDialog', () => {
  const html = renderToStaticMarkup(
    <EditCardDialog card={{ id: 'c1', question: 'What is 2+2?', answer: '4', explanation: null }} onClose={noop} onSaved={noop} />,
  )
  it('is a dialog form named "Edit card" prefilled with the card', () => {
    expect(dialogName(html)).toBe('Edit card')
    expect(isForm(html)).toBe(true)
    expect(html).toContain('What is 2+2?</textarea>')
    expect(control(html, 'Question')).toContain('required')
  })
})

describe('RenameTopicDialog', () => {
  const html = renderToStaticMarkup(<RenameTopicDialog topicId="t1" currentName="Algebra" onClose={noop} />)
  it('is a dialog form named "Rename topic" with the current name', () => {
    expect(dialogName(html)).toBe('Rename topic')
    expect(isForm(html)).toBe(true)
    const input = control(html, 'Topic name')
    expect(input).toContain('value="Algebra"')
    expect(input).toContain('required')
  })
})

describe('SubjectFormDialog', () => {
  const listings = [
    { id: 'l1', slug: 'dost-sei', title: 'DOST-SEI', provider: 'DOST', type: 'scholarship' as const },
    { id: 'l2', slug: 'cse', title: 'CSE', provider: 'CSC', type: 'exam' as const },
  ]
  it('creates: dialog named "New subject", form, required wired name, grouped listing checkboxes', () => {
    const html = renderToStaticMarkup(<SubjectFormDialog subject={null} listings={listings} onClose={noop} onSaved={noop} />)
    expect(dialogName(html)).toBe('New subject')
    expect(isForm(html)).toBe(true)
    expect(control(html, 'Subject name')).toContain('required')
    expect(html).toMatch(/<fieldset[^>]*>\s*<legend[^>]*>Scholarships<\/legend>/)
    expect(html).toMatch(/<legend[^>]*>Exams<\/legend>/)
    expect(html).toMatch(/<button type="submit"[^>]*>(<[^>]+>)*Create subject/)
  })
  it('edits: dialog named "Edit subject" prefilled with name and linked listings', () => {
    const html = renderToStaticMarkup(
      <SubjectFormDialog subject={{ id: 's1', name: 'Mathematics', listing_slugs: ['dost-sei'] }} listings={listings} onClose={noop} onSaved={noop} />,
    )
    expect(dialogName(html)).toBe('Edit subject')
    expect(control(html, 'Subject name')).toContain('value="Mathematics"')
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""[^>]*value="dost-sei"|<input[^>]*value="dost-sei"[^>]*checked=""/)
  })
  it('validates a blank name', () => {
    expect(validateSubjectName('')).toBeTruthy()
    expect(validateSubjectName('Biology')).toBeUndefined()
  })
})
