import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/data/career_courses',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import type { DataTableConfig } from '@/lib/dataTables'
import { DataTableManager, RowDrawer, humanizeColumnName, validateRowForm, buildListUrl, DATA_PAGE_SIZE } from '../DataTableManager'

const config: DataTableConfig = {
  table: 'career_courses',
  label: 'Career Courses',
  idColumn: 'course_id',
  idType: 'text',
  searchColumns: ['course_id', 'name'],
  columns: [
    { name: 'course_id', label: 'Course ID', type: 'text', required: true },
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'cluster', label: 'Cluster', type: 'text' },
    { name: 'board_exam', label: 'Board Exam', type: 'boolean' },
    { name: 'duration_years', label: 'Duration (years)', type: 'number' },
    { name: 'top_countries', label: 'Top Countries (JSON array)', type: 'json' },
    { name: 'summary', label: 'Summary', type: 'textarea' },
  ],
}

const headers = (html: string) =>
  [...html.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map(m => (m[1] ?? '').replace(/<[^>]+>/g, '').trim())

describe('humanizeColumnName', () => {
  it('turns snake_case into a sentence-case label', () => {
    expect(humanizeColumnName('created_at')).toBe('Created at')
    expect(humanizeColumnName('report_date')).toBe('Report date')
  })
  it('keeps ID and URL as acronyms', () => {
    expect(humanizeColumnName('id')).toBe('ID')
    expect(humanizeColumnName('course_id')).toBe('Course ID')
    expect(humanizeColumnName('external_url')).toBe('External URL')
  })
})

describe('DataTableManager table', () => {
  it('renders every configured column (no 5-column cap)', () => {
    search = ''
    const html = renderToStaticMarkup(<DataTableManager config={config} />)
    const h = headers(html)
    for (const label of ['Course ID', 'Name', 'Cluster', 'Board Exam', 'Duration (years)', 'Top Countries', 'Summary']) {
      expect(h).toContain(label)
    }
    // 7 data columns + the visually-hidden Actions column
    expect(h).toHaveLength(8)
  })

  it('uses human labels, never the database column names', () => {
    const h = headers(renderToStaticMarkup(<DataTableManager config={config} />))
    expect(h).not.toContain('course_id')
    expect(h).not.toContain('duration_years')
  })

  it('offers the column chooser', () => {
    const html = renderToStaticMarkup(<DataTableManager config={config} />)
    expect(html).toContain('Visible columns')
    expect(html).toContain('Columns')
  })

  it('hides a column the URL asks to hide', () => {
    search = 'hide=summary'
    const h = headers(renderToStaticMarkup(<DataTableManager config={config} />))
    expect(h).not.toContain('Summary')
    search = ''
  })

  it('adds a humanised ID column for uuid tables whose id is not a configured column', () => {
    const uuidConfig: DataTableConfig = { ...config, idColumn: 'id', idType: 'uuid', columns: config.columns.slice(1) }
    const h = headers(renderToStaticMarkup(<DataTableManager config={uuidConfig} />))
    expect(h).toContain('ID')
  })

  it('has no page-level heading of its own (the Topbar owns the h1)', () => {
    const html = renderToStaticMarkup(<DataTableManager config={config} />)
    expect(html).not.toMatch(/<h1|<h2/)
  })

  it('puts Add row, Import and exports in the table toolbar', () => {
    const html = renderToStaticMarkup(<DataTableManager config={config} />)
    expect(html).toContain('Add row')
    expect(html).toContain('Import')
    expect(html).toContain('href="/api/admin/data/career_courses?export=1&amp;format=csv"')
    expect(html).toContain('href="/api/admin/data/career_courses?export=1&amp;format=json"')
    expect(html).not.toMatch(/[⬇⬆✓✕]/)
  })
})

describe('RowDrawer form', () => {
  const row = { course_id: 'BSCS', name: 'Computer Science', cluster: 'IT', board_exam: true, duration_years: 4, top_countries: ['US'], summary: 'x' }

  it('is a real form with a submit button so Enter submits', () => {
    const html = renderToStaticMarkup(<RowDrawer config={config} row={row} onClose={vi.fn()} onSaved={vi.fn()} onRequestDelete={vi.fn()} />)
    expect(html).toMatch(/<form[^>]*novalidate/i)
    expect(html).toMatch(/<button type="submit"[^>]*>[\s\S]*Save changes<\/button>/)
    expect(html).toContain('>Cancel</button>')
  })

  it('wires every label to its control and marks required fields', () => {
    const html = renderToStaticMarkup(<RowDrawer config={config} row={null} onClose={vi.fn()} onSaved={vi.fn()} onRequestDelete={vi.fn()} />)
    const labels = [...html.matchAll(/<label for="([^"]+)"[^>]*>([^<]*)/g)]
    const names = labels.map(l => l[2])
    for (const label of ['Course ID', 'Name', 'Cluster', 'Board Exam', 'Duration (years)', 'Top Countries (JSON array)', 'Summary']) {
      expect(names).toContain(label)
    }
    for (const [, id] of labels) expect(html).toContain(`id="${id}"`)
    // Course ID (text id) and Name are required
    expect(html.match(/ required=""/g)?.length).toBe(2)
    expect(html).toContain('Create')
  })

  it('shows Delete only for existing rows', () => {
    const newHtml = renderToStaticMarkup(<RowDrawer config={config} row={null} onClose={vi.fn()} onSaved={vi.fn()} onRequestDelete={vi.fn()} />)
    const editHtml = renderToStaticMarkup(<RowDrawer config={config} row={row} onClose={vi.fn()} onSaved={vi.fn()} onRequestDelete={vi.fn()} />)
    expect(newHtml).not.toContain('>Delete<')
    expect(editHtml).toContain('Delete')
  })
})

describe('validateRowForm', () => {
  const blank = { course_id: '', name: '', cluster: '', board_exam: false, duration_years: '', top_countries: '', summary: '' }

  it('flags each required field next to itself', () => {
    const errors = validateRowForm(blank, config, true)
    expect(errors.course_id).toMatch(/required/i)
    expect(errors.name).toMatch(/required/i)
    expect(errors.cluster).toBeUndefined()
  })

  it('flags invalid JSON and non-numbers', () => {
    const errors = validateRowForm({ ...blank, course_id: 'A', name: 'B', top_countries: '[oops', duration_years: 'abc' }, config, true)
    expect(errors.top_countries).toMatch(/JSON/)
    expect(errors.duration_years).toMatch(/number/i)
  })

  it('passes a valid form', () => {
    expect(validateRowForm({ ...blank, course_id: 'A', name: 'B', top_countries: '["US"]', duration_years: '4' }, config, true)).toEqual({})
  })
})

describe('server-driven paging, sort and search', () => {
  it('matches the route page size', () => {
    expect(DATA_PAGE_SIZE).toBe(50)
  })

  it('maps the 1-based table page to the 0-based route page', () => {
    expect(buildListUrl('career_courses', { q: '', sort: null, page: 1 })).toBe('/api/admin/data/career_courses?page=0')
    expect(buildListUrl('career_courses', { q: '', sort: null, page: 3 })).toBe('/api/admin/data/career_courses?page=2')
  })

  it('passes search (trimmed) and sort column + direction to the route', () => {
    const url = new URL(buildListUrl('career_courses', { q: ' nurse ', sort: { id: 'name', dir: 'desc' }, page: 2 }), 'http://x')
    expect(url.pathname).toBe('/api/admin/data/career_courses')
    expect(url.searchParams.get('search')).toBe('nurse')
    expect(url.searchParams.get('sort')).toBe('name')
    expect(url.searchParams.get('dir')).toBe('desc')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.has('export')).toBe(false)
  })

  it('never loads the whole table on page load (export is only the Export links)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../DataTableManager.tsx', import.meta.url), 'utf8')
    const exportUses = src.match(/export=1/g) ?? []
    expect(exportUses).toHaveLength(2) // the CSV and JSON links
    expect(src).not.toMatch(/fetch\([^)]*export=1/)
  })
})
