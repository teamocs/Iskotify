// AI column mapping for spreadsheet imports (Drive question files, listings
// sheets). The model only proposes which existing header feeds which field and
// picks from closed lists; everything it returns is validated here, so an
// invented header, an unknown field or an out-of-list choice never reaches an
// import. Callers land the result as drafts/preview, never straight to live.

import { GoogleGenerativeAI } from '@google/generative-ai'
import { waitForRateAllow } from '../redis/rateLimiter'

export interface MapField { key: string; description: string; required?: boolean }
export interface MapChoice { key: string; description: string; allowed: readonly string[]; required?: boolean }

export interface ColumnMapSpec {
  /** What the rows are, e.g. "multiple-choice exam questions". */
  purpose: string
  fields: MapField[]
  choices?: MapChoice[]
  /** Extra context for the model, e.g. the file name. */
  context?: string
  headers: string[]
  sample: Record<string, string>[]
}

export interface ColumnMap {
  /** field key → the exact source header */
  columns: Record<string, string>
  /** choice key → one of its allowed values */
  choices: Record<string, string>
}

/** Sends a prompt to the model and returns its raw text, or null when unavailable. */
export type AskModel = (prompt: string) => Promise<string | null>

const squash = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function validateColumnMap(raw: unknown, spec: ColumnMapSpec): ColumnMap | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { columns?: unknown; choices?: unknown }
  const inCols = obj.columns && typeof obj.columns === 'object' ? (obj.columns as Record<string, unknown>) : {}
  const inChoices = obj.choices && typeof obj.choices === 'object' ? (obj.choices as Record<string, unknown>) : {}

  const headerBySquash = new Map(spec.headers.map(h => [squash(h), h]))
  const columns: Record<string, string> = {}
  const used = new Set<string>()
  for (const field of spec.fields) {
    const v = inCols[field.key]
    if (typeof v !== 'string' || !v.trim()) continue
    const header = headerBySquash.get(squash(v))
    if (!header) continue
    if (used.has(header)) return null // one header can't be two fields
    used.add(header)
    columns[field.key] = header
  }
  if (spec.fields.some(f => f.required && !columns[f.key])) return null

  const choices: Record<string, string> = {}
  for (const choice of spec.choices ?? []) {
    const v = inChoices[choice.key]
    const hit = typeof v === 'string' ? choice.allowed.find(a => squash(a) === squash(v)) : undefined
    if (hit) choices[choice.key] = hit
    else if (choice.required) return null
  }
  return { columns, choices }
}

function extractJson(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  return first !== -1 && last > first ? trimmed.slice(first, last + 1) : trimmed
}

function buildPrompt(spec: ColumnMapSpec): string {
  const fields = spec.fields.map(f => `- "${f.key}"${f.required ? ' (required)' : ''}: ${f.description}`).join('\n')
  const choices = (spec.choices ?? [])
    .map(c => `- "${c.key}"${c.required ? ' (required)' : ''}: ${c.description}. Pick exactly one of: ${c.allowed.map(a => JSON.stringify(a)).join(', ')}`)
    .join('\n')
  const sample = spec.sample.slice(0, 5).map(r => JSON.stringify(r).slice(0, 800)).join('\n')
  return `You map spreadsheet columns for an import of ${spec.purpose}.
${spec.context ? `\nContext: ${spec.context}\n` : ''}
Spreadsheet headers (use them EXACTLY as written): ${JSON.stringify(spec.headers)}

Sample rows:
${sample || '(none)'}

Target fields — map each to the ONE header that holds it; leave a field out when no header fits. Never invent a header, never map one header to two fields:
${fields}
${choices ? `\nAlso choose:\n${choices}\n` : ''}
Output ONLY JSON: {"columns": {"<field>": "<header>"}, "choices": {"<choice>": "<value>"}}`
}

/** Gemini in JSON mode; null when no API key is configured. */
export const askGemini: AskModel = async (prompt) => {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024, temperature: 0 },
  })
  await waitForRateAllow('gemini:global', { max: 14, windowSec: 60 })
  const res = await model.generateContent(prompt)
  return res.response.text()
}

export async function suggestColumnMap(spec: ColumnMapSpec, ask: AskModel = askGemini): Promise<ColumnMap | null> {
  try {
    const raw = await ask(buildPrompt(spec))
    if (!raw) return null
    return validateColumnMap(JSON.parse(extractJson(raw)), spec)
  } catch (err) {
    console.warn('[mapColumns] AI mapping unavailable:', err instanceof Error ? err.message : err)
    return null
  }
}
