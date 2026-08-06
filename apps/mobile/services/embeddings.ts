import { initLlama, type LlamaContext } from 'llama.rn'
import * as FileSystem from 'expo-file-system/legacy'

// ── On-device sentence-embedding wrapper (Phase 2, DORMANT) ──────────────────
//
// Mirrors services/llm.ts (model constants + download + lazy init + mutex) but
// initialises a SEPARATE llama.rn context in EMBEDDING mode and exposes a single
// `embedText`. Nothing here is wired into chat/ragPipeline/sync yet — it exists
// so the Phase 2 spike (app/dev-embedding-spike.tsx) can validate the model URL
// and llama.rn embedding mode on a real device before any retrieval code is built.
//
// SPIKE-REQUIRED: verify this URL serves the GGUF unauthenticated (HEAD 200) and
// that llama.rn embedding mode loads it on-device before wiring into retrieval —
// Google's own HF repos are gated, ALWAYS use an ungated mirror. Both the URL
// below and llama.rn's embedding-mode behaviour are UNVERIFIED until the spike
// passes on-device.
//
// Model: BAAI bge-small-en-v1.5 (384-dim), Q8_0 GGUF, ~34 MB, from CompendiumLabs
// (a known ungated community mirror — the same class of repo as bartowski used
// for Gemma in llm.ts). bge-small-en-v1.5 is a strong, tiny English retrieval
// encoder; 384 dims keeps the synced/quantized vectors small.
export const EMBED_MODEL_FILENAME = 'bge-small-en-v1.5-q8_0.gguf'
const EMBED_MODEL_DIR = `${FileSystem.documentDirectory}models/`
export const EMBED_MODEL_PATH = `${EMBED_MODEL_DIR}${EMBED_MODEL_FILENAME}`

export const EMBED_MODEL_DOWNLOAD_URL =
  'https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf'

/** Approximate download size — UNVERIFIED until a real HEAD during the spike. */
export const EMBED_MODEL_SIZE_BYTES = 34_000_000
export const EMBED_MODEL_SIZE_LABEL = '~34 MB'
/** Output embedding dimensionality of bge-small-en-v1.5. */
export const EMBED_MODEL_DIM = 384

/**
 * Resolve the final CDN/S3 URL by following HuggingFace's redirect chain in JS
 * (mirrors resolveDownloadUrl in services/llm.ts). Returns the original URL on
 * any failure so the download still degrades gracefully.
 */
export async function resolveEmbedDownloadUrl(): Promise<string> {
  try {
    const response = await fetch(EMBED_MODEL_DOWNLOAD_URL, { method: 'HEAD', redirect: 'follow' })
    if (response.ok && response.url && response.url !== EMBED_MODEL_DOWNLOAD_URL) {
      return response.url
    }
  } catch (err) {
    console.warn('[embeddings] resolveEmbedDownloadUrl failed, using original URL:', err)
  }
  return EMBED_MODEL_DOWNLOAD_URL
}

export async function embedModelExists(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(EMBED_MODEL_PATH)
    return info.exists
  } catch {
    return false
  }
}

async function ensureEmbedModelDirectory(): Promise<void> {
  await FileSystem.makeDirectoryAsync(EMBED_MODEL_DIR, { intermediates: true })
}

/**
 * Download the embedding GGUF if it is not already present.
 * Small (~34 MB) so a foreground resumable download is fine — no need for the
 * background-downloader machinery the ~1 GB Gemma model uses. `onProgress`
 * receives a 0..1 fraction. Throws on hard download failure (the caller — the
 * spike screen — surfaces the error string); a no-op if the file already exists.
 */
export async function ensureEmbedModelDownloaded(
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (await embedModelExists()) {
    onProgress?.(1)
    return
  }
  await ensureEmbedModelDirectory()
  const url = await resolveEmbedDownloadUrl()
  const destination = EMBED_MODEL_PATH
  const resumable = FileSystem.createDownloadResumable(
    url,
    destination,
    {},
    (p) => {
      if (onProgress && p.totalBytesExpectedToWrite > 0) {
        onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite)
      }
    },
  )
  await resumable.downloadAsync()
  onProgress?.(1)
}

// ── Embedding context (separate from the chat context) + own mutex ────────────

let embedCtxRef: LlamaContext | null = null
let embedChain: Promise<unknown> = Promise.resolve()

function withEmbedMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = embedChain.then(fn, fn)
  embedChain = next.catch(() => undefined)
  return next
}

async function getEmbedContext(): Promise<LlamaContext> {
  if (embedCtxRef) return embedCtxRef
  // Embedding mode: `embedding: true` puts llama.cpp into embed-extraction mode;
  // `pooling_type: 'mean'` pools token embeddings into one sentence vector (the
  // right pooling for bge-small / MiniLM sentence encoders). Small n_ctx/n_batch
  // — embedding inputs are short and this model is tiny. flash-attn/GPU untouched.
  embedCtxRef = await initLlama({
    model: EMBED_MODEL_PATH.replace(/^file:\/\//, ''),
    embedding: true,
    pooling_type: 'mean',
    n_ctx: 512,
    n_batch: 512,
    n_threads: 4,
  })
  return embedCtxRef
}

/**
 * Embed a string into a Float32Array (L2-normalized via embd_normalize: 2).
 * GRACEFUL: returns `null` on ANY failure — model missing, init error, or a
 * native error — so callers degrade instead of crashing. Never throws.
 */
export async function embedText(text: string): Promise<Float32Array | null> {
  return withEmbedMutex(async () => {
    try {
      if (!(await embedModelExists())) return null
      const ctx = await getEmbedContext()
      const result = await ctx.embedding(text, { embd_normalize: 2 })
      const arr = result?.embedding
      if (!arr || arr.length === 0) return null
      return Float32Array.from(arr)
    } catch (err) {
      console.warn('[embeddings] embedText failed (returning null):', err)
      // Drop a possibly-wedged context so the next call can re-init cleanly.
      try { await embedCtxRef?.release() } catch { /* ignore */ }
      embedCtxRef = null
      return null
    }
  })
}

/** Release the embedding context (app teardown / free memory). Serialized. */
export async function releaseEmbedContext(): Promise<void> {
  return withEmbedMutex(async () => {
    if (embedCtxRef) {
      try { await embedCtxRef.release() } catch { /* ignore */ }
      embedCtxRef = null
    }
  })
}
