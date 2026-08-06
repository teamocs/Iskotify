import { GoogleGenerativeAI } from '@google/generative-ai'
import { waitForRateAllow } from '../redis/rateLimiter'

export interface DistractorResult {
  options: string[]      // 4 entries, shuffled, includes the correct answer
  correctIndex: number   // 0–3
  explanation: string    // 1–2 sentence why-this-is-correct
  /** Task E — index-aligned with `options`; null at correctIndex, a short "why this is wrong" sentence elsewhere. */
  optionExplanations: (string | null)[]
  /** Task E — short formula/mnemonic/pacing tip, or '' when Gemini didn't provide one. */
  strategyTip: string
}

interface DistractorInput {
  subject: string
  topic: string
  question: string
  answer: string
}

// Task F — distractor difficulty overhaul. The old prompt asked for "plausible"
// distractors but gave the model no way to tell a lazy category-error filler
// ("Chair" as an organelle) apart from a genuinely competitive one — Gemini
// defaulted to the former. This version adds an explicit tiered rubric plus a
// WEAK-vs-STRONG few-shot contrast so "plausible" has a concrete bar to clear,
// and explicitly forbids the laziest failure modes (all/none-of-the-above,
// joke options, length/format giveaways). JSON contract is UNCHANGED — same
// wrong_N / wrong_N_why / explanation / strategy_tip keys — so every caller
// (generateDistractorsForCard's own parsing below, /api/flashcards/generate,
// enhance-batch, distractors, and the Task F regenerate-distractors route)
// keeps working without changes.
function buildPrompt({ subject, topic, question, answer }: DistractorInput): string {
  return `You are writing multiple-choice distractors for a Philippine college entrance / scholarship exam flashcard. These exams (UPCAT, ACET, DCAT, etc.) are competitive — the wrong options must be genuinely tempting to a well-prepared student, not just "not the answer."

Subject: ${subject}
Topic: ${topic}
Question: ${question}
Correct answer (DO NOT include in your output): ${answer}

DIFFICULTY RUBRIC — every distractor you write must land in TIER 2 or TIER 3. TIER 1 is banned outright.
- TIER 1 (BANNED): category errors, random unrelated words, or anything a student would reject in under a second because it isn't even the right kind of answer (e.g. "Chair" as a cell organelle, "Tuesday" as a chemical formula).
- TIER 2 (acceptable floor): a plausible near-miss — the direct result of ONE realistic calculation slip, a commonly confused term, or a partially-true statement a distracted but reasonably prepared student could believe.
- TIER 3 (aim for at least 2 of the 3 distractors): the EXACT result of a NAMEABLE common misconception or a specific wrong step you can point to (e.g. "divided instead of multiplied", "used radius where diameter was needed", "confused the setting with the theme", "off-by-one in an inclusive range", "applied the formula for perimeter instead of area").

FEW-SHOT — WEAK vs STRONG on the SAME question (study the contrast, then match the STRONG bar):

Example 1 — Math. Question: "Solve for x: 2x + 5 = 17." Correct answer: "6"
  WEAK (reject — no realistic solution path lands here): "100", "-3", "42"
  STRONG (this is the bar): "11" (added 5 instead of subtracting it: 2x = 17+5 = 22 → x = 11), "8.5" (divided before subtracting, an order-of-operations slip: x = 17 ÷ 2 = 8.5), "7" (arithmetic slip: misreads 17-5 as 14 instead of 12, so x = 7)

Example 2 — Biology. Question: "What organelle is the primary site of ATP production in a eukaryotic cell?" Correct answer: "Mitochondria"
  WEAK (reject — not even biology, or nonsensical): "Chloroplast juice", "The cell wall's neighbor", "Photosynthesis"
  STRONG (this is the bar): "Nucleus" (confuses the cell's control center with its energy producer — the single most common mix-up), "Ribosome" (confuses the site of protein synthesis with the site of energy production), "Golgi apparatus" (another membrane-bound organelle students routinely conflate with mitochondria)

Generate exactly 3 incorrect distractors that:
- Land in TIER 2 or TIER 3 of the rubric above, matching the STRONG standard shown, never the WEAK one
- Reflect a common, NAMEABLE student mistake (sign errors, wrong formula application, near-synonyms, confused dates, off-by-one errors, etc.) — you must be able to name the misconception in the "_why" field below
- Match the correct answer's FORMAT and LENGTH closely: if the answer is a number, all distractors are numbers of a similar plausible magnitude; if a phrase or sentence, distractors use the same grammatical form (noun phrase vs. noun phrase, full sentence vs. full sentence) and stay within roughly ±30% of its length. An option that stands out by length or format is itself a giveaway — never produce one.
- Are unambiguously WRONG when checked against the correct answer
- Are different from each other AND different from the correct answer

FORBIDDEN — never output any of these, under any circumstance:
- "All of the above", "None of the above", "Both A and B" (or any other combining/umbrella option)
- Joke options, sarcasm, or anything not seriously intended as a real candidate answer
- An option that is obviously the odd one out by length, tone, or seriousness compared to the others

Also write:
- A 1–2 sentence explanation of why the correct answer is correct (mention the relevant concept or formula). The explanation is for the student to read AFTER they answer.
- For EACH of the 3 distractors, a short (1 sentence) rationale for why a student might pick it and why it's specifically wrong — name the misconception (e.g. "confuses mass with weight", "off-by-one in the range", "applies the formula for area instead of perimeter").
- One short strategy tip (a formula shortcut, mnemonic, or time-saving technique a student could use to solve this TYPE of question faster on exam day). Keep it to one sentence.

Output ONLY valid JSON, no markdown, no preamble:
{
  "wrong_1": "...",
  "wrong_1_why": "...",
  "wrong_2": "...",
  "wrong_2_why": "...",
  "wrong_3": "...",
  "wrong_3_why": "...",
  "explanation": "...",
  "strategy_tip": "..."
}`
}

