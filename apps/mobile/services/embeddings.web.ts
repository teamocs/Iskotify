/**
 * Web stub for services/embeddings.ts
 *
 * llama.rn cannot run on web (native binaries). This platform file is picked up
 * by Metro/Expo for web targets so the native llama.rn import never reaches the
 * web bundle. Every function is a no-op / returns null — embeddings are a
 * native-only Phase 2 feature and nothing consumes them on web.
 */

export const EMBED_MODEL_FILENAME = 'bge-small-en-v1.5-q8_0.gguf'
export const EMBED_MODEL_PATH = ''
export const EMBED_MODEL_DOWNLOAD_URL = ''
export const EMBED_MODEL_SIZE_BYTES = 0
export const EMBED_MODEL_SIZE_LABEL = '~34 MB'
export const EMBED_MODEL_DIM = 384

export async function resolveEmbedDownloadUrl(): Promise<string> { return '' }
export async function embedModelExists(): Promise<boolean> { return false }
export async function ensureEmbedModelDownloaded(
  _onProgress?: (fraction: number) => void,
): Promise<void> { /* no-op on web */ }
export async function embedText(_text: string): Promise<Float32Array | null> { return null }
export async function releaseEmbedContext(): Promise<void> { /* no-op */ }
