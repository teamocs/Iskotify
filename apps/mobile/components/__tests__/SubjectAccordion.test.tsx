import React from 'react'
import { Text } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'

// Mock the theme so we don't need the full ThemeProvider (which depends on useDb).
jest.mock('../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      textPrimary:   '#111',
      textSecondary: '#666',
      textTertiary:  '#999',
      divider:       '#e0e0e0',
    },
    typo: {},
    isDark: false,
  }),
}))

import { SubjectAccordion } from '../SubjectAccordion'
import type { SubjectGroup } from '../../utils/groupTopicsBySubject'

interface Row { id: string; label: string }

function makeGroups(): SubjectGroup<Row>[] {
  return [
    { subjectId: 'math', subjectName: 'Mathematics', summary: '3 topics · 50% avg', rows: [
      { id: 't1', label: 'Algebra' },
      { id: 't2', label: 'Geometry' },
      { id: 't3', label: 'Calculus' },
    ]},
    { subjectId: 'sci', subjectName: 'Science', summary: '2 topics · 70% avg', rows: [
      { id: 't4', label: 'Biology' },
      { id: 't5', label: 'Physics' },
    ]},
  ]
}

function renderRow(row: Row) {
  return <Text testID={`row-${row.id}`}>{row.label}</Text>
}

describe('SubjectAccordion', () => {
  it('renders emptyText when groups is empty', () => {
    const { getByText } = render(
      <SubjectAccordion groups={[]} renderRow={renderRow} emptyText="No subjects here" />
    )
    expect(getByText('No subjects here')).toBeTruthy()
  })

  it('renders each subject header with its name and summary', () => {
    const { getByText } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} />
    )
    expect(getByText('Mathematics')).toBeTruthy()
    expect(getByText('Science')).toBeTruthy()
    expect(getByText('3 topics · 50% avg')).toBeTruthy()
    expect(getByText('2 topics · 70% avg')).toBeTruthy()
  })

  it('initiallyExpanded="first" → only first subject\'s rows visible', () => {
    const { getByTestId, queryByTestId } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="first" />
    )
    expect(getByTestId('row-t1')).toBeTruthy()    // Mathematics is first → expanded
    expect(queryByTestId('row-t4')).toBeNull()    // Science → collapsed
  })

  it('initiallyExpanded="all" → all rows visible', () => {
    const { getByTestId } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="all" />
    )
    expect(getByTestId('row-t1')).toBeTruthy()
    expect(getByTestId('row-t4')).toBeTruthy()
  })

  it('initiallyExpanded="none" → no rows visible', () => {
    const { queryByTestId } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="none" />
    )
    expect(queryByTestId('row-t1')).toBeNull()
    expect(queryByTestId('row-t4')).toBeNull()
  })

  it('tapping a collapsed header expands that subject', () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="none" />
    )
    expect(queryByTestId('row-t4')).toBeNull()
    fireEvent.press(getByText('Science'))
    expect(getByTestId('row-t4')).toBeTruthy()
  })

  it('tapping an expanded header collapses that subject', () => {
    const { queryByTestId, getByTestId, getByText } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="all" />
    )
    expect(getByTestId('row-t1')).toBeTruthy()
    fireEvent.press(getByText('Mathematics'))
    expect(queryByTestId('row-t1')).toBeNull()
  })

  it("two subjects' expansion states are independent", () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="none" />
    )
    fireEvent.press(getByText('Mathematics'))
    expect(getByTestId('row-t1')).toBeTruthy()
    expect(queryByTestId('row-t4')).toBeNull()
    fireEvent.press(getByText('Science'))
    expect(getByTestId('row-t1')).toBeTruthy()
    expect(getByTestId('row-t4')).toBeTruthy()
  })

  it('renderRow is invoked once per row when its subject is expanded', () => {
    const spy = jest.fn(renderRow)
    render(
      <SubjectAccordion groups={makeGroups()} renderRow={spy} initiallyExpanded="all" />
    )
    expect(spy).toHaveBeenCalledTimes(5)
  })
})
