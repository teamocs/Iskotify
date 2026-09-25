import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}))

import { QuestionEditDrawer } from '../QuestionEditDrawer'

const question = {
  question_id: 'M001',
  question_text: 'Which is prime?',
  options: ['12', '15', '13', 'All of the above'],
  correct_index: 2,
}

const render = () => renderToStaticMarkup(<QuestionEditDrawer question={question} onClose={() => {}} />)

describe('QuestionEditDrawer', () => {
  it('is a real form titled for the question', () => {
    const html = render()
    expect(html).toContain('<form')
    expect(html).toContain('Edit question M001')
    expect(html).toMatch(/<button type="submit"[^>]*>[\s\S]*Save changes/)
  })

  it('wires a label to the question text and to each option', () => {
    const html = render()
    const qid = html.match(/<label for="([^"]+)"[^>]*>Question text/)
    expect(qid).not.toBeNull()
    expect(html).toContain(`id="${qid![1]}"`)
    expect(html).toContain('>Which is prime?</textarea>')
    for (const letter of ['A', 'B', 'C', 'D']) {
      const m = html.match(new RegExp(`<label for="([^"]+)"[^>]*>Option ${letter}`))
      expect(m, `Option ${letter}`).not.toBeNull()
      expect(html).toContain(`id="${m![1]}"`)
    }
    expect(html).toContain('value="All of the above"')
  })

  it('picks the correct answer from a labelled radio group', () => {
    const html = render()
    expect(html).toMatch(/<fieldset[\s\S]*<legend[^>]*>Correct answer/)
    expect((html.match(/type="radio"/g) ?? []).length).toBe(4)
    const checked = html.match(/<input type="radio"[^>]*checked=""[^>]*>/g) ?? []
    expect(checked).toHaveLength(1)
    expect(checked[0]).toContain('value="2"')
  })

  it('marks required fields', () => {
    const html = render()
    expect((html.match(/required=""/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })
})
