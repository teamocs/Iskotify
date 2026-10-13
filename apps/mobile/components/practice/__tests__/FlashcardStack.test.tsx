import React from 'react'
import { AccessibilityInfo, AppState, StyleSheet } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { render, fireEvent, screen, act } from '@testing-library/react-native'
import { FlashcardStack, toStackCards, type StackCard } from '../FlashcardStack'
import { lightTheme, motion, radius } from '../../../theme/tokens'
import { newSrsState, type SrsCardState } from '../../../utils/srs'

// iOS redesign P4: the due review and a deck's "Due today" mode are a
// self-graded card stack (Show answer, then Again / Hard / Good / Easy), not
// a multiple-choice quiz.

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-reanimated', () => {
  const m = require('react-native-reanimated/mock')
  return { ...m, withSpring: jest.fn(m.withSpring), withTiming: jest.fn(m.withTiming) }
})

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

let mockReduceMotion = false
jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  usePlatformCapabilities: () => ({
    liquidGlass: false, blurTier: 'opaque', reduceTransparency: true, reduceMotion: mockReduceMotion,
  }),
}))

const mockRecordSrs = jest.fn()
let mockStates = new Map<string, SrsCardState>()
let mockLoaded = true
jest.mock('../../../hooks/useRecordSrs', () => ({
  useRecordSrs: () => ({ recordSrs: mockRecordSrs }),
  useSrsStates: () => ({ states: mockStates, loaded: mockLoaded }),
}))

const mockRecordProgress = jest.fn()
jest.mock('../../../hooks/useRecordProgress', () => ({
  useRecordProgress: () => ({ recordProgress: mockRecordProgress }),
}))

const mockRecordSession = jest.fn()
jest.mock('../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({ recordSession: mockRecordSession }),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

function cards(n: number): StackCard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    question: `Question ${i + 1}`,
    answer: `Answer ${i + 1}`,
    explanation: i === 0 ? 'Because of reasons' : null,
  }))
}

function primaryButtons() {
  return screen.getAllByRole('button').filter(
    b => StyleSheet.flatten(b.props.style)?.backgroundColor === lightTheme.accent,
  )
}

function renderStack(n = 3, onExit = jest.fn()) {
  render(<FlashcardStack title="Due today" cards={cards(n)} deckId="__due__" onExit={onExit} />)
  return onExit
}

async function grade(name: RegExp) {
  fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
  await act(async () => { fireEvent.press(screen.getByRole('button', { name })) })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReduceMotion = false
  mockLoaded = true
  // c1 is on its second rep (due now); c2/c3 have no row yet.
  mockStates = new Map([
    ['c1', { ...newSrsState(), repetitions: 1, intervalDays: 1, dueAt: Date.now() - DAY_MS, lastGrade: 'good' }],
  ])
  mockRecordSrs.mockResolvedValue(undefined)
  mockRecordProgress.mockResolvedValue(undefined)
  mockRecordSession.mockResolvedValue(undefined)
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FlashcardStack — the stack', () => {
  it('shows the top card with the question, on the sheet radius', () => {
    renderStack(3)
    expect(screen.getByText('Question 1')).toBeTruthy()
    expect(screen.queryByText('Answer 1')).toBeNull()
    const top = StyleSheet.flatten(screen.getByTestId('stack-top').props.style)
    expect(top.borderRadius).toBe(radius.sheet)
    expect(top.backgroundColor).toBe(lightTheme.surface)
  })

  it('draws the next two cards under it, scaled 0.94 and 0.88 and offset down', () => {
    renderStack(3)
    const scaleOf = (id: string) => {
      const tf = StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style).transform as Record<string, number>[]
      return { scale: tf.find(x => 'scale' in x)!.scale!, y: tf.find(x => 'translateY' in x)!.translateY! }
    }
    const d1 = scaleOf('stack-depth-1')
    const d2 = scaleOf('stack-depth-2')
    expect(d1.scale).toBe(0.94)
    expect(d2.scale).toBe(0.88)
    expect(d1.y).toBeGreaterThan(0)
    expect(d2.y).toBeGreaterThan(d1.y)
  })

  it('draws only as many depth cards as there are cards left', () => {
    renderStack(2)
    expect(screen.getByTestId('stack-depth-1', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('stack-depth-2', { includeHiddenElements: true })).toBeNull()
  })

  it('has a header: exit control, title, "Card N of M" in tabular numerals, thin progress', () => {
    renderStack(3)
    expect(screen.getByRole('button', { name: 'Exit review' })).toBeTruthy()
    expect(screen.getByText('Due today')).toBeTruthy()
    const counter = screen.getByText('Card 1 of 3')
    expect(StyleSheet.flatten(counter.props.style).fontVariant).toEqual(['tabular-nums'])
    const bar = screen.getByRole('progressbar')
    expect(StyleSheet.flatten(bar.props.style).height).toBe(4)
  })
})

