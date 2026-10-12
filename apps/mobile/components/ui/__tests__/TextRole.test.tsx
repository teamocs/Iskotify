import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { Text, dynamicTypeRampFor } from '../Text'
import { iosTextStyles, lightTheme } from '../../../theme/tokens'

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>

describe('<Text role>', () => {
  it('applies the iOS role and defaults to textPrimary', () => {
    render(<Text role="headline">Daily plan</Text>)
    const el = screen.getByText('Daily plan')
    expect(flat(el)).toMatchObject({ ...iosTextStyles.headline, color: lightTheme.textPrimary })
  })

  it('takes a colour and a caller style', () => {
    render(<Text role="footnote" color={lightTheme.textSecondary} style={{ textAlign: 'center' }}>Due today</Text>)
    expect(flat(screen.getByText('Due today'))).toMatchObject({ color: lightTheme.textSecondary, textAlign: 'center' })
  })

  it('caps font scaling at 2x for content and 1.4x for chrome; an explicit cap wins', () => {
    render(<>
      <Text role="body">Content</Text>
      <Text role="caption" chrome>Tab label</Text>
      <Text role="body" maxFontSizeMultiplier={1.2}>Custom</Text>
    </>)
    expect(screen.getByText('Content').props.maxFontSizeMultiplier).toBe(2)
    expect(screen.getByText('Tab label').props.maxFontSizeMultiplier).toBe(1.4)
    expect(screen.getByText('Custom').props.maxFontSizeMultiplier).toBe(1.2)
  })

  it('scales with Dynamic Type on iOS through the matching ramp', () => {
    render(<Text role="caption">Hint</Text>)
    expect(screen.getByText('Hint').props.dynamicTypeRamp).toBe('caption1')
  })

  it.each([
    ['largeTitle', 'largeTitle'], ['title1', 'title1'], ['title2', 'title2'], ['title3', 'title3'],
    ['headline', 'headline'], ['body', 'body'], ['callout', 'callout'], ['subheadline', 'subheadline'],
    ['footnote', 'footnote'], ['caption', 'caption1'], ['numeric', 'title2'], ['numericLg', 'largeTitle'],
  ] as const)('%s ramps as %s', (role, ramp) => {
    expect(dynamicTypeRampFor(role)).toBe(ramp)
  })
})
