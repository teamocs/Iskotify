import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useParams: () => ({ topicId: 't1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
}))

import ReviewPage from '../page'

describe('ReviewPage', () => {
  it('has exactly one h1 (the Topbar) and never repeats it', () => {
    const out = renderToStaticMarkup(<ReviewPage />)
    expect((out.match(/<h1/g) ?? []).length).toBe(1)
    expect(out).toMatch(/<h2[^>]*>Cards<\/h2>/)
  })

  it('announces loading and keeps Publish in the Topbar, disabled until cards load', () => {
    const out = renderToStaticMarkup(<ReviewPage />)
    expect(out).toMatch(/role="status"[^>]*>[^<]*Loading cards/)
    expect(out).toMatch(/<header>[\s\S]*<button[^>]*disabled=""[^>]*>[\s\S]*Publish[\s\S]*<\/header>/)
  })
})
