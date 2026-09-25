import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import AdminError from '../error'

describe('admin error boundary', () => {
  const err = Object.assign(new Error('relation "profiles" does not exist'), { digest: 'abc123' })
  const html = () => renderToStaticMarkup(<AdminError error={err} reset={vi.fn()} />)

  it('announces the failure instead of rendering an empty page', () => {
    expect(html()).toContain('role="alert"')
    expect(html()).toContain('This page couldn’t load')
  })

  it('offers a retry button', () => {
    expect(html()).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*Try again/)
  })

  it('offers a way home', () => {
    expect(html()).toContain('href="/admin"')
  })

  it('shows the error reference so staff can report it', () => {
    expect(html()).toContain('abc123')
  })

  it('does not repeat an h1 (the shell owns the page heading)', () => {
    expect(html()).not.toContain('<h1')
  })
})
