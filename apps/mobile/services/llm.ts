import { initLlama, type LlamaContext } from 'llama.rn'
import * as FileSystem from 'expo-file-system/legacy'
import * as Device from 'expo-device'
import { parseCoachPhrase } from './coachPrompts'

export { parseCoachPhrase }

// Correct filename: the bartowski GGUF repo prefixes files with `google_`.
// Full file list: https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF
const MODEL_FILENAME = 'google_gemma-3-1b-it-Q4_K_M.gguf'
const MODEL_DIR = `${FileSystem.documentDirectory}models/`
export const MODEL_PATH = `${MODEL_DIR}${MODEL_FILENAME}`

// NOTE: The correct repo slug is `bartowski/google_gemma-3-1b-it-GGUF` (with `google_` prefix).
// The previous slug `bartowski/gemma-3-1b-it-GGUF` (without the prefix) does not exist and
// caused all downloads to fail with a 404.  The filename also carries the `google_` prefix.
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF/resolve/main/google_gemma-3-1b-it-Q4_K_M.gguf'

/**
 * Resolve the final CDN/S3 URL for the model by following HuggingFace's
 * redirect chain.  Android's DownloadManager can silently fail when it
 * encounters the multi-hop 302 → LFS → S3 redirect that HuggingFace uses,
 * so we resolve the destination in JS first and hand the direct URL to the
 * native downloader.
 *
 * Returns the resolved URL, or the original MODEL_DOWNLOAD_URL if the
 * HEAD request fails (graceful degradation).
 */
export async function resolveDownloadUrl(): Promise<string> {
  try {
    const response = await fetch(MODEL_DOWNLOAD_URL, {
      method: 'HEAD',
      redirect: 'follow',
    })
    // `response.url` is the final URL after all redirects have been followed
    if (response.ok && response.url && response.url !== MODEL_DOWNLOAD_URL) {
      return response.url
    }
  } catch (err) {
    console.warn('[llm] resolveDownloadUrl failed, falling back to original URL:', err)
  }
  return MODEL_DOWNLOAD_URL
}

const MIN_RAM_BYTES = 2 * 1024 * 1024 * 1024
export const IDLE_RELEASE_MS = 60_000

export function hasEnoughRam(): boolean {
  const total = Device.totalMemory
  if (total === null) return false
  return total >= MIN_RAM_BYTES
}

export async function modelExists(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH)
  return info.exists
}

export async function ensureModelDirectory(): Promise<void> {
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true })
}

// ── Persistent context + mutex ────────────────────────────────────────────────

let ctxRef: LlamaContext | null = null
let lastUsedAt = 0
let inflightChain: Promise<unknown> = Promise.resolve()

async function getContext(): Promise<LlamaContext> {
  if (ctxRef) return ctxRef
  ctxRef = await initLlama({
    model: MODEL_PATH.replace(/^file:\/\//, ''),
    n_ctx: 2048,
    n_threads: 4,
  })
  return ctxRef
}

async function releaseContext(): Promise<void> {
  if (ctxRef) {
    try { await ctxRef.release() } catch { /* ignore */ }
    ctxRef = null
  }
}

/** Release the context if it has been idle for longer than IDLE_RELEASE_MS.
 *  Serialized through the mutex so it cannot fire during an in-flight inference. */
export async function releaseContextIfIdle(): Promise<void> {
  return withMutex(async () => {
    if (ctxRef && Date.now() - lastUsedAt > IDLE_RELEASE_MS) {
      await releaseContext()
    }
  })
}

/** Force-release the context — useful for app teardown.
 *  Serialized through the mutex so concurrent calls are safe. */
export async function releaseContextNow(): Promise<void> {
  return withMutex(async () => {
    await releaseContext()
  })
}

function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = inflightChain.then(fn, fn)
  inflightChain = next.catch(() => undefined)
  return next
}

// ── MCQ inference (used by useAiEnhancement) ─────────────────────────────────

type PromptStrategy = 'science' | 'math' | 'language'

function detectStrategy(subjectName: string): PromptStrategy {
  const s = subjectName.toLowerCase()
  if (
    s.includes('math') || s.includes('algebra') ||
    s.includes('geometry') || s.includes('trigonometry') ||
    s.includes('calculus') || s.includes('statistics') ||
    s.includes('arithmetic')
  ) return 'math'
  if (
    s.includes('english') || s.includes('filipino') ||
    s.includes('language') || s.includes('panitikan') ||
    s.includes('wika') || s.includes('grammar') ||
    s.includes('reading') || s.includes('vocabulary') ||
    s.includes('literature') || s.includes('comprehension')
  ) return 'language'
  return 'science'
}