describe('FlashcardStack — reveal and grade', () => {
  it('before reveal: one primary button, "Show answer", and no grades', () => {
    renderStack(3)
    expect(primaryButtons()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Good/ })).toBeNull()
  })

  it('reveals the answer and explanation in a polite live region', () => {
    renderStack(3)
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    expect(screen.getByText('Answer 1')).toBeTruthy()
    expect(screen.getByText('Because of reasons')).toBeTruthy()
    expect(screen.getByTestId('stack-answer').props.accessibilityLiveRegion).toBe('polite')
  })

  it('after reveal: four named grades with intervals from the real state, Good the one primary', () => {
    renderStack(3)
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull()
    // c1 is on its second rep: again 10 min (same day), hard 2, good 3, easy 4.
    expect(screen.getByRole('button', { name: 'Again, next review in 10 min' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hard, next review in 2 days' })).toBeTruthy()
    const good = screen.getByRole('button', { name: 'Good, next review in 3 days' })
    expect(screen.getByRole('button', { name: 'Easy, next review in 4 days' })).toBeTruthy()
    // The label always says the grade (never colour alone).
    expect(screen.getByText('Again · 10 min')).toBeTruthy()
    expect(screen.getByText('Hard · 2 days')).toBeTruthy()
    expect(screen.getByText('Good · 3 days')).toBeTruthy()
    expect(primaryButtons()).toEqual([good])
  })

  it('tints Again / Hard / Easy with their status surfaces', () => {
    renderStack(3)
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    const bg = (name: RegExp) => StyleSheet.flatten(screen.getByRole('button', { name }).props.style).backgroundColor
    expect(bg(/^Again/)).toBe(lightTheme.dangerSurface)
    expect(bg(/^Hard/)).toBe(lightTheme.warningSurface)
    expect(bg(/^Easy/)).toBe(lightTheme.successSurface)
    expect(StyleSheet.flatten(screen.getByText('Hard · 2 days').props.style).color).toBe(lightTheme.warningStrong)
    expect(StyleSheet.flatten(screen.getByText('Again · 10 min').props.style).color).toBe(lightTheme.dangerStrong)
    expect(StyleSheet.flatten(screen.getByRole('button', { name: /^Hard/ }).props.style).minHeight).toBeGreaterThanOrEqual(44)
  })

  it('a never-reviewed card shows the new-card intervals', async () => {
    renderStack(3)
    await grade(/^Good/)
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    expect(screen.getByRole('button', { name: 'Hard, next review in 1 day' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Good, next review in 1 day' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Easy, next review in 4 days' })).toBeTruthy()
  })

  it('shows the grades without intervals until the schedule has loaded (never invented)', () => {
    mockLoaded = false
    mockStates = new Map()
    renderStack(3)
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    expect(screen.getByRole('button', { name: 'Good' })).toBeTruthy()
    expect(screen.queryByText(/\d+ days?/)).toBeNull()
  })

  it('grading schedules that card with the explicit grade and advances', async () => {
    renderStack(3)
    await grade(/^Hard/)
    expect(mockRecordSrs).toHaveBeenCalledTimes(1)
    expect(mockRecordSrs.mock.calls[0]![0]).toEqual([
      // Owner decision 2026-10-13: only Good and Easy count as correct.
      expect.objectContaining({ flashcardId: 'c1', grade: 'hard', correct: false }),
    ])
    expect(screen.getByText('Question 2')).toBeTruthy()
    expect(screen.getByText('Card 2 of 3')).toBeTruthy()
    expect(screen.queryByText('Answer 1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeTruthy()
  })

  it('a failed SRS write never blocks the stack', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRecordSrs.mockRejectedValue(new Error('disk'))
    renderStack(2)
    await grade(/^Again/)
    expect(screen.getByText('Question 2')).toBeTruthy()
    warn.mockRestore()
  })
})

describe('FlashcardStack — motion', () => {
  const { withSpring, withTiming } = require('react-native-reanimated')

  it('flips on reveal and advances with the smooth spring', async () => {
    renderStack(3)
    ;(withSpring as jest.Mock).mockClear()
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    expect(withSpring).toHaveBeenCalledWith(expect.anything(), motion.spring.smooth)
    ;(withSpring as jest.Mock).mockClear()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /^Good/ })) })
    expect(withSpring).toHaveBeenCalledWith(expect.anything(), motion.spring.smooth)
  })

  it('under Reduce Motion both are a short crossfade, no spring', async () => {
    mockReduceMotion = true
    renderStack(3)
    ;(withSpring as jest.Mock).mockClear()
    ;(withTiming as jest.Mock).mockClear()
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    expect(withTiming).toHaveBeenCalledWith(1, { duration: motion.duration.reduced })
    ;(withTiming as jest.Mock).mockClear()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /^Good/ })) })
    expect(withTiming).toHaveBeenCalledWith(1, { duration: motion.duration.reduced })
    expect(withSpring).not.toHaveBeenCalled()
  })
})

