/**
 * MatchPill contrast. Measured against the LIGHT theme, where the default
 * status colour on its own 10% tint drops below 4.5:1 (DESIGN.md "strong"
 * role): the label must use the *Strong token, and never lean on a glyph.
 */
import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { MatchPill } from '../MatchPill'

jest.mock('../../../theme/ThemeContext', () => {
  const { lightTheme, typography } = jest.requireActual('../../../theme/tokens')
  return { useTheme: () => ({ theme: lightTheme, typo: typography, isDark: false }) }
})

const { lightTheme } = jest.requireActual('../../../theme/tokens')

describe('MatchPill', () => {
  it.each([
    ['eligible', 'Eligible', 'successStrong', 'successSurface'],
    ['maybe', 'Maybe', 'warningStrong', 'warningSurface'],
    ['ineligible', 'Not eligible', 'dangerStrong', 'dangerSurface'],
  ] as const)('%s puts the *Strong text token on its own tint', (status, label, fg, bg) => {
    render(<MatchPill status={status} />)
    const txt = screen.getByText(label)
    expect(StyleSheet.flatten(txt.props.style).color).toBe(lightTheme[fg])
    let n: any = txt.parent
    while (n && !(typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.backgroundColor)) n = n.parent
    expect(StyleSheet.flatten(n.props.style).backgroundColor).toBe(lightTheme[bg])
  })

  it('renders nothing for an unknown status', () => {
    const { toJSON } = render(<MatchPill status="unknown" />)
    expect(toJSON()).toBeNull()
  })
})
