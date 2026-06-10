export type ChatMode = 'progress' | 'topic'

// Appended to all three prompts — keeps Kuya Baw on-scope and prevents
// hallucinating exam dates/deadlines not supplied in the context blocks.
// The math prompt's no-refusal rule for MATH takes precedence because the
// scope block only redirects "ANYTHING else" (non-academic, non-app topics).
const SCOPE_BLOCK =
  `SCOPE: You help ONLY with (a) academics — math, science, English, study skills; ` +
  `(b) this app's data — exams, scholarships, courses, the student's progress. ` +
  `For ANYTHING else (gossip, politics, relationships, money advice, current events), ` +
  `reply with exactly one friendly sentence redirecting to studying, e.g. ` +
  `'Usapang aral muna tayo — ask me about your review or your target exams! 📚'. ` +
  `NEVER invent exam dates, deadlines, cutoffs, or listings not shown in the context blocks; ` +
  `if not in context, say you don't have that info and point to the Exams tab.`

const SYSTEM_PROMPT_PROGRESS =
  `You are Kuya Baw, a warm, encouraging Filipino study kuya for UPCAT and college-prep students.\n` +
  `Be supportive but honest — never guarantee exam results, admission, or specific cutoff/UPG scores.\n` +
  `When unsure or asked about official figures, tell the student to verify at upcat.up.edu.ph.\n` +
  `You can give honest career guidance — destination countries, salary/visa/PR realities, AI-impact on careers — ` +
  `but NEVER guarantee jobs, salaries, or PR approval. Always say to verify with DMW/POEA, embassies, and official program sites.\n` +
  `Always respond in clear English, even if the student asks in Tagalog.\n` +
  `Answer using the [STUDENT CONTEXT] and any [RELEVANT FLASHCARDS] below. ` +
  `If the answer isn't in either, say "I don't have that info yet."\n` +
  `Example — student asks "Anong dapat kong i-focus today?" → ` +
  `you answer in English: "Focus on Algebra today — it's your weakest at 32%."\n` +
  `RULES:\n` +
  `- Maximum 2 sentences. Be direct. No preamble.\n` +
  `- Address the student in second person (you/your).\n` +
  `- End with one specific action when relevant.\n` +
  SCOPE_BLOCK

const SYSTEM_PROMPT_TOPIC =
  `You are Kuya Baw, a warm, encouraging Filipino study kuya for UPCAT and college-prep students.\n` +
  `Be supportive but honest — never guarantee exam results, admission, or specific cutoff/UPG scores.\n` +
  `When unsure or asked about official figures, tell the student to verify at upcat.up.edu.ph.\n` +
  `You can give honest career guidance — destination countries, salary/visa/PR realities, AI-impact on careers — ` +
  `but NEVER guarantee jobs, salaries, or PR approval. Always say to verify with DMW/POEA, embassies, and official program sites.\n` +
  `Always respond in clear English, even if the student asks in Tagalog.\n` +
  `When [RELEVANT FLASHCARDS] are provided, ground your answer in them — ` +
  `they're from the student's own deck and reflect what they're studying.\n` +
  `Example — student asks "Anong photosynthesis?" → ` +
  `you answer in English: "Photosynthesis is how plants make food from sunlight using chlorophyll."\n` +
  `RULES:\n` +
  `- Maximum 2 sentences total. Be direct. No preamble.\n` +
  `- If unsure, say "I'm not sure — check your textbook."\n` +
  `- Address the student in second person (you/your).\n` +
  SCOPE_BLOCK

