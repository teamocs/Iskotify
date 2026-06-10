/**
 * Web stub for services/llm.ts
 *
 * llama.rn cannot run on web (requires native binaries). This platform file
 * is picked up by Metro/Expo bundler for web targets, preventing the native
 * llama.rn import from reaching the web bundle.
 *
 * All functions are no-ops or return null/false — callers must check platform
 * or use the Gemini path on web.
 */

export { parseCoachPhrase } from './coachPrompts'

export const MODEL_PATH = ''
export const MODEL_DOWNLOAD_URL = ''
export const MODEL_SIZE_BYTES = 0
export const MODEL_SIZE_LABEL = '~3.4 GB'
export const IDLE_RELEASE_MS = 300_000

export function hasEnoughRam(): boolean { return false }
export async function modelExists(): Promise<boolean> { return false }
export async function ensureModelDirectory(): Promise<void> { /* no-op */ }
export async function resolveDownloadUrl(): Promise<string> { return '' }
export function warmUpLlama(): void { /* no-op on web */ }
export async function releaseContextIfIdle(): Promise<void> { /* no-op */ }
export async function releaseContextNow(): Promise<void> { /* no-op */ }

export interface LlmOutput {
  wrong_option_1: string
  wrong_option_2: string
  wrong_option_3: string
  explanation: string
}

export function buildPrompt(_params: {
  subjectName: string
  topicName: string
  question: string
  answer: string
}): string { return '' }

export function parseResponse(_text: string): LlmOutput | null { return null }
export async function runInference(_prompt: string): Promise<LlmOutput | null> { return null }
export async function runCoachInference(_prompt: string): Promise<string | null> { return null }
export async function runRawCompletion(_prompt: string, _maxTokens?: number): Promise<string | null> { return null }

export interface StreamChatOptions {
  nPredict?: number
  temperature?: number
}

export async function streamChatInference(
  _prompt: string,
  _onToken: (text: string) => void,
  _signal: AbortSignal,
  _options?: StreamChatOptions,
): Promise<string> { return '' }
