import {
  buildChatPrompt, detectMathSolveRequest, parseChatChunk,
  type ChatMode,
} from '../chatPrompts'

describe('detectMathSolveRequest', () => {
  it('returns true for "solve" / "simplify" / "evaluate" / "compute" / "calculate"', () => {
    expect(detectMathSolveRequest('solve 2x + 3 = 7')).toBe(true)
    expect(detectMathSolveRequest('Please simplify this expression')).toBe(true)
    expect(detectMathSolveRequest('Evaluate the limit')).toBe(true)
    expect(detectMathSolveRequest('Compute the sum')).toBe(true)
    expect(detectMathSolveRequest('Calculate the area')).toBe(true)
  })

  it('returns true for "find x" patterns', () => {
    expect(detectMathSolveRequest('find x in this equation')).toBe(true)
  })

  it('returns true for "= ?" patterns', () => {
    expect(detectMathSolveRequest('what is 2 + 2 = ?')).toBe(true)
  })

  it('returns false for conceptual questions', () => {
    expect(detectMathSolveRequest('What is photosynthesis?')).toBe(false)
    expect(detectMathSolveRequest('Explain Newton\'s third law')).toBe(false)
    expect(detectMathSolveRequest('Anong ibig sabihin ng metaphor?')).toBe(false)
    expect(detectMathSolveRequest('How do I prepare for the exam?')).toBe(false)
  })
})

describe('buildChatPrompt', () => {
  it('includes ChatML envelope (system + user + assistant)', () => {
    const prompt = buildChatPrompt('topic', 'What is photosynthesis?')
    expect(prompt).toContain('<|im_start|>system')
    expect(prompt).toContain('<|im_end|>')
    expect(prompt).toContain('<|im_start|>user')
    expect(prompt).toContain('<|im_start|>assistant')
  })

  it('progress mode includes the data context block', () => {
    const ctx = 'Focused exam: UPCAT 2026 in 30 days\nStreak: 5 days'
    const prompt = buildChatPrompt('progress', 'How am I doing?', ctx)
    expect(prompt).toContain('Focused exam: UPCAT 2026')
    expect(prompt).toContain('Streak: 5 days')
    expect(prompt).toContain('How am I doing?')
  })

  it('progress mode handles missing data context gracefully', () => {
    const prompt = buildChatPrompt('progress', 'How am I doing?')
    expect(prompt).not.toContain('undefined')
    expect(prompt).not.toContain('null')
  })

  it('topic mode does NOT include data context', () => {
    const prompt = buildChatPrompt('topic', 'What is photosynthesis?')
    expect(prompt).not.toContain('STUDENT CONTEXT')
    expect(prompt).not.toContain('Focused exam')
  })

  it('topic mode prepends refuse-note when math-solve detected', () => {
    const prompt = buildChatPrompt('topic', 'solve 2x + 3 = 7')
    expect(prompt).toContain('refuse to solve')
  })

  it('topic mode skips refuse-note for conceptual questions', () => {
    const prompt = buildChatPrompt('topic', 'What is the quadratic formula?')
    expect(prompt).not.toContain('refuse to solve')
  })

  it('system prompts mention Kuya Baw and Taglish', () => {
    const progress = buildChatPrompt('progress', 'q', 'ctx')
    const topic = buildChatPrompt('topic', 'q')
    expect(progress).toContain('Kuya Baw')
    expect(progress).toContain('Taglish')
    expect(topic).toContain('Kuya Baw')
    expect(topic).toContain('Taglish')
  })

  it('topic system prompt contains the math refusal rule', () => {
    const prompt = buildChatPrompt('topic', 'q')
    expect(prompt).toContain('DO NOT solve')
    expect(prompt).toContain('Subukan mo muna')
  })
})

describe('parseChatChunk', () => {
  it('returns the input unchanged for normal text', () => {
    expect(parseChatChunk('Tara mag-review tayo!')).toBe('Tara mag-review tayo!')
  })

  it('strips ChatML im_start / im_end markers', () => {
    expect(parseChatChunk('Hello <|im_end|>')).toBe('Hello ')
    expect(parseChatChunk('<|im_start|>assistant\nText')).toBe('assistant\nText')
  })

  it('strips other <|...|> token markers defensively', () => {
    expect(parseChatChunk('Text <|special|> more')).toBe('Text  more')
  })

  it('returns empty string for empty input', () => {
    expect(parseChatChunk('')).toBe('')
  })
})
