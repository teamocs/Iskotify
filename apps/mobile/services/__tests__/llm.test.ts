jest.mock('llama.rn', () => ({
  initLlama: jest.fn().mockResolvedValue({
    completion: jest.fn().mockResolvedValue({ text: 'Tara mag-review tayo!' }),
    release: jest.fn().mockResolvedValue(undefined),
  }),
}))
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
}))
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

  it('uses Gemma turn tokens for MCQ prompt', () => {
    const prompt = buildPrompt({ subjectName: 'Science', topicName: 'Physics', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('<start_of_turn>user')
    expect(prompt).toContain('<end_of_turn>')
    expect(prompt).toContain('<start_of_turn>model')
    expect(prompt).not.toContain('<|im_start|>')
    expect(prompt).not.toContain('<|im_end|>')
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

describe('exports', () => {
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

  it('serializes concurrent raw completions in FIFO order', async () => {
    const order: number[] = []
    let n = 0
    const completion = jest.fn().mockImplementation(async () => {
      const i = ++n
      order.push(i)
      await new Promise(r => setTimeout(r, 5))
      order.push(-i)
      return { text: 'ok' }
    })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({
      completion,
      release: jest.fn().mockResolvedValue(undefined),
    })

    const { runRawCompletion } = require('../llm')

    await Promise.all([
      runRawCompletion('a'),
      runRawCompletion('b'),
      runRawCompletion('c'),
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

    const { runRawCompletion } = require('../llm')

    await expect(runRawCompletion('boom')).rejects.toThrow('native crash')
    expect(release).toHaveBeenCalled()
  })
})

describe('Gemma 3 1B Q8_0 model constants', () => {
  it('MODEL_DOWNLOAD_URL points to bartowski gemma-3-1b Q8_0', () => {
    const { MODEL_DOWNLOAD_URL } = require('../llm')
    expect(MODEL_DOWNLOAD_URL).toContain('bartowski')
    expect(MODEL_DOWNLOAD_URL).toContain('gemma-3-1b-it-GGUF')
    expect(MODEL_DOWNLOAD_URL).toContain('Q8_0')
    expect(MODEL_DOWNLOAD_URL).toContain('google_gemma-3-1b-it-Q8_0.gguf')
  })

  it('MODEL_SIZE_BYTES is the verified byte count (1,069,306,624)', () => {
    const { MODEL_SIZE_BYTES } = require('../llm')
    expect(MODEL_SIZE_BYTES).toBe(1_069_306_624)
  })

  it('MODEL_SIZE_LABEL is "~1.1 GB"', () => {
    const { MODEL_SIZE_LABEL } = require('../llm')
    expect(MODEL_SIZE_LABEL).toBe('~1.1 GB')
  })

  it('MODEL_PATH uses the Gemma 3 1B Q8_0 filename', () => {
    const { MODEL_PATH } = require('../llm')
    expect(MODEL_PATH).toContain('google_gemma-3-1b-it-Q8_0.gguf')
    expect(MODEL_PATH).not.toContain('gemma-4')
  })

  it('MODEL_FILENAME is exported and matches the Q8_0 file', () => {
    const { MODEL_FILENAME } = require('../llm')
    expect(MODEL_FILENAME).toBe('google_gemma-3-1b-it-Q8_0.gguf')
  })
})

describe('hasEnoughRam — 2 GB gate (1.8e9 threshold)', () => {
  it('returns true when device reports 4 GB (4 * 1024^3)', () => {
    // Default mock: 4 GB — set by the top-level jest.mock('expo-device')
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(true)
  })

  it('returns true when device reports 2 GB (above 1.8e9 threshold)', () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ totalMemory: 2 * 1024 * 1024 * 1024 }))
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(true)
  })

  it('returns false when device reports 1 GB (below 1.8e9 threshold)', () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ totalMemory: 1 * 1024 * 1024 * 1024 }))
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(false)
  })

  it('returns false when totalMemory is null', () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ totalMemory: null }))
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(false)
  })

  it('returns true for 1.8e9 exactly (boundary)', () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ totalMemory: 1.8e9 }))
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(true)
  })

  it('returns false for 1.79e9 (just below boundary)', () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ totalMemory: 1.79e9 }))
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(false)
  })
})

