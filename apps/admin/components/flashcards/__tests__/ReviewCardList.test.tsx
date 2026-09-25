import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReviewCardList, type ReviewCard } from '../ReviewCardList'

const base: ReviewCard = {
  id: 'c1', question: 'Capital of PH?', answer: 'Manila', explanation: null,
  options: null, correct_answer_index: null, ai_options: null, ai_correct_index: null, ai_explanation: null, ai_enhanced_at: null,
}

describe('ReviewCardList', () => {
  it('labels AI-enhanced cards with a Badge, not a purple pill', () => {
    const out = renderToStaticMarkup(<ReviewCardList cards={[{ ...base, ai_options: ['Manila', 'Cebu', 'Davao', 'Naga'], ai_correct_index: 0, ai_explanation: 'Because.' }]} />)
    expect(out).toMatch(/data-tone="info"[^>]*>AI-enhanced</)
    expect(out).not.toMatch(/purple/)
  })

  it('marks the correct option in text, not by colour alone', () => {
    const out = renderToStaticMarkup(<ReviewCardList cards={[{ ...base, options: ['Manila', 'Cebu', 'Davao', 'Naga'], correct_answer_index: 0 }]} />)
    expect(out).toMatch(/Manila[\s\S]*<span class="sr-only">\(correct answer\)<\/span>/)
  })

  it('uses a Badge instead of the hourglass emoji when distractors are pending', () => {
    const out = renderToStaticMarkup(<ReviewCardList cards={[base]} />)
    expect(out).not.toContain('⏳')
    expect(out).toMatch(/data-tone="warning"[^>]*>No distractors yet/)
  })

  it('numbers cards with h3 headings inside one list', () => {
    const out = renderToStaticMarkup(<ReviewCardList cards={[base, { ...base, id: 'c2' }]} />)
    expect(out).toMatch(/<ol/)
    expect(out).toMatch(/<h3[^>]*>Card 2<\/h3>/)
  })
})
