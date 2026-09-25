import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))
let url = ''
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { value: url } }) }) }) }),
  }),
}))

import Page from '../page'
const render = async () => renderToStaticMarkup((await Page()) as React.ReactElement)
const h2s = (html: string) => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => (m[1] ?? '').replace(/<[^>]+>/g, ''))

describe('AnalyticsPage', () => {
  it('renders no h1 in the body and no h2 repeating the title', async () => {
    const html = await render()
    expect(html).not.toContain('<h1')
    expect(h2s(html).some(t => /analytics/i.test(t))).toBe(false)
  })

  it('puts the embed link on a wired Field inside a submitting form', async () => {
    const html = await render()
    expect(html).toMatch(/<form[^>]*novalidate/i)
    const label = html.match(/<label for="([^"]+)"[^>]*>Dashboard embed link<\/label>/)
    expect(label).not.toBeNull()
    expect(html).toContain(`id="${label![1]}"`)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>(?:(?!<\/button>).)*Save link/)
  })

  it('embeds the dashboard when linked', async () => {
    url = 'https://us.posthog.com/shared/abc'
    expect(await render()).toContain('title="PostHog dashboard"')
    url = ''
  })
})
