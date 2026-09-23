import { buildPreAssessFromUpcat, type UpcatLocalRow } from '../preAssessmentSource'

function row(over: Partial<UpcatLocalRow> = {}): UpcatLocalRow {
  return {
    questionId: 'q1', subtest: 'Mathematics', questionText: 'Q?',
    options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 0, explanation: '', setId: null,
    ...over,
  }
}

describe('buildPreAssessFromUpcat', () => {
  it('excludes a question with has_visual=true and no image_url (figure required but missing)', () => {
    const rows = [
      row({ questionId: 'broken', hasVisual: true, imageUrl: null }),
      row({ questionId: 'ok' }),
    ]
    const out = buildPreAssessFromUpcat(rows, ['Mathematics'], 5, () => 0)
    expect(out.map(q => q.id)).toEqual(['ok'])
  })

  it('carries imageUrl/imageAlt/imageWidth/imageHeight through when the figure is present', () => {
    const rows = [
      row({
        questionId: 'img1', hasVisual: true,
        imageUrl: 'https://x.supabase.co/storage/v1/object/public/question-media/img1.png',
        imageAlt: 'A chart', imageWidth: 400, imageHeight: 300,
      }),
    ]
    const [q] = buildPreAssessFromUpcat(rows, ['Mathematics'], 5, () => 0)
    expect(q!.imageUrl).toBe('https://x.supabase.co/storage/v1/object/public/question-media/img1.png')
    expect(q!.imageAlt).toBe('A chart')
    expect(q!.imageWidth).toBe(400)
    expect(q!.imageHeight).toBe(300)
  })

  it('defaults image fields to null when the row carries none', () => {
    const [q] = buildPreAssessFromUpcat([row()], ['Mathematics'], 5, () => 0)
    expect(q!.imageUrl).toBeNull()
    expect(q!.imageAlt).toBeNull()
  })

  it('accepts a 3-option question as-is (no crash, not discarded)', () => {
    const rows = [row({ questionId: 'three', options: JSON.stringify(['a', 'b', 'c']), correctIndex: 2 })]
    const [q] = buildPreAssessFromUpcat(rows, ['Mathematics'], 5, () => 0)
    expect(q!.options).toEqual(['a', 'b', 'c'])
    expect(q!.answerIndex).toBe(2)
  })
})
