/**
 * ChatBubble render tests.
 *
 * The STEP 3 change is a token cleanup only (no behavior change):
 *   - user-message text color: '#fff' → t.textInverse
 *   - error text color: '#ef4444' → t.danger
 * These tests lock in the structural behavior (user vs assistant text, streaming
 * cursor, error line) and assert the user/error colors come from theme tokens.
 */
import React from 'react'
import { render } from '@testing-library/react-native'
import { ChatBubble } from '../ChatBubble'
import type { ChatMessage } from '../../hooks/useKuyaChat'

// themeContextMock supplies textInverse ('#ffffff') + danger ('#f87171').
const T_INVERSE = '#ffffff'
const T_DANGER = '#f87171'

function msg(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    text: '',
    timestamp: Date.now(),
    ...partial,
  }
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flatten(s) }), {})
  }
  return (style ?? {}) as Record<string, unknown>
}

describe('ChatBubble', () => {
  it('renders assistant message text', () => {
    const { getByText } = render(<ChatBubble message={msg({ role: 'assistant', text: 'Hello there' })} />)
    expect(getByText('Hello there')).toBeTruthy()
  })

  it('renders user message text in the inverse token color', () => {
    const { getByText } = render(<ChatBubble message={msg({ role: 'user', text: 'My question' })} />)
    const node = getByText('My question')
    expect(flatten(node.props.style).color).toBe(T_INVERSE)
  })

  it('renders an error line in the danger token color', () => {
    const { getByText } = render(
      <ChatBubble message={msg({ role: 'assistant', text: 'partial', error: 'Something went wrong' })} />,
    )
    const errNode = getByText('Something went wrong')
    expect(flatten(errNode.props.style).color).toBe(T_DANGER)
  })

  it('labels user vs assistant rows', () => {
    const user = render(<ChatBubble message={msg({ role: 'user', text: 'hi' })} />)
    expect(user.getByText(/^you ·/)).toBeTruthy()
    const assistant = render(<ChatBubble message={msg({ role: 'assistant', text: 'hi' })} />)
    expect(assistant.getByText(/^Kuya Baw ·/)).toBeTruthy()
  })

  // ── Mascot avatar tests (RED → GREEN) ─────────────────────────────────────

  it('assistant message renders the Kuya Baw mascot avatar', () => {
    const { getByTestId } = render(<ChatBubble message={msg({ role: 'assistant', text: 'Hello' })} />)
    expect(getByTestId('kuya-avatar')).toBeTruthy()
  })

  it('user message does NOT render the Kuya Baw mascot avatar', () => {
    const { queryByTestId } = render(<ChatBubble message={msg({ role: 'user', text: 'Hi' })} />)
    expect(queryByTestId('kuya-avatar')).toBeNull()
  })

  it('streaming/thinking assistant bubble renders the Kuya Baw mascot avatar', () => {
    const { getByTestId } = render(
      <ChatBubble message={msg({ role: 'assistant', text: '', isStreaming: true })} />,
    )
    expect(getByTestId('kuya-avatar')).toBeTruthy()
  })
})
