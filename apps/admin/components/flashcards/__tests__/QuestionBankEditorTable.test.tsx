import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuestionBankEditorTable } from '../QuestionBankEditorTable'

const displayed = [{ index: 0, row: { question_id: 'Q1', subtest: 'Math', topic: 'Algebra', question_text: 'x?', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'A', status: '' } }]

describe('QuestionBankEditorTable', () => {
  const out = () => renderToStaticMarkup(
    <QuestionBankEditorTable
      displayed={displayed}
      errorsByRow={new Map([[0, [{ field: 'topic', message: 'required' }]]]) as never}
      subtests={['Math', 'Science']}
      onEdit={() => {}}
    />,
  )

  it('has a caption and human, column-scoped headers (no uppercase tracking)', () => {
    const html = out()
    expect(html).toMatch(/<caption[^>]*>/)
    expect(html).toMatch(/<th scope="col"[^>]*>Question ID<\/th>/)
    expect(html).toMatch(/<th scope="col"[^>]*>Correct answer<\/th>/)
    expect(html).not.toContain('uppercase')
    expect(html).not.toContain('text-[11px]')
  })

  it('marks invalid cells for assistive tech', () => {
    expect(out()).toMatch(/aria-label="Row 1 topic"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*aria-label="Row 1 topic"/)
  })
})
