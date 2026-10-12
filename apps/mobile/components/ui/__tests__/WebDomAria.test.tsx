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
// Reanimated's own mock needs the native TurboModule registry, which
// react-native-web lacks. The ARIA contract doesn't depend on motion, so a
// still stand-in (plain views, values settle at once) is enough.
jest.mock('react-native-reanimated', () => {
  const RNW = jest.requireActual('react-native-web')
  return {
    __esModule: true,
    default: { View: RNW.View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withSpring: (to: unknown) => to,
    withTiming: (to: unknown) => to,
  }
})

import { Pressable, Platform } from 'react-native'
import { FilterChip } from '../Chip'
import { Skeleton } from '../Skeleton'
import { SegmentedControl } from '../SegmentedControl'

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

describe('SegmentedControl on react-native-web (DOM markup)', () => {
  const html = () => renderToStaticMarkup(
    <SegmentedControl
      accessibilityLabel="Time range"
      segments={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]}
      value="month"
      onChange={() => {}}
    />,
  )

  it('emits a named role="radiogroup"', () => {
    expect(tagWithRole(html(), 'radiogroup')).toContain('aria-label="Time range"')
  })

  it('each segment is role="radio" with aria-checked, and only the selected one is tabbable', () => {
    const radios = html().match(/<[a-z]+[^>]*role="radio"[^>]*>/g) ?? []
    expect(radios).toHaveLength(2)
    expect(radios[0]).toContain('aria-checked="false"')
    expect(radios[0]).toContain('tabindex="-1"')
    expect(radios[1]).toContain('aria-checked="true"')
    expect(radios[1]).toContain('tabindex="0"')
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