function extractJson(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced && fenced[1]) return fenced[1].trim()
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

/**
 * Shuffles [correctAnswer, ...distractors] and tracks where the correct
 * answer landed. `distractorExplanations` (Task E — index-aligned with
 * `distractors`, i.e. NOT including a slot for the correct answer) is
 * permuted through the exact same swaps so each "why this is wrong"
 * rationale stays attached to the option text it describes. The returned
 * optionExplanations is aligned with the returned `options` and has `null`
 * at correctIndex.
 */
function shuffleWithCorrect(
  correctAnswer: string,
  distractors: [string, string, string],
  distractorExplanations: [string | null, string | null, string | null],
): { options: string[]; correctIndex: number; optionExplanations: (string | null)[] } {
  const all: string[] = [correctAnswer, ...distractors]
  const explanations: (string | null)[] = [null, ...distractorExplanations]
  let correctIndex = 0
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j]!, all[i]!]
    ;[explanations[i], explanations[j]] = [explanations[j]!, explanations[i]!]
    if (i === correctIndex) correctIndex = j
    else if (j === correctIndex) correctIndex = i
  }
  return { options: all, correctIndex, optionExplanations: explanations }
}

export async function generateDistractorsForCard(input: DistractorInput): Promise<DistractorResult | null> {
  if (!process.env.GEMINI_API_KEY) return null

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 2048,
        temperature: 0.5,
      },
    })

    // Cross-instance rate-limit gate. Replaces the in-process sleep() that used
    // to live in callers — that only worked under a single Vercel function instance.
    await waitForRateAllow('gemini:global', { max: 14, windowSec: 60 })
    const result = await model.generateContent(buildPrompt(input))
    const raw = result.response.text()

    let parsed: {
      wrong_1?: string; wrong_1_why?: string
      wrong_2?: string; wrong_2_why?: string
      wrong_3?: string; wrong_3_why?: string
      explanation?: string
      strategy_tip?: string
    }
    try {
      parsed = JSON.parse(extractJson(raw))
    } catch {
      console.warn('[generateDistractors] malformed JSON. Raw first 300 chars:', raw.slice(0, 300))
      return null
    }

    const w1 = parsed.wrong_1?.trim()
    const w2 = parsed.wrong_2?.trim()
    const w3 = parsed.wrong_3?.trim()
    const explanation = parsed.explanation?.trim() ?? ''
    // wrong_N_why / strategy_tip are new (Task E) — older prompt shapes / test
    // mocks may omit them, so these default rather than fail validation.
    const w1Why = parsed.wrong_1_why?.trim() || ''
    const w2Why = parsed.wrong_2_why?.trim() || ''
    const w3Why = parsed.wrong_3_why?.trim() || ''
    const strategyTip = parsed.strategy_tip?.trim() ?? ''

    if (!w1 || !w2 || !w3) {
      console.warn('[generateDistractors] missing distractors in output')
      return null
    }

    const answerNorm = input.answer.toLowerCase().trim()
    const distractors = [w1, w2, w3]
    if (distractors.some(d => d.toLowerCase().trim() === answerNorm)) {
      console.warn('[generateDistractors] a distractor matched the correct answer')
      return null
    }

    const lowerSet = new Set(distractors.map(d => d.toLowerCase().trim()))
    if (lowerSet.size !== 3) {
      console.warn('[generateDistractors] distractors not unique')
      return null
    }

    const { options, correctIndex, optionExplanations } = shuffleWithCorrect(
      input.answer, [w1, w2, w3], [w1Why || null, w2Why || null, w3Why || null],
    )
    return { options, correctIndex, explanation, optionExplanations, strategyTip }
  } catch (err) {
    console.warn('[generateDistractors] exception:', err instanceof Error ? err.message : err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Task E bulk backfill — EXISTING rows that already have their 4 options and
// correct index (so no new distractors are needed), just missing
// option_explanations/strategy_tip. Used by /api/questions/explanations-backfill.
// A separate, cheaper Gemini call than generateDistractorsForCard (no
// distractor generation, no uniqueness/duplicate checks against a bare answer).
// ---------------------------------------------------------------------------

export interface ExplanationsResult {
  /** Index-aligned with the input `options`; null at correctIndex. */
  optionExplanations: (string | null)[]
  strategyTip: string
}

interface ExplanationsInput {
  subject: string
  topic: string
  question: string
  options: string[]      // exactly 4, in their EXISTING (already-published) order
  correctIndex: number   // 0–3
}

function buildExplanationsPrompt({ subject, topic, question, options, correctIndex }: ExplanationsInput): string {
  const lettered = options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')
  return `You are writing answer-explanation content for an existing Philippine college entrance / scholarship exam multiple-choice question. Do NOT change the question or the options — just explain them.

Subject: ${subject}
Topic: ${topic}
Question: ${question}
Options:
${lettered}
Correct answer: ${'ABCD'[correctIndex]}

For EACH of the 3 WRONG options, write a short (1 sentence) rationale for why a student might pick it and why it's specifically wrong — name the misconception where relevant.
Also write one short strategy tip (a formula shortcut, mnemonic, or time-saving technique for this TYPE of question). Keep it to one sentence.

Output ONLY valid JSON, no markdown, no preamble, keyed by option letter (omit the correct letter's key):
{
  "A": "why A is wrong (omit this key if A is the correct answer)",
  "B": "...",
  "C": "...",
  "D": "...",
  "strategy_tip": "..."
}`
}

export async function generateOptionExplanations(input: ExplanationsInput): Promise<ExplanationsResult | null> {
  if (!process.env.GEMINI_API_KEY) return null
  if (input.options.length !== 4 || input.correctIndex < 0 || input.correctIndex > 3) return null

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024, temperature: 0.4 },
    })

    await waitForRateAllow('gemini:global', { max: 14, windowSec: 60 })
    const result = await model.generateContent(buildExplanationsPrompt(input))
    const raw = result.response.text()

    let parsed: { A?: string; B?: string; C?: string; D?: string; strategy_tip?: string }
    try {
      parsed = JSON.parse(extractJson(raw))
    } catch {
      console.warn('[generateOptionExplanations] malformed JSON. Raw first 300 chars:', raw.slice(0, 300))
      return null
    }

    const byLetter = [parsed.A, parsed.B, parsed.C, parsed.D]
    const optionExplanations = byLetter.map((text, i) =>
      i === input.correctIndex ? null : (text?.trim() || null),
    )
    const strategyTip = parsed.strategy_tip?.trim() ?? ''

    if (optionExplanations.every(e => !e) && !strategyTip) {
      console.warn('[generateOptionExplanations] empty output — nothing to save')
      return null
    }

    return { optionExplanations, strategyTip }
  } catch (err) {
    console.warn('[generateOptionExplanations] exception:', err instanceof Error ? err.message : err)
    return null
  }
}
