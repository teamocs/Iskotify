jest.mock('llama.rn', () => ({
  initLlama: jest.fn().mockResolvedValue({
    completion: jest.fn().mockResolvedValue({ text: 'Tara mag-review tayo!' }),
    release: jest.fn().mockResolvedValue(undefined),
  }),
}))
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: '/mock/', getInfoAsync: jest.fn() }))
jest.mock('expo-device', () => ({ totalMemory: 4 * 1024 * 1024 * 1024 }))

import { buildPrompt, parseResponse } from '../llm'

describe('buildPrompt', () => {
  it('uses science prompt for Biology subject', () => {
    const prompt = buildPrompt({ subjectName: 'Science (Biology)', topicName: 'Cell Biology', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('UPCAT reviewer engine')
    expect(prompt).toContain('factually wrong')
  })

  it('uses math prompt for Mathematics subject', () => {
    const prompt = buildPrompt({ subjectName: 'Mathematics', topicName: 'Algebra', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('Do NOT solve')
    expect(prompt).toContain('student mistakes')
  })

  it('uses math prompt when subject contains Geometry', () => {
    const prompt = buildPrompt({ subjectName: 'Geometry', topicName: 'Circles', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('Do NOT solve')
  })

  it('uses language prompt for English subject', () => {
    const prompt = buildPrompt({ subjectName: 'English', topicName: 'Grammar', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('grammatically')
  })

  it('uses language prompt for Filipino subject', () => {
    const prompt = buildPrompt({ subjectName: 'Filipino', topicName: 'Panitikan', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('grammatically')
  })

  it('uses math prompt for Calculus', () => {
    expect(buildPrompt({ subjectName: 'Calculus', topicName: 'Limits', question: 'Q?', answer: 'A' })).toContain('Do NOT solve')
  })

  it('uses math prompt for Statistics', () => {
    expect(buildPrompt({ subjectName: 'Statistics', topicName: 'Mean', question: 'Q?', answer: 'A' })).toContain('Do NOT solve')
  })

  it('uses language prompt for Reading Comprehension', () => {
    expect(buildPrompt({ subjectName: 'Reading Comprehension', topicName: 'Inference', question: 'Q?', answer: 'A' })).toContain('grammatically')
  })

  it('uses language prompt for Panitikan', () => {
    expect(buildPrompt({ subjectName: 'Panitikan', topicName: 'Noli Me Tangere', question: 'Q?', answer: 'A' })).toContain('grammatically')
  })

  it('uses language prompt for Literature', () => {
    expect(buildPrompt({ subjectName: 'Literature', topicName: 'Sonnets', question: 'Q?', answer: 'A' })).toContain('grammatically')
  })

  it('uses science prompt for Science (default fallback)', () => {
    expect(buildPrompt({ subjectName: 'Chemistry', topicName: 'Bonds', question: 'Q?', answer: 'A' })).toContain('factually wrong')
  })

  it('includes ChatML format tokens for Qwen', () => {
    const prompt = buildPrompt({ subjectName: 'Science', topicName: 'Physics', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('<|im_start|>system')
    expect(prompt).toContain('<|im_end|>')
    expect(prompt).toContain('<|im_start|>user')
    expect(prompt).toContain('<|im_start|>assistant')
  })

  it('includes subject, question, and answer in user section', () => {
    const prompt = buildPrompt({ subjectName: 'Biology', topicName: 'Genetics', question: 'What is DNA?', answer: 'Deoxyribonucleic acid' })
    expect(prompt).toContain('Biology')
    expect(prompt).toContain('What is DNA?')
    expect(prompt).toContain('Deoxyribonucleic acid')
  })
})

describe('parseResponse', () => {
  it('parses valid JSON output', () => {
    const text = `{"wrong_option_1":"A","wrong_option_2":"B","wrong_option_3":"C","explanation":"Because."}`
    const result = parseResponse(text)
    expect(result).not.toBeNull()
    expect(result!.wrong_option_1).toBe('A')
    expect(result!.wrong_option_2).toBe('B')
    expect(result!.wrong_option_3).toBe('C')
    expect(result!.explanation).toBe('Because.')
  })

  it('extracts JSON from surrounding model chatter', () => {
    const text = `Sure! Here you go: {"wrong_option_1":"A","wrong_option_2":"B","wrong_option_3":"C","explanation":"Because."} Hope that helps.`
    const result = parseResponse(text)
    expect(result).not.toBeNull()
    expect(result!.wrong_option_1).toBe('A')
  })

  it('returns null for malformed JSON', () => {
    expect(parseResponse('not json at all')).toBeNull()
  })

  it('returns null when wrong_option fields are missing', () => {
    expect(parseResponse('{"explanation":"Because."}')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseResponse('')).toBeNull()
  })

  it('returns null when wrong_option_1 is a number', () => {
    expect(parseResponse('{"wrong_option_1":1,"wrong_option_2":"B","wrong_option_3":"C","explanation":"x"}')).toBeNull()
  })

  it('returns null when explanation is not a string', () => {
    expect(parseResponse('{"wrong_option_1":"A","wrong_option_2":"B","wrong_option_3":"C","explanation":null}')).toBeNull()
  })

  it('returns null when fields are objects', () => {
    expect(parseResponse('{"wrong_option_1":{"a":1},"wrong_option_2":"B","wrong_option_3":"C","explanation":"x"}')).toBeNull()
  })
})

describe('coach exports', () => {
  it('re-exports parseCoachPhrase from coachPrompts', () => {
    const { parseCoachPhrase } = require('../llm')
    expect(typeof parseCoachPhrase).toBe('function')
    expect(parseCoachPhrase('Tara mag-review tayo!')).toBe('Tara mag-review tayo!')
    expect(parseCoachPhrase('')).toBeNull()
  })

  it('exports runCoachInference as an async function', () => {
    const { runCoachInference } = require('../llm')
    expect(typeof runCoachInference).toBe('function')
  })

  it('exports releaseContextIfIdle as an async function', () => {
    const { releaseContextIfIdle } = require('../llm')
    expect(typeof releaseContextIfIdle).toBe('function')
  })
})

describe('inference mutex', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('serializes concurrent coach inferences in FIFO order', async () => {
    const order: number[] = []
    let n = 0
    const completion = jest.fn().mockImplementation(async () => {
      const i = ++n
      order.push(i)
      await new Promise(r => setTimeout(r, 5))
      order.push(-i)
      return { text: 'Tara mag-review tayo na!' }
    })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({
      completion,
      release: jest.fn().mockResolvedValue(undefined),
    })

    const { runCoachInference } = require('../llm')

    await Promise.all([
      runCoachInference('a'),
      runCoachInference('b'),
      runCoachInference('c'),
    ])

    // FIFO: each inference completes (negative number) before the next starts (positive number)
    expect(order).toEqual([1, -1, 2, -2, 3, -3])
    expect(completion).toHaveBeenCalledTimes(3)
  })

  it('releases context if inference throws', async () => {
    const release = jest.fn().mockResolvedValue(undefined)
    const completion = jest.fn().mockRejectedValueOnce(new Error('native crash'))
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({ completion, release })

    const { runCoachInference } = require('../llm')

    await expect(runCoachInference('boom')).rejects.toThrow('native crash')
    expect(release).toHaveBeenCalled()
  })
})

describe('streamChatInference', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('fires onToken for each token emitted by the completion callback', async () => {
    const tokens = ['Hello', ' ', 'world', '!']
    const completion = jest.fn().mockImplementation(async (_params, cb) => {
      for (const t of tokens) cb({ token: t })
      return { text: tokens.join('') }
    })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({
      completion,
      release: jest.fn().mockResolvedValue(undefined),
    })

    const { streamChatInference } = require('../llm')
    const collected: string[] = []
    const controller = new AbortController()
    const final = await streamChatInference('test prompt', (t: string) => collected.push(t), controller.signal)

    expect(collected).toEqual(['Hello', ' ', 'world', '!'])
    expect(final).toBe('Hello world!')
  })

  it('stops emitting tokens after abort signal fires', async () => {
    const completion = jest.fn().mockImplementation(async (_params, cb) => {
      cb({ token: 'first' })
      cb({ token: 'second' })
      // Caller aborts here in the test body via controller.abort()
      cb({ token: 'third' })
      cb({ token: 'fourth' })
      return { text: 'firstsecondthirdfourth' }
    })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({
      completion,
      release: jest.fn().mockResolvedValue(undefined),
    })

    const { streamChatInference } = require('../llm')
    const controller = new AbortController()
    const collected: string[] = []
    const promise = streamChatInference('p', (t: string) => {
      collected.push(t)
      if (collected.length === 2) controller.abort()
    }, controller.signal)
    await promise

    // Only the first two tokens should have been collected (signal blocks 3rd and 4th)
    expect(collected).toEqual(['first', 'second'])
  })
})
