import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { UpdateApkUrlForm } from '../UpdateApkUrlForm'
import { UpdateEmailTemplateForm } from '../UpdateEmailTemplateForm'
import { SendApkButton } from '../SendApkButton'

describe('UpdateApkUrlForm', () => {
  const html = renderToStaticMarkup(<UpdateApkUrlForm currentUrl="https://example.com/u.apk" />)

  it('is a real form with a labelled, hinted URL field', () => {
    expect(html).toMatch(/<form[^>]*novalidate/i)
    expect(html).toContain('for="update-apk-url-input"')
    expect(html).toContain('id="update-apk-url-input"')
    expect(html).toContain('aria-describedby="update-apk-url-input-hint"')
    expect(html).toContain('value="https://example.com/u.apk"')
    expect(html).toMatch(/<button type="submit"[^>]*>[\s\S]*Save link/)
  })

  it('has no error on first render and no raw colours', () => {
    expect(html).not.toContain('role="alert"')
    expect(html).not.toMatch(/bg-white|text-white|black\/|rounded-\[/)
  })
})

describe('UpdateEmailTemplateForm', () => {
  const html = renderToStaticMarkup(<UpdateEmailTemplateForm initialTemplate="Hi {{name}}" />)

  it('is a real form with a labelled textarea and hint', () => {
    expect(html).toMatch(/<form[^>]*novalidate/i)
    expect(html).toContain('for="update-email-template-input"')
    expect(html).toContain('aria-describedby="update-email-template-input-hint"')
    expect(html).toContain('>Hi {{name}}</textarea>')
    expect(html).toMatch(/<button type="submit"[^>]*>[\s\S]*Save template/)
    expect(html).toContain('Reset to default')
  })

  it('has no raw colours', () => {
    expect(html).not.toMatch(/bg-white|text-white|black\/|rounded-\[/)
  })
})

describe('SendApkButton', () => {
  it('names the recipient in its accessible label, keeping the visible text in it', () => {
    const html = renderToStaticMarkup(<SendApkButton id="r1" status="pending" recipient="ana@example.com" />)
    expect(html).toContain('aria-label="Send APK to ana@example.com"')
    expect(html).toContain('Send APK')
  })

  it('reads Resend for a registrant who already got the link', () => {
    const html = renderToStaticMarkup(<SendApkButton id="r1" status="sent" />)
    expect(html).toContain('Resend APK')
    expect(html).not.toMatch(/bg-white|text-white|#fff8f8/)
  })
})
