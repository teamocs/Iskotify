import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExamTagSelector } from '../ExamTagSelector'

const listings = [{ slug: 'upcat', title: 'UPCAT' }, { slug: 'dost', title: 'DOST-SEI' }]
const render = (p: Partial<React.ComponentProps<typeof ExamTagSelector>> = {}) =>
  renderToStaticMarkup(<ExamTagSelector listings={listings} selected={['upcat']} onChange={() => {}} {...p} />)

describe('ExamTagSelector', () => {
  it('is a labelled group of toggle buttons that report their state', () => {
    const out = render()
    expect(out).toMatch(/<fieldset/)
    expect(out).toMatch(/<legend[^>]*>Relevant exams and scholarships/)
    expect(out).toMatch(/<button[^>]*type="button"[^>]*aria-pressed="true"[^>]*>.*UPCAT/)
    expect(out).toMatch(/<button[^>]*type="button"[^>]*aria-pressed="false"[^>]*>.*DOST-SEI/)
  })

  it('uses icons, not check/plus glyphs', () => {
    const out = render()
    expect(out).not.toContain('✓')
    expect(out).not.toMatch(/>\+ /)
    expect(out).toContain('<svg')
  })

  it('shows a required marker and an announced error next to the group', () => {
    const out = render({ required: true, error: 'Select at least one exam or scholarship' })
    expect(out).toMatch(/aria-hidden="true"[^>]*>\*/)
    expect(out).toMatch(/role="alert"[^>]*>Select at least one exam or scholarship/)
    const describedBy = out.match(/<fieldset[^>]*aria-describedby="([^"]+)"/)![1]!.split(' ')
    expect(describedBy).toHaveLength(2)
    for (const id of describedBy) expect(out).toContain(`id="${id}"`)
    expect(out).toMatch(/<fieldset[^>]*aria-invalid="true"/)
  })

  it('does not nag before submit: no error without the error prop', () => {
    expect(render({ selected: [] })).not.toContain('role="alert"')
  })

  it('says so when there are no listings to tag', () => {
    expect(render({ listings: [] })).toMatch(/No exams or scholarships/)
  })
})
