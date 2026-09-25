import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))

import { BlueprintEditor, validateBlueprint } from '../BlueprintEditor'

const blueprint = {
  slug: 'upcat-2026', name: 'UP College Admission Test', acronym: 'UPCAT',
  total_items: 200, total_time_minutes: 300, has_guessing_penalty: false, guessing_penalty: 0.25,
  section_blocked: false, scoring_note: '', mechanics_note: '', status: 'draft', display_order: 1,
}
const sections = [{ name: 'Math', skill_category: 'Math', item_count: 50, time_minutes: null, requires_spatial_logic: false }]
const notes = [{ course_cluster: 'all', note: 'Aim high', min_percentile: null }]
const categories = [{ name: 'Math', requires_spatial_logic: false, display_order: 1 }]

const render = (isNew = false) => renderToStaticMarkup(
  <BlueprintEditor initialBlueprint={isNew ? null : blueprint} initialSections={sections} initialNotes={notes} categories={categories} isNew={isNew} />,
)

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The control a `<label for=…>text</label>` points at. */
function controlFor(html: string, text: string): string {
  const label = html.match(new RegExp(`<label for="([^"]+)"[^>]*>${escape(text)}(?:<span[^>]*>\\*</span>)?</label>`))
  expect(label, `label "${text}" with htmlFor`).not.toBeNull()
  const id = label![1]!
  const control = html.match(new RegExp(`<(?:input|select|textarea)[^>]*id="${escape(id)}"[^>]*>`))
  expect(control, `control for "${text}"`).not.toBeNull()
  return control![0]
}

describe('BlueprintEditor', () => {
  it('is a real form, so Enter submits, with a submit button', () => {
    const html = render()
    expect(html).toMatch(/<form[^>]*novalidate/i)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>(?:(?!<\/button>).)*Save blueprint/)
  })

  it('wires every blueprint label to its control', () => {
    const html = render()
    for (const text of ['Slug', 'Acronym', 'Name', 'Total items', 'Total minutes', 'Display order', 'Scoring note', 'Mechanics note', 'Status']) {
      controlFor(html, text)
    }
  })

  it('wires section and note labels to their controls', () => {
    const html = render()
    for (const text of ['Section name', 'Skill category', 'Item count', 'Course cluster', 'Note']) controlFor(html, text)
  })

  it('marks required fields visibly and on the control', () => {
    const html = render(true)
    for (const text of ['Slug', 'Name', 'Acronym', 'Section name', 'Skill category']) {
      expect(controlFor(html, text)).toContain('required=""')
    }
    expect(html).toMatch(/<label for="[^"]+"[^>]*>Slug<span aria-hidden="true"[^>]*>\*<\/span><\/label>/)
    expect(controlFor(html, 'Mechanics note')).not.toContain('required=""')
  })

  it('does not repeat the page title as a heading', () => {
    expect(render()).not.toMatch(/<h[12][^>]*>UP College Admission Test<\/h[12]>/)
  })
})

describe('validateBlueprint', () => {
  it('passes a complete blueprint', () => {
    expect(validateBlueprint(blueprint, sections)).toEqual({})
  })

  it('flags each missing required field by key', () => {
    const errs = validateBlueprint({ ...blueprint, slug: ' ', name: '', acronym: '' }, [{ ...sections[0], name: '', skill_category: '' }])
    expect(Object.keys(errs).sort()).toEqual(['acronym', 'name', 'section-0-name', 'section-0-skill_category', 'slug'].sort())
  })
})