export function buildPrompt(params: {
  subjectName: string
  topicName: string
  question: string
  answer: string
}): string {
  const { subjectName, topicName, question, answer } = params
  const strategy = detectStrategy(subjectName)

  let systemPrompt: string
  if (strategy === 'math') {
    systemPrompt =
      `You are an expert UPCAT Math reviewer. Do NOT solve the problem. Instead, generate exactly ` +
      `3 incorrect answer choices that reflect common student mistakes such as sign errors, wrong ` +
      `formula application, or arithmetic slips. Write a 2-sentence explanation of why the Right ` +
      `Answer is correct. Output ONLY valid JSON, no other text.`
  } else if (strategy === 'language') {
    systemPrompt =
      `You are an expert UPCAT Language reviewer. Generate exactly 3 grammatically or idiomatically ` +
      `incorrect variations of the correct answer that a student might plausibly choose. Write a ` +
      `2-sentence explanation of why the Right Answer is correct. Output ONLY valid JSON, no other text.`
  } else {
    systemPrompt =
      `You are an expert UPCAT reviewer engine. Analyze the provided Question, Subject, and Right Answer. ` +
      `Generate exactly 3 plausible, highly challenging college-level incorrect choices (distractors) that ` +
      `fit the context but are factually wrong. Then write a crisp 2-sentence explanation of why the Right ` +
      `Answer is correct. Output ONLY valid JSON, no other text.`
  }

  const userMessage =
    `Subject: ${subjectName} (${topicName})\n` +
    `Question: ${question}\n` +
    `Right Answer: ${answer}`

  return (
    `<start_of_turn>user\n${systemPrompt}\n\n${userMessage}<end_of_turn>\n` +
    `<start_of_turn>model\n`
  )
}

export interface LlmOutput {
  wrong_option_1: string
  wrong_option_2: string
  wrong_option_3: string
  explanation: string
}

export function parseResponse(text: string): LlmOutput | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as Partial<LlmOutput>
    const requiredFields: Array<keyof LlmOutput> = [
      'wrong_option_1', 'wrong_option_2', 'wrong_option_3', 'explanation',
    ]
    for (const f of requiredFields) {
      if (typeof parsed[f] !== 'string' || !parsed[f]) return null
    }
    return parsed as LlmOutput
  } catch {
    return null
  }
}

export async function runInference(prompt: string): Promise<LlmOutput | null> {
  return withMutex(async () => {
    const ctx = await getContext()
    lastUsedAt = Date.now()
    try {
      const result = await ctx.completion({
        prompt,
        n_predict: 400,
        temperature: 0.1,
        stop: ['<end_of_turn>', '<eos>'],
      })
      lastUsedAt = Date.now()
      return parseResponse(result.text)
    } catch (err) {
      await releaseContext()
      throw err
    }
  })
}

// ── Coach inference (used by AiCoachProvider) ────────────────────────────────

export async function runCoachInference(prompt: string): Promise<string | null> {
  return withMutex(async () => {
    const ctx = await getContext()
    lastUsedAt = Date.now()
    try {
      const result = await ctx.completion({
        prompt,
        n_predict: 80,
        temperature: 0.7,
        stop: ['<end_of_turn>', '<eos>', '\n\n'],
      })
      lastUsedAt = Date.now()
      return parseCoachPhrase(result.text)
    } catch (err) {
      await releaseContext()
      throw err
    }
  })
}

// ── Chat streaming inference (used by useKuyaChat) ───────────────────────────

export interface StreamChatOptions {
  /** Max tokens to generate. Defaults to 60 (tight for short Q&A). Math queries
   *  should pass ~250 so multi-step solutions don't truncate. */
  nPredict?: number
  /** Sampling temperature. Defaults to 0.2 (balanced). Math should use ~0.05
   *  so the model doesn't hallucinate digits. */
  temperature?: number
}

export async function streamChatInference(
  prompt: string,
  onToken: (text: string) => void,
  signal: AbortSignal,
  options: StreamChatOptions = {},
): Promise<string> {
  const nPredict = options.nPredict ?? 60
  const temperature = options.temperature ?? 0.2
  return withMutex(async () => {
    if (signal.aborted) return ''
    const ctx = await getContext()
    lastUsedAt = Date.now()
    let collected = ''
    try {
      const result = await ctx.completion(
        {
          prompt,
          n_predict: nPredict,
          temperature,
          top_k: 40,
          penalty_repeat: 1.1,
          stop: ['<end_of_turn>', '<eos>', '<start_of_turn>'],
        },
        (tokenData: { token?: string }) => {
          if (signal.aborted) return
          const text = tokenData.token ?? ''
          collected += text
          onToken(text)
        },
      )
      lastUsedAt = Date.now()
      return collected || result.text || ''
    } catch (err) {
      await releaseContext()
      throw err
    }
  })
}
