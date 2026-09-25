/**
 * Real web render: `react-native` is swapped for react-native-web and the
 * component is rendered to DOM markup with react-dom/server. This proves that
 * the state reaches the web build as a DOM attribute. The native-renderer tests
 * can't show that, because they only see the props React Native receives.
 *
 * The control case documents why the migration exists: react-native-web 0.21
 * drops the nested `accessibilityState` prop, so a checkbox that only sets it
 * renders with no aria-checked at all.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

jest.mock('react-native', () => jest.requireActual('react-native-web'))
// The icon library pulls in react-native-svg's native bindings; the check glyph
// is decorative and irrelevant to the ARIA contract under test.
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

import { Pressable, Platform } from 'react-native'
import { FilterChip } from '../Chip'
import { Skeleton } from '../Skeleton'

/** Pull the opening tag of the element carrying `role="<role>"`. */
function tagWithRole(html: string, role: string): string {
  const m = html.match(new RegExp(`<[a-z]+[^>]*role="${role}"[^>]*>`))
  if (!m) throw new Error(`no role="${role}" in ${html}`)
  return m[0]
}

describe('FilterChip on react-native-web (DOM markup)', () => {
  it('really is rendering through react-native-web', () => {
    expect(Platform.OS).toBe('web')
  })

  it('multi-select chip emits role="checkbox" with aria-checked', () => {
    const on = tagWithRole(renderToStaticMarkup(<FilterChip label="NCR" mode="multiple" selected onPress={() => {}} />), 'checkbox')
    expect(on).toContain('aria-checked="true"')
    const off = tagWithRole(renderToStaticMarkup(<FilterChip label="NCR" mode="multiple" selected={false} onPress={() => {}} />), 'checkbox')
    expect(off).toContain('aria-checked="false"')
  })

  it('single-select chip emits role="radio" with aria-checked', () => {
    const tag = tagWithRole(renderToStaticMarkup(<FilterChip label="Scholarships" selected onPress={() => {}} />), 'radio')
    expect(tag).toContain('aria-checked="true"')
  })

  it('tab chip emits role="tab" with aria-selected', () => {
    const tag = tagWithRole(renderToStaticMarkup(<FilterChip label="News" role="tab" selected onPress={() => {}} />), 'tab')
    expect(tag).toContain('aria-selected="true"')
  })

  it('control: accessibilityState alone never reaches the DOM (why aria-* is required)', () => {
    const legacy = { accessibilityState: { checked: true } } as Record<string, unknown>
    const html = renderToStaticMarkup(<Pressable accessibilityRole="checkbox" {...legacy} onPress={() => {}} />)
    expect(tagWithRole(html, 'checkbox')).not.toContain('aria-checked')
  })
})

describe('Skeleton on react-native-web (DOM markup)', () => {
  // Skeleton used to set only accessibilityState={{ busy: true }}, which RNW
  // dropped, so the web build never announced the loading state.
  it('an accessible skeleton emits aria-busy="true" next to its label', () => {
    const html = renderToStaticMarkup(<Skeleton accessible label="Loading exams" />)
    const tag = html.match(/<div[^>]*aria-label="Loading exams"[^>]*>/)?.[0] ?? ''
    expect(tag).toContain('aria-busy="true"')
  })
})