describe('getContext — single init (no MTP, no fallback)', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('passes correct params to initLlama with NO speculative field', async () => {
    const mockCtx = {
      completion: jest.fn().mockResolvedValue({ text: 'ok' }),
      release: jest.fn().mockResolvedValue(undefined),
    }
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue(mockCtx)

    const { runRawCompletion } = require('../llm')
    await runRawCompletion('hello')

    expect(llama.initLlama).toHaveBeenCalledTimes(1)
    const callArgs = llama.initLlama.mock.calls[0]![0]
    // Gemma 3 has no MTP heads — speculative must NOT be set
    expect(callArgs.speculative).toBeUndefined()
    expect(callArgs.n_batch).toBe(512)
    expect(callArgs.n_threads).toBe(6)
    expect(callArgs.n_ctx).toBe(3072)
    expect(callArgs.cache_type_k).toBe('f16')
    expect(callArgs.cache_type_v).toBe('f16')
    expect(callArgs.flash_attn_type).toBe('auto')
  })

  it('propagates init error directly (no fallback retry)', async () => {
    const llama = require('llama.rn')
    llama.initLlama.mockRejectedValueOnce(new Error('init failed'))

    const { runRawCompletion } = require('../llm')
    await expect(runRawCompletion('hello')).rejects.toThrow('init failed')
    // Only one init attempt — no retry
    expect(llama.initLlama).toHaveBeenCalledTimes(1)
  })

  it('n_predict for runInference is 400 (unchanged)', async () => {
    const completion = jest.fn().mockResolvedValue({
      text: '{"wrong_option_1":"A","wrong_option_2":"B","wrong_option_3":"C","explanation":"x"}',
    })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({ completion, release: jest.fn() })

    const { runInference, buildPrompt } = require('../llm')
    await runInference(buildPrompt({ subjectName: 'Science', topicName: 'Bio', question: 'Q?', answer: 'A' }))
    expect(completion.mock.calls[0]![0].n_predict).toBe(400)
  })
})

describe('modelExists — generalized stale-model cleanup', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns true when current model exists', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockResolvedValueOnce({ exists: true })
    fs.readDirectoryAsync.mockResolvedValueOnce([])

    const { modelExists } = require('../llm')
    const result = await modelExists()
    expect(result).toBe(true)
  })

  it('returns false when current model absent', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockResolvedValueOnce({ exists: false })
    fs.readDirectoryAsync.mockResolvedValueOnce([])

    const { modelExists } = require('../llm')
    const result = await modelExists()
    expect(result).toBe(false)
  })

  it('deletes multiple stale gguf files and keeps current', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockResolvedValueOnce({ exists: true })
    // Seed: two old files + the current one
    fs.readDirectoryAsync.mockResolvedValueOnce([
      'google_gemma-3-1b-it-Q4_K_M.gguf',  // old Q4
      'google_gemma-4-E2B-it-Q4_K_M.gguf', // old E2B (3.4 GB)
      'google_gemma-3-1b-it-Q8_0.gguf',    // current — must NOT be deleted
    ])
    fs.deleteAsync.mockResolvedValue(undefined)

    const { modelExists } = require('../llm')
    await modelExists()
    // Allow fire-and-forget microtasks to settle
    await new Promise(r => setTimeout(r, 0))

    const deletedPaths: string[] = fs.deleteAsync.mock.calls.map((c: [string]) => c[0])
    // The two stale files should be deleted
    expect(deletedPaths.some(p => p.includes('Q4_K_M') && p.includes('gemma-3'))).toBe(true)
    expect(deletedPaths.some(p => p.includes('gemma-4-E2B'))).toBe(true)
    // The current file must NOT be deleted
    expect(deletedPaths.every(p => !p.includes('Q8_0'))).toBe(true)
    expect(fs.deleteAsync).toHaveBeenCalledTimes(2)
  })

  it('does NOT call deleteAsync when only the current model exists in dir', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockResolvedValueOnce({ exists: true })
    fs.readDirectoryAsync.mockResolvedValueOnce(['google_gemma-3-1b-it-Q8_0.gguf'])

    const { modelExists } = require('../llm')
    await modelExists()
    await new Promise(r => setTimeout(r, 0))

    expect(fs.deleteAsync).not.toHaveBeenCalled()
  })

  it('does NOT call deleteAsync when dir is empty', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockResolvedValueOnce({ exists: false })
    fs.readDirectoryAsync.mockResolvedValueOnce([])

    const { modelExists } = require('../llm')
    await modelExists()
    await new Promise(r => setTimeout(r, 0))

    expect(fs.deleteAsync).not.toHaveBeenCalled()
  })

  it('ignores readDirectoryAsync errors gracefully', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync.mockResolvedValueOnce({ exists: false })
    fs.readDirectoryAsync.mockRejectedValueOnce(new Error('dir not found'))

    const { modelExists } = require('../llm')
    // Must not throw
    await expect(modelExists()).resolves.toBe(false)
  })
})
