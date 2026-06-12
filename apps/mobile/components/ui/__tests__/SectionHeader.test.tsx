import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SectionHeader } from '../SectionHeader'

describe('SectionHeader', () => {
  it('renders the title', () => {
    render(<SectionHeader title="My Focus" />)
    expect(screen.getByText('My Focus')).toBeTruthy()
  })

  it('renders the subtitle below the title when given', () => {
    render(<SectionHeader title="My Focus" subtitle="Readiness and streaks for your target exams" />)
    expect(screen.getByText('Readiness and streaks for your target exams')).toBeTruthy()
  })

  it('omits the subtitle when not given', () => {
    render(<SectionHeader title="My Focus" />)
    expect(screen.queryByText(/Readiness and streaks/)).toBeNull()
  })

  it('still fires the trailing action when a subtitle is present', () => {
    const onAction = jest.fn()
    render(
      <SectionHeader
        title="Upcoming Dates"
        subtitle="Deadlines and exam dates on your radar"
        actionLabel="See all"
        onAction={onAction}
      />,
    )
    fireEvent.press(screen.getByText('See all'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('fires the trailing action without a subtitle (existing behavior)', () => {
    const onAction = jest.fn()
    render(<SectionHeader title="Upcoming Dates" actionLabel="See all" onAction={onAction} />)
    fireEvent.press(screen.getByText('See all'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