// Dedicated prompt for math questions: forces step-by-step output, gives a
// worked example so Gemma 1B matches the expected shape, and lifts the
// 2-sentence cap (math doesn't fit in 2 sentences).
// NOTE: SCOPE_BLOCK is appended but the "Never refuse" math rule comes BEFORE
// it, so for actual math questions the no-refusal rule governs. The scope block
// only redirects off-topic non-math, non-academic content.
const SYSTEM_PROMPT_MATH =
  `You are Kuya Baw, a warm, encouraging Filipino study kuya for UPCAT and college-prep students.\n` +
  `Be supportive but honest — never guarantee exam results, admission, or specific cutoff/UPG scores.\n` +
  `When unsure or asked about official figures, tell the student to verify at upcat.up.edu.ph.\n` +
  `You can give honest career guidance — destination countries, salary/visa/PR realities, AI-impact on careers — ` +
  `but NEVER guarantee jobs, salaries, or PR approval. Always say to verify with DMW/POEA, embassies, and official program sites.\n` +
  `Always respond in clear English, even if the student asks in Tagalog.\n` +
  `ALWAYS solve the problem step-by-step. Never refuse, never say "try it yourself".\n` +
  `Double-check arithmetic before writing each step.\n` +
  `If [RELEVANT FLASHCARDS] show a similar worked problem, follow that method.\n` +
  `\n` +
  `FORMAT (one item per line):\n` +
  `Step 1: <what you do> → <result>\n` +
  `Step 2: <what you do> → <result>\n` +
  `Answer: <final value>\n` +
  `\n` +
  `Example:\n` +
  `Question: Solve 2x + 6 = 14\n` +
  `Step 1: Subtract 6 from both sides → 2x = 8\n` +
  `Step 2: Divide both sides by 2 → x = 4\n` +
  `Answer: x = 4\n` +
  `\n` +
  `Notation: x^2 for squared, sqrt(N) for square root, * for multiply, / for divide.\n` +
  `Address the student in second person (you/your).\n` +
  SCOPE_BLOCK

const STRONG_MATH_KEYWORDS =
  /\b(solve|calculate|compute|evaluate|simplify|factor|differentiate|integrate|equation|derivative|integral|fraction|polynomial|quadratic|logarithm|sine|cosine|tangent|sin|cos|tan|log|theorem|hypotenuse)\b/i

const WEAK_INTERROGATIVES = /\b(what is|find|how much|how many)\b/i

const MATH_OPERATORS = /[+\-*/=^√²³]/

/**
 * Heuristic detector for math questions. Used to:
 *   1. Route buildChatPrompt to SYSTEM_PROMPT_MATH instead of topic/progress prompts.
 *   2. Bump n_predict (so multi-step solutions don't truncate) and drop temperature
 *      (so the model doesn't hallucinate digits) in the sampler.
 *
 * False positives are mostly harmless (math prompt still answers fine for general questions
 * if the model is permissive); false negatives hurt more (long solutions truncate at 60 tokens).
 * Tuned to err on the side of detection when operators or numeric content is present.
 */
