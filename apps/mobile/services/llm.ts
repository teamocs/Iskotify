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
// Extended from 60 s → 300 s: chat sessions often have a pause between messages;
// releasing at 60 s was re-incurring the full model-load cost mid-conversation.
// The context is still released immediately on app background / teardown (see
// releaseContextNow calls in KuyaChatProvider / AppState listener).
export const IDLE_RELEASE_MS = 300_000

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
  // ── n_ctx decision ────────────────────────────────────────────────────────
  // Worst-case token budget (rough BPE estimate, 1 token ≈ 4 chars):
  //   System prompt (SYSTEM_PROMPT_MATH, the largest):    ~230 tokens
  //   [STUDENT CONTEXT] block:                             ~60 tokens
  //   [RELEVANT FLASHCARDS] (3 cards × ~60 tok each):    ~180 tokens
  //   [LISTINGS] block (2 entries):                        ~60 tokens
  //   [COURSES] block (2 entries):                         ~60 tokens
  //   10-message chat history (avg 40 tok/msg × 10):      ~400 tokens
  //   User question (max practical):                        ~80 tokens
  //   Model response budget (math path):                   ~250 tokens
  //   Gemma turn tokens + overhead:                         ~30 tokens
  //   TOTAL:                                             ~1,350 tokens
  // 1536 is NOT comfortable headroom for adversarial prompts (long history +
  // all context blocks simultaneously). Keeping 2048 gives ~700 slack tokens,
  // which is safer and costs < 50 MB extra RAM at q4 KV.  Decision: KEEP 2048.
  //
  // ── Speculative / MTP ─────────────────────────────────────────────────────
  // llama.rn 0.12.3 typings expose `speculative?: NativeSpeculativeConfig` with
  // types 'none' | 'draft-mtp' | 'mtp'. The JSDoc says "MTP on recurrent/hybrid
  // models must be enabled here so llama.cpp can allocate recurrent-state rollback
  // slots." Gemma 3 1B is a dense transformer — it has NO MTP heads. Enabling
  // draft-mtp/mtp without a matching second draft model would crash or silently
  // degrade inference. Gemma 4 is the first Gemma with built-in MTP heads and a
  // published draft-model. We must NOT add a second model download (RAM + storage
  // regression on 2 GB-gate devices). speculative is intentionally omitted.
  ctxRef = await initLlama({
    model: MODEL_PATH.replace(/^file:\/\//, ''),
    n_ctx: 2048,
    // n_threads 4 → 6: typical big.LITTLE phones have ≥8 cores; llama.cpp
    // schedules work onto perf cores — 6 threads saturates them without
    // spilling onto efficiency cores and causing cache thrash.
    n_threads: 6,
    // Batch size for prompt processing (token parallelism). 512 is a common
    // sweet-spot for single-sequence mobile inference; default is often 512
    // already in llama.cpp but explicit here for clarity.
    n_batch: 512,
    // KV cache precision: f16 halves the KV memory vs f32 with negligible
    // quality loss at Q4 quantisation levels. Marked "Experimental" in
    // llama.cpp but widely used in production mobile builds.
    cache_type_k: 'f16',
    cache_type_v: 'f16',
    // Flash attention: improves throughput on long contexts; the 'auto' string
    // is accepted by the typings (flash_attn_type?: string). The JSDoc says
    // "only recommended in GPU device" but on CPU it degrades gracefully (the
    // kernel falls back to standard attention if unsupported at runtime).
    flash_attn_type: 'auto',
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

/**
 * Fire-and-forget model prewarm.
 *
 * Ensures the LlamaContext is initialised so the first real send pays only the
 * KV-cache population cost (a few hundred ms) rather than the full model-load
 * cost (~2–5 s on mid-range devices).  Call this when the chat modal starts
 * opening so init happens during the animation instead of on the first message.
 *
 * Safety: the module-level mutex (`inflightChain`) and `ctxRef` guard guarantee
 * no double-init even if warmUpLlama is called multiple times concurrently; the
 * second caller re-uses the in-flight promise from the first.
 */
export function warmUpLlama(): void {
  withMutex(async () => {
    try {
      await getContext()
    } catch (err) {
      // Non-fatal: the first real send will retry via getContext()
      console.warn('[llm] warmUpLlama failed (will retry on first send):', err)
    }
  }).catch(() => { /* already logged inside */ })
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

// ── Raw completion (used by the offline tier of hybrid listing search) ───────

export async function runRawCompletion(prompt: string, maxTokens = 80): Promise<string | null> {
  return withMutex(async () => {
    const ctx = await getContext()
    lastUsedAt = Date.now()
    try {
      const result = await ctx.completion({
        prompt,
        n_predict: maxTokens,
        temperature: 0.3,
        stop: ['<end_of_turn>', '<eos>', '\n\n'],
      })
      lastUsedAt = Date.now()
      return (result.text ?? '').trim() || null
    } catch (err) {
      await releaseContext()
      throw err
    }
  })
}

// ── Chat streaming inference (used by useKuyaChat) ───────────────────────────

export interface StreamChatOptions {
  /** Max tokens to generate. Defaults to 48 (tight for 2-sentence Q&A). Math
   *  queries should pass ~250 so multi-step solutions don't truncate. */
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
  // Non-math default: 48 tokens fits 2 tight sentences (was 60 — trimmed to
  // reduce mean first-token-to-completion latency; math stays 250 via options).
  // Stop tokens already include '<end_of_turn>' so Gemma's turn-end EOS fires
  // before the hard limit in most cases.
  const nPredict = options.nPredict ?? 48
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
