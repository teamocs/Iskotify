import { initLlama, type LlamaContext } from 'llama.rn'
import * as FileSystem from 'expo-file-system/legacy'
import * as Device from 'expo-device'
import { parseCoachPhrase } from './coachPrompts'

export { parseCoachPhrase }

// Gemma 3 1B Q8_0 from bartowski's GGUF repo (public, ungated).
// Verified 2026-06-11: HEAD → 302 → 200 unauthenticated; Content-Length 1,069,306,624 bytes.
// This repo served the original Q4_K_M for weeks — proven ungated.
// Q8_0 at ~1.07 GB loads on every 2 GB-class phone; quality carried by the RAG layer.
export const MODEL_FILENAME = 'google_gemma-3-1b-it-Q8_0.gguf'
const MODEL_DIR = `${FileSystem.documentDirectory}models/`
export const MODEL_PATH = `${MODEL_DIR}${MODEL_FILENAME}`

export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF/resolve/main/google_gemma-3-1b-it-Q8_0.gguf'

/** Exact byte count from a verified unauthenticated HEAD request (2026-06-11). */
export const MODEL_SIZE_BYTES = 1_069_306_624
/** Human-readable size label shown in UI copy. */
export const MODEL_SIZE_LABEL = '~1.1 GB'

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

// Gemma 3 1B Q8_0 requires a 2 GB-class device.
// We gate at 1.8 GB because OEMs routinely under-report totalMemory (system
// reservation, firmware, etc.) — a "2 GB" phone typically reports ~1.8–1.9 GB.
const MIN_RAM_BYTES = 1.8e9
// Extended from 60 s → 300 s: chat sessions often have a pause between messages;
// releasing at 60 s was re-incurring the full model-load cost mid-conversation.
// The context is released when the app backgrounds via releaseContextIfIdle()
// (currently unwired — kept for a future self-hosted AI feature's AppState listener).
export const IDLE_RELEASE_MS = 300_000

export function hasEnoughRam(): boolean {
  const total = Device.totalMemory
  if (total === null) return false
  // Gate: ≥ 1.8 GB counts as a 2 GB-class device (OEM under-reporting margin).
  return total >= MIN_RAM_BYTES
}

/** Delete every *.gguf in MODEL_DIR that is not the current MODEL_FILENAME.
 *  Fire-and-forget, idempotent. Covers the old Q4_K_M Gemma 3 (~750 MB) and
 *  the Gemma 4 E2B (~3.4 GB) that was briefly shipped and wasted 3 GB on phones. */
async function cleanupStaleModels(): Promise<void> {
  try {
    const files = await FileSystem.readDirectoryAsync(MODEL_DIR)
    for (const name of files) {
      if (name.endsWith('.gguf') && name !== MODEL_FILENAME) {
        const stalePath = `${MODEL_DIR}${name}`
        FileSystem.deleteAsync(stalePath, { idempotent: true }).catch(err =>
          console.warn('[llm] stale-model cleanup failed:', stalePath, err)
        )
      }
    }
  } catch {
    // Directory may not exist yet — not an error
  }
}

export async function modelExists(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH)
  // Generalized cleanup: delete every non-current *.gguf in the models dir.
  // Covers the old Q4_K_M AND the 3.4 GB Gemma 4 E2B — fire-and-forget.
  void cleanupStaleModels()
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
  // Worst-case token budget with PROMPTS V2 (rough BPE estimate, 1 tok ≈ 4 chars):
  //   System prompt v2 (MATH, the largest: CORE_RULES+addenda): ~554 tokens
  //   RAG blocks (ragPipeline hard cap):                        ≤700 tokens
  //   10-message chat history (avg 40 tok/msg × 10):            ~400 tokens
  //   User question (max practical):                             ~80 tokens
  //   Model response budget (math path nPredict):               ~300 tokens
  //   Gemma turn tokens + overhead:                              ~30 tokens
  //   ABSOLUTE WORST CASE:                                    ~2,064 tokens
  // That adversarial maximum brushes n_ctx 2048 (llama.cpp truncates output at
  // the boundary — degrades gracefully, no crash). The REALISTIC case is
  // ~1,100–1,300 tokens (math questions rarely match listings/courses blocks,
  // history is usually short). Raising n_ctx costs KV RAM on 2 GB-gate devices,
  // so 2048 stays. If prompts/budgets grow again, recompute this table first.
  //
  // ── Speculative / MTP ─────────────────────────────────────────────────────
  // Gemma 3 has no MTP heads — speculative decoding is not applicable.
  // Gemma 4 MTP is also unusable via llama.cpp: drafter conversion is
  // unsupported (gh#23727) and its 3.2 GB E2B exceeded Android app-process
  // memory on 4 GB phones — that combination broke chat in 1.6.0.
  // Revisit when llama.rn ships usable MTP + smaller Gemma 4 GGUFs.
  const initParams = {
    model: MODEL_PATH.replace(/^file:\/\//, ''),
    // Raised 2048 → 3072 so complete, conversational answers (nPredict up to ~448
    // for math, 320 general) have headroom above the prompt+RAG+history input.
    // Worst-case input ~1,830 tok + 448 output = ~2,278 < 3072; typical ~1,620.
    // KV cache at f16 for a 1B model is small, so the extra 1024 ctx is cheap even
    // on the 1.8 GB-gate devices.
    n_ctx: 3072,
    // n_threads 6: typical big.LITTLE phones have ≥8 cores; llama.cpp
    // schedules work onto perf cores — 6 threads saturates them without
    // spilling onto efficiency cores and causing cache thrash.
    n_threads: 6,
    // Batch size for prompt processing (token parallelism). 512 is the
    // sweet-spot for single-sequence mobile inference.
    n_batch: 512,
    // KV cache precision: f16 halves the KV memory vs f32 with negligible
    // quality loss at Q8 quantisation levels. Marked "Experimental" in
    // llama.cpp but widely used in production mobile builds.
    cache_type_k: 'f16' as const,
    cache_type_v: 'f16' as const,
    // Flash attention: improves throughput on long contexts; the 'auto' string
    // is accepted by the typings. The JSDoc says "only recommended in GPU
    // device" but on CPU it degrades gracefully (the kernel falls back to
    // standard attention if unsupported at runtime).
    flash_attn_type: 'auto' as const,
  }
  ctxRef = await initLlama(initParams)
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

// ── Coach inference (currently unwired — reserved for a future self-hosted AI feature) ──

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
  /** Max tokens to generate. Defaults to 320 so conversational answers finish
   *  instead of getting cut off mid-sentence (the old 96 ≈ 2 sentences was the
   *  main cause of truncated replies). Math queries pass ~448 for long
   *  multi-step solutions. n_ctx (3072) has headroom for both. */
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
  // Non-math default: 96 tokens fits 2 clear sentences for Gemma 3 1B Q8_0
  // (1B is fast; less truncation than the previous 48-token cap).
  // Stop tokens already include '<end_of_turn>' so Gemma's turn-end EOS fires
  // before the hard limit in most cases.
  const nPredict = options.nPredict ?? 96
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
