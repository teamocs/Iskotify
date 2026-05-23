jest.mock('llama.rn', () => ({ initLlama: jest.fn() }))
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
