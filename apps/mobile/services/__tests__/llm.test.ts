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

describe('Gemma 4 E2B model constants', () => {
  it('MODEL_DOWNLOAD_URL points to bartowski gemma-4-E2B Q4_K_M', () => {
    const { MODEL_DOWNLOAD_URL } = require('../llm')
    expect(MODEL_DOWNLOAD_URL).toContain('bartowski')
    expect(MODEL_DOWNLOAD_URL).toContain('gemma-4-E2B-it')
    expect(MODEL_DOWNLOAD_URL).toContain('Q4_K_M')
    expect(MODEL_DOWNLOAD_URL).toContain('google_gemma-4-E2B-it-Q4_K_M.gguf')
  })

  it('MODEL_SIZE_BYTES is the verified byte count (3,462,678,272)', () => {
    const { MODEL_SIZE_BYTES } = require('../llm')
    expect(MODEL_SIZE_BYTES).toBe(3_462_678_272)
  })

  it('MODEL_SIZE_LABEL is "~3.4 GB"', () => {
    const { MODEL_SIZE_LABEL } = require('../llm')
    expect(MODEL_SIZE_LABEL).toBe('~3.4 GB')
  })

  it('MODEL_PATH uses the new Gemma 4 filename', () => {
    const { MODEL_PATH } = require('../llm')
    expect(MODEL_PATH).toContain('google_gemma-4-E2B-it-Q4_K_M.gguf')
    expect(MODEL_PATH).not.toContain('gemma-3')
  })
})

describe('hasEnoughRam — 4 GB gate', () => {
  it('returns true when device reports 4 GB (4 * 1024^3)', () => {
    // Default mock: 4 GB — set by the top-level jest.mock('expo-device')
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(true)
  })

  it('returns false when device reports 2 GB (below 3.6 GB threshold)', () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ totalMemory: 2 * 1024 * 1024 * 1024 }))
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(false)
  })

  it('returns false when totalMemory is null', () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ totalMemory: null }))
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(false)
  })

  it('returns true for 3.6 GB exactly (boundary)', () => {
    jest.resetModules()
    jest.mock('expo-device', () => ({ totalMemory: 3.6e9 }))
    const { hasEnoughRam } = require('../llm')
    expect(hasEnoughRam()).toBe(true)
  })
})

describe('getContext — MTP speculative init + fallback', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('passes speculative: "mtp" to initLlama on first attempt', async () => {
    const mockCtx = {
      completion: jest.fn().mockResolvedValue({ text: 'ok' }),
      release: jest.fn().mockResolvedValue(undefined),
    }
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue(mockCtx)

    const { runCoachInference } = require('../llm')
    await runCoachInference('hello')

    expect(llama.initLlama).toHaveBeenCalledTimes(1)
    const callArgs = llama.initLlama.mock.calls[0]![0]
    expect(callArgs.speculative).toBe('mtp')
    expect(callArgs.n_batch).toBe(512)
    expect(callArgs.n_threads).toBe(6)
    expect(callArgs.n_ctx).toBe(2048)
    expect(callArgs.cache_type_k).toBe('f16')
    expect(callArgs.cache_type_v).toBe('f16')
    expect(callArgs.flash_attn_type).toBe('auto')
  })

  it('retries without speculative when MTP init fails, then succeeds', async () => {
    const mockCtx = {
      completion: jest.fn().mockResolvedValue({ text: 'Tara mag-review tayo!' }),
      release: jest.fn().mockResolvedValue(undefined),
    }
    const llama = require('llama.rn')
    // First call (with MTP) fails; second call (without) succeeds
    llama.initLlama
      .mockRejectedValueOnce(new Error('MTP not supported'))
      .mockResolvedValueOnce(mockCtx)

    const { runCoachInference } = require('../llm')
    // runCoachInference resolves (no throw) — fallback path succeeded
    await expect(runCoachInference('hello')).resolves.not.toThrow()

    expect(llama.initLlama).toHaveBeenCalledTimes(2)
    // First attempt had speculative
    expect(llama.initLlama.mock.calls[0]![0].speculative).toBe('mtp')
    // Second attempt (fallback) has NO speculative key
    expect(llama.initLlama.mock.calls[1]![0].speculative).toBeUndefined()
  })

  it('propagates error if both MTP and fallback init fail', async () => {
    const llama = require('llama.rn')
    llama.initLlama
      .mockRejectedValueOnce(new Error('MTP not supported'))
      .mockRejectedValueOnce(new Error('init failed'))

    const { runCoachInference } = require('../llm')
    await expect(runCoachInference('hello')).rejects.toThrow('init failed')
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

describe('modelExists — old model cleanup', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns true when new model exists, deletes old model if present', async () => {
    const fs = require('expo-file-system/legacy')
    // New model exists; old model also exists
    fs.getInfoAsync
      .mockResolvedValueOnce({ exists: true })  // MODEL_PATH
      .mockResolvedValueOnce({ exists: true })  // OLD_MODEL_PATH
    fs.deleteAsync.mockResolvedValue(undefined)

    const { modelExists } = require('../llm')
    const result = await modelExists()

    expect(result).toBe(true)
    expect(fs.deleteAsync).toHaveBeenCalledTimes(1)
    expect(fs.deleteAsync.mock.calls[0]![0]).toContain('gemma-3')
  })

  it('returns false when new model absent; still deletes old model if present', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync
      .mockResolvedValueOnce({ exists: false }) // MODEL_PATH
      .mockResolvedValueOnce({ exists: true })  // OLD_MODEL_PATH
    fs.deleteAsync.mockResolvedValue(undefined)

    const { modelExists } = require('../llm')
    const result = await modelExists()

    expect(result).toBe(false)
    expect(fs.deleteAsync).toHaveBeenCalledTimes(1)
  })

  it('does NOT call deleteAsync when old model is absent', async () => {
    const fs = require('expo-file-system/legacy')
    fs.getInfoAsync
      .mockResolvedValueOnce({ exists: true })  // MODEL_PATH
      .mockResolvedValueOnce({ exists: false }) // OLD_MODEL_PATH

    const { modelExists } = require('../llm')
    const result = await modelExists()

    expect(result).toBe(true)
    expect(fs.deleteAsync).not.toHaveBeenCalled()
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

  it('passes top_k: 40 and n_predict: 48 to completion (no top_p)', async () => {
    const completion = jest.fn().mockResolvedValue({ text: 'ok' })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({
      completion,
      release: jest.fn().mockResolvedValue(undefined),
    })

    const { streamChatInference } = require('../llm')
    const controller = new AbortController()
    await streamChatInference('p', () => {}, controller.signal)

    const config = completion.mock.calls[0]![0]
    // Default nPredict trimmed from 60 → 48 (C4: fits 2-sentence Q&A cap tighter)
    expect(config.n_predict).toBe(48)
    expect(config.top_k).toBe(40)
    expect(config.temperature).toBe(0.2)
    expect(config.penalty_repeat).toBe(1.1)
    expect(config.top_p).toBeUndefined()
    // NEW: verify Gemma stop tokens
    expect(config.stop).toContain('<end_of_turn>')
    expect(config.stop).toContain('<eos>')
    expect(config.stop).not.toContain('<|im_end|>')
  })
})
