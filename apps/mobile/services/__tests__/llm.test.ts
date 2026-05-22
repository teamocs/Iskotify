jest.mock('llama.rn', () => ({ initLlama: jest.fn() }))
jest.mock('expo-file-system', () => ({ documentDirectory: '/mock/', getInfoAsync: jest.fn() }))
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
})