describe('FlashcardStack — summary and recording', () => {
  it('ends on a calm summary with factual counts per grade and one primary Done', async () => {
    const onExit = renderStack(3)
    await grade(/^Good/)
    await grade(/^Again/)
    await grade(/^Good/)
    expect(screen.getByRole('header', { name: 'Review done' })).toBeTruthy()
    expect(screen.getByText('2 Good')).toBeTruthy()
    expect(screen.getByText('1 Again')).toBeTruthy()
    expect(screen.queryByText(/Hard|Easy/)).toBeNull()
    expect(primaryButtons()).toHaveLength(1)
    fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('records progress (correct only for Good / Easy) and one flashcard session on finishing', async () => {
    renderStack(3)
    await grade(/^Good/)
    await grade(/^Again/)
    await grade(/^Easy/)
    expect(mockRecordProgress).toHaveBeenCalledTimes(1)
    const rows = mockRecordProgress.mock.calls[0]![0]
    expect(rows.map((r: any) => [r.flashcardId, r.correct])).toEqual([['c1', true], ['c2', false], ['c3', true]])
    expect(mockRecordSession).toHaveBeenCalledTimes(1)
    expect(mockRecordSession.mock.calls[0]![0]).toMatchObject({ kind: 'flashcard', score: 2, total: 3, deckId: '__due__' })
    // Done does not record a second time.
    fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(mockRecordSession).toHaveBeenCalledTimes(1)
  })

  it('exiting part-way records what was graded, then leaves', async () => {
    const onExit = renderStack(3)
    await grade(/^Hard/)
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Exit review' })) })
    // Hard is a pass for scheduling, but not a correct answer for the score.
    expect(mockRecordProgress.mock.calls[0]![0]).toEqual([expect.objectContaining({ flashcardId: 'c1', correct: false })])
    expect(mockRecordSession.mock.calls[0]![0]).toMatchObject({ score: 0, total: 1 })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('exiting before any grade records nothing', async () => {
    const onExit = renderStack(3)
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Exit review' })) })
    expect(mockRecordProgress).not.toHaveBeenCalled()
    expect(mockRecordSession).not.toHaveBeenCalled()
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('scores honestly: Again and Hard are not correct, Good and Easy are', async () => {
    renderStack(4)
    await grade(/^Again/)
    await grade(/^Hard/)
    await grade(/^Good/)
    await grade(/^Easy/)
    const rows = mockRecordProgress.mock.calls[0]![0]
    expect(rows.map((r: any) => r.correct)).toEqual([false, false, true, true])
    expect(mockRecordSession.mock.calls[0]![0]).toMatchObject({ score: 2, total: 4 })
    expect(mockRecordSrs.mock.calls.map(c => c[0][0].correct)).toEqual([false, false, true, true])
  })

  it('a failed progress/session write still reaches the summary', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRecordProgress.mockRejectedValue(new Error('disk'))
    mockRecordSession.mockRejectedValue(new Error('disk'))
    renderStack(1)
    await grade(/^Good/)
    expect(screen.getByRole('header', { name: 'Review done' })).toBeTruthy()
    warn.mockRestore()
  })
})

// ── M1: progress is never lost on leave ──────────────────────────────────────
describe('FlashcardStack — saving on leave', () => {
  it('unmounting part-way (iOS swipe-back, Android back) saves what was graded, once', async () => {
    const { unmount } = render(<FlashcardStack title="Due today" cards={cards(3)} deckId="__due__" onExit={jest.fn()} />)
    await grade(/^Good/)
    await grade(/^Again/)
    expect(mockRecordProgress).not.toHaveBeenCalled()
    await act(async () => { unmount() })
    expect(mockRecordProgress).toHaveBeenCalledTimes(1)
    expect(mockRecordProgress.mock.calls[0]![0].map((r: any) => [r.flashcardId, r.correct])).toEqual([['c1', true], ['c2', false]])
    expect(mockRecordSession).toHaveBeenCalledTimes(1)
    expect(mockRecordSession.mock.calls[0]![0]).toMatchObject({ kind: 'flashcard', score: 1, total: 2, deckId: '__due__' })
  })

  it('unmounting with nothing graded writes nothing', async () => {
    const { unmount } = render(<FlashcardStack title="Due today" cards={cards(3)} deckId="__due__" onExit={jest.fn()} />)
    await act(async () => { unmount() })
    expect(mockRecordProgress).not.toHaveBeenCalled()
    expect(mockRecordSession).not.toHaveBeenCalled()
  })

  it('saves on the navigator\'s beforeRemove, and the unmount after it does not write twice', async () => {
    const listeners: Record<string, () => void> = {}
    const navigation = { addListener: jest.fn((evt: string, cb: () => void) => { listeners[evt] = cb; return () => {} }) }
    const { unmount } = render(
      <NavigationContext.Provider value={navigation as never}>
        <FlashcardStack title="Due today" cards={cards(3)} deckId="__due__" onExit={jest.fn()} />
      </NavigationContext.Provider>,
    )
    await grade(/^Easy/)
    expect(navigation.addListener).toHaveBeenCalledWith('beforeRemove', expect.any(Function))
    await act(async () => { listeners.beforeRemove!() })
    expect(mockRecordSession).toHaveBeenCalledTimes(1)
    await act(async () => { unmount() })
    expect(mockRecordProgress).toHaveBeenCalledTimes(1)
    expect(mockRecordSession).toHaveBeenCalledTimes(1)
  })

  it('going to the background saves the graded cards; finishing later adds only the rest and one session', async () => {
    let onChange: ((s: string) => void) | undefined
    const sub = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      onChange = cb
      return { remove: jest.fn() }
    }) as never)
    renderStack(3)
    await grade(/^Good/)
    await act(async () => { onChange!('background') })
    expect(mockRecordProgress).toHaveBeenCalledTimes(1)
    expect(mockRecordProgress.mock.calls[0]![0].map((r: any) => r.flashcardId)).toEqual(['c1'])
    expect(mockRecordSession).not.toHaveBeenCalled()
    await act(async () => { onChange!('active') })
    await grade(/^Hard/)
    await grade(/^Easy/)
    expect(mockRecordProgress).toHaveBeenCalledTimes(2)
    expect(mockRecordProgress.mock.calls[1]![0].map((r: any) => r.flashcardId)).toEqual(['c2', 'c3'])
    expect(mockRecordSession).toHaveBeenCalledTimes(1)
    expect(mockRecordSession.mock.calls[0]![0]).toMatchObject({ score: 2, total: 3 })
    sub.mockRestore()
  })
})

// ── M2 + honest empties ──────────────────────────────────────────────────────
describe('FlashcardStack — accessibility and empty cards', () => {
  it('announces the answer to screen readers when it is revealed (iOS ignores live regions)', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    renderStack(3)
    expect(announce).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('Answer: Answer 1')
    announce.mockRestore()
  })

  it('an empty stack is an honest empty state, never "Review done" with 0 cards', () => {
    const onExit = jest.fn()
    render(<FlashcardStack title="Due today" cards={[]} deckId="__due__" onExit={onExit} />)
    expect(screen.queryByText('Review done')).toBeNull()
    expect(screen.queryByText(/reviewed 0 cards/)).toBeNull()
    expect(screen.getByRole('header', { name: 'Nothing to review' })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(onExit).toHaveBeenCalled()
  })

  it('toStackCards keeps a due card whose answer is empty (consistent with the due count), drops only missing rows', () => {
    const rows = [
      { id: 'a', question: 'QA', answer: 'Yes' },
      { id: 'b', question: 'QB', answer: null },
      { id: 'c', question: 'QC', answer: '   ' },
    ]
    const out = toStackCards([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'gone' }], rows as never)
    expect(out.map(c => [c.id, c.answer])).toEqual([['a', 'Yes'], ['b', ''], ['c', '']])
  })

  it('a card with no saved answer says so, and can still be graded (so it leaves the due queue)', async () => {
    render(<FlashcardStack title="Due today" cards={[{ id: 'c1', question: 'Q?', answer: '' }]} deckId="__due__" onExit={jest.fn()} />)
    fireEvent.press(screen.getByRole('button', { name: 'Show answer' }))
    expect(screen.getByText('No answer saved yet')).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /^Good/ })) })
    expect(mockRecordSrs).toHaveBeenCalledTimes(1)
  })
})
