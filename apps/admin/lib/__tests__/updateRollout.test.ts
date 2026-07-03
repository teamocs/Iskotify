import { describe, it, expect } from 'vitest'
import { DEFAULT_UPDATE_EMAIL_TEMPLATE, renderUpdateEmail } from '../updateRollout'

describe('renderUpdateEmail', () => {
  it('substitutes both {{name}} and {{apk_url}} placeholders', () => {
    const out = renderUpdateEmail('Hi {{name}}, get it at {{apk_url}}.', {
      name: 'Maria',
      apkUrl: 'https://example.com/app.apk',
    })
    expect(out).toBe('Hi Maria, get it at https://example.com/app.apk.')
  })

  it('falls back to "there" when name is missing', () => {
    const out = renderUpdateEmail('Hi {{name}}', {})
    expect(out).toBe('Hi there')
  })

  it('falls back to "[download link]" when apkUrl is missing', () => {
    const out = renderUpdateEmail('Link: {{apk_url}}', {})
    expect(out).toBe('Link: [download link]')
  })

  it('falls back when name/apkUrl are empty or whitespace-only', () => {
    const out = renderUpdateEmail('{{name}} / {{apk_url}}', { name: '  ', apkUrl: '' })
    expect(out).toBe('there / [download link]')
  })

  it('replaces every occurrence of a placeholder', () => {
    const out = renderUpdateEmail('{{name}} {{name}}', { name: 'Jun' })
    expect(out).toBe('Jun Jun')
  })

  it('renders the default template with real values (no placeholders left)', () => {
    const out = renderUpdateEmail(DEFAULT_UPDATE_EMAIL_TEMPLATE, {
      name: 'Ana',
      apkUrl: 'https://iskotify.ph/update.apk',
    })
    expect(out).toContain('Hi Ana,')
    expect(out).toContain('https://iskotify.ph/update.apk')
    expect(out).not.toContain('{{name}}')
    expect(out).not.toContain('{{apk_url}}')
  })

  it('DEFAULT_UPDATE_EMAIL_TEMPLATE contains both placeholders', () => {
    expect(DEFAULT_UPDATE_EMAIL_TEMPLATE).toContain('{{name}}')
    expect(DEFAULT_UPDATE_EMAIL_TEMPLATE).toContain('{{apk_url}}')
  })
})
