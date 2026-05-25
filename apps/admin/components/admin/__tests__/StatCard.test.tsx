import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatCard } from '../StatCard'

describe('StatCard', () => {
  it('renders as div by default', () => {
    const html = renderToStaticMarkup(
      <StatCard label="Total" value={42} />
    )
    expect(html).toContain('<div')
    expect(html).not.toContain('<button')
    expect(html).toContain('42')
    expect(html).toContain('Total')
  })

  it('renders as button when onClick provided', () => {
    const html = renderToStaticMarkup(
      <StatCard label="Active" value={10} onClick={() => {}} />
    )
    expect(html).toContain('<button')
    expect(html).not.toContain('<div')
    expect(html).toContain('10')
  })

  it('applies ring class when active', () => {
    const html = renderToStaticMarkup(
      <StatCard label="Active" value={10} onClick={() => {}} active />
    )
    expect(html).toContain('ring-2')
    expect(html).toContain('bg-[#fff8f8]')
  })

  it('does not apply ring class when not active', () => {
    const html = renderToStaticMarkup(
      <StatCard label="Active" value={10} onClick={() => {}} active={false} />
    )
    expect(html).not.toContain('ring-2')
  })
})
