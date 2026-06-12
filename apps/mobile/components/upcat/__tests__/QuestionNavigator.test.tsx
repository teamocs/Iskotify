import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QuestionNavigator } from '../QuestionNavigator'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      border: '#ddd', surface2: '#f5f5f5', accentSurface: '#fdeaea',
      accent: '#800000', accentText: '#800000', textSecondary: '#666',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 17 },
  }),
}))

function renderNav(overrides: Partial<React.ComponentProps<typeof QuestionNavigator>> = {}) {
  return render(
    <QuestionNavigator
      total={5}
      currentIdx={1}
      answeredIdxs={new Set([0])}
      onJump={jest.fn()}
      {...overrides}
    />,
  )
}

describe('QuestionNavigator', () => {
  it('renders one numbered cell per question', () => {
    renderNav()
    for (let i = 1; i <= 5; i++) expect(screen.getByText(String(i))).toBeTruthy()
  })

  it('pressing a cell jumps to that index', () => {
    const onJump = jest.fn()
    renderNav({ onJump })
    fireEvent.press(screen.getByLabelText('Go to question 4'))
    expect(onJump).toHaveBeenCalledWith(3)
  })

  it('does not stretch vertically inside a flex column (flexGrow 0 on the ScrollView)', () => {
    // RN ScrollView's base style includes flexGrow: 1; without an explicit
    // flexGrow: 0 the navigator absorbs free space in the exam runners'
    // fixed-zone column layout, opening a large gap below the number row.
    const { UNSAFE_root } = renderNav()
    const scrollViews = UNSAFE_root.findAll(
      (node: { type: unknown }) => typeof node.type === 'string' && node.type.includes('ScrollView'),
    )
    expect(scrollViews.length).toBeGreaterThan(0)
    const flat = StyleSheet.flatten(scrollViews[0]!.props.style)
    expect(flat?.flexGrow).toBe(0)
  })
})
