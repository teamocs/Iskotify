import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublishModal } from '../PublishModal'

const render = (p: Partial<React.ComponentProps<typeof PublishModal>> = {}) => renderToStaticMarkup(
  <PublishModal
    open
    title="Publish 2 drafts"
    description="Pick at least one exam."
    topicIds={['t1', 't2']}
    onClose={() => {}}
    onPublished={() => {}}
    primaryLabel="Publish 2 drafts"
    {...p}
  />,
)

describe('PublishModal', () => {
  it('renders nothing when closed', () => {
    expect(render({ open: false })).toBe('')
  })

  it('is a labelled, described modal dialog', () => {
    const out = render()
    expect(out).toContain('role="dialog"')
    const labelledby = out.match(/aria-labelledby="([^"]+)"/)![1]
    expect(out).toMatch(new RegExp(`id="${labelledby}"[^>]*>Publish 2 drafts<`))
    expect(out).toMatch(/aria-describedby="[^"]+"/)
  })

  it('is a form whose primary button submits', () => {
    const out = render()
    expect(out).toMatch(/<form[^>]*novalidate/i)
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*>Publish 2 drafts<\/button>/)
  })

  it('groups the exam tags under a required legend', () => {
    const out = render()
    expect(out).toMatch(/<fieldset/)
    expect(out).toMatch(/<legend[^>]*>Tag to exams and scholarships/)
  })

  it('announces loading of listings', () => {
    expect(render()).toMatch(/role="status"[^>]*>Loading exams and scholarships/)
  })
})