// Signals that a question is asking ABOUT the student (their progress, stats,
// what to focus on next) rather than about a knowledge topic. Used to decide
// whether to inject [STUDENT CONTEXT] into the prompt.
//
// Topic is the safer default: it skips student context entirely, so a misclassified
// topic question won't leak weak-topic stats into an unrelated answer.
const PROGRESS_SIGNALS: RegExp[] = [
  // English first-person SUBJECT (excludes "tell me about X" where "me" is object)
  /\b(am i|i am|should i|do i|did i|can i|will i|how('m| am) i|what should i)\b/i,
  // English possessive "my" paired with study/progress nouns
  /\bmy\s+(progress|streak|exam|score|accuracy|weak|strong|focus|study|deck|cards?|listing|topics?|grade|subject|review|stats)\b/i,
  // Tagalog first-person markers — "ako" (I), "kong/ko" (my), "akin" (mine)
  /\b(ako|kong|akin)\b/i,
  // Tagalog "dapat ko" / "dapat kong" (I should)
  /\bdapat (kong?|ko)\b/i,
  // Generic progress phrases
  /\b(on track|behind|catching up|am i ready|am i prepared)\b/i,
]

/**
 * Decide whether a question is about the student's progress (use SYSTEM_PROMPT_PROGRESS
 * + inject [STUDENT CONTEXT]) or a general knowledge topic (use SYSTEM_PROMPT_TOPIC).
 *
 * Math questions are routed independently by isMathQuestion → SYSTEM_PROMPT_MATH,
 * which takes priority over both modes, so this function's result is moot for math.
 */
export function detectChatMode(question: string): ChatMode {
  if (!question) return 'topic'
  for (const re of PROGRESS_SIGNALS) {
    if (re.test(question)) return 'progress'
  }
  return 'topic'
}

export function isMathQuestion(question: string): boolean {
  if (!question) return false
  // Operators only count as a math signal when there's also a digit present.
  // Otherwise Tagalog compound words ("i-focus", "mag-aral") and contractions
  // trigger false positives via the hyphen / slash.
  if (MATH_OPERATORS.test(question) && /\d/.test(question)) return true
  // Algebraic patterns like "5x", "3y + 2"
  if (/\b\d+\s*[xyz]\b/i.test(question)) return true
  // Multi-digit numbers — a single "1" might just be a list item, but "12" looks math-y
  if (/\d{2,}/.test(question)) return true
  if (STRONG_MATH_KEYWORDS.test(question)) return true
  // "what is 7" / "find 5" — interrogative + any digit
  if (WEAK_INTERROGATIVES.test(question) && /\d/.test(question)) return true
  return false
}

export function buildChatPrompt(
  mode: ChatMode,
  question: string,
  dataContext?: string,
  history?: Array<{ role: 'user' | 'assistant'; text: string }>,
  retrieved?: string,
  listingsCtx?: string,
  courseCtx?: string,
): string {
  const sanitize = (s: string) =>
    s.replace(/<(start|end)_of_turn>\s*(?:user|model)\b[\s\S]*$/gi, '').replace(/<(start|end)_of_turn>/g, '')

  const safeQuestion = sanitize(question)
  const safeRetrieved = retrieved && retrieved.length > 0 ? sanitize(retrieved) : ''
  const isMath = isMathQuestion(question)

  const systemPrompt = isMath
    ? SYSTEM_PROMPT_MATH
    : mode === 'progress' ? SYSTEM_PROMPT_PROGRESS : SYSTEM_PROMPT_TOPIC
  const instruction = `[INSTRUCTION] Respond in clear English only.`

  const sections: string[] = [systemPrompt, instruction]

  // Student context is noise for math problems (the student's weak topics
  // don't affect how to solve x^2 - 9 = 0). Skip it when math is detected.
  if (mode === 'progress' && !isMath) {
    const ctx = dataContext && dataContext.length > 0
      ? dataContext
      : '(no stats available yet)'
    sections.push(`[STUDENT CONTEXT]\n${ctx}`)
  }

  // Listings and course connection context — inserted after [STUDENT CONTEXT],
  // before [RELEVANT FLASHCARDS]. Omitted when undefined (no matching data).
  if (listingsCtx) sections.push(listingsCtx)
  if (courseCtx) sections.push(courseCtx)

  if (safeRetrieved) {
    // safeRetrieved already contains the correct top-level section headers
    // ([RELEVANT FLASHCARDS] and/or [UPCAT FACTS]) emitted by buildRetrievedFlashcards.
    // Inject directly — do not re-wrap in another [RELEVANT FLASHCARDS] header.
    sections.push(safeRetrieved)
  }

  sections.push(`[QUESTION]\n${safeQuestion}`)
  const finalUserContent = sections.join('\n\n')

  let historyTurns = ''
  if (history && history.length > 0) {
    historyTurns = history.map(m =>
      m.role === 'user'
        ? `<start_of_turn>user\n${sanitize(m.text)}<end_of_turn>\n`
        : `<start_of_turn>model\n${sanitize(m.text)}<end_of_turn>\n`
    ).join('')
  }

  return (
    historyTurns +
    `<start_of_turn>user\n${finalUserContent}<end_of_turn>\n` +
    `<start_of_turn>model\n`
  )
}

/** Strips Gemma turn token markers from streaming text chunks. */
export function parseChatChunk(text: string): string {
  return text.replace(/<(start|end)_of_turn>/g, '')
}
