export type ChatMode = 'progress' | 'topic'

const SYSTEM_PROMPT_PROGRESS =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Answer the student's question using ONLY the ` +
  `context block below. If the answer isn't in the context, say "Wala pa ` +
  `akong info diyan, sorry!" — never make up stats. Keep answers under 3 ` +
  `short sentences. End with one specific action they can take today.`

const SYSTEM_PROMPT_TOPIC =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Explain concepts clearly with one short example.\n\n` +
  `IMPORTANT RULES:\n` +
  `- If the student asks you to SOLVE a math problem, DO NOT solve it. ` +
  `Instead say "Subukan mo muna! Pero here's the concept:" then explain ` +
  `the relevant formula or approach.\n` +
  `- If you don't know the answer, say "Hindi ko sure 'to, baka mas okay ` +
  `i-check sa textbook." Never make up facts.\n` +
  `- Keep answers under 4 sentences. One concrete example if helpful.`

const MATH_SOLVE_PATTERNS = [
  /\bsolve\b/i,
  /\bsimplify\b/i,
  /\bevaluate\b/i,
  /\bcompute\b/i,
  /\bcalculate\b/i,
  /\bfind\s+x\b/i,
  /=\s*\?/,
]

export function detectMathSolveRequest(text: string): boolean {
  return MATH_SOLVE_PATTERNS.some(p => p.test(text))
}

export function buildChatPrompt(
  mode: ChatMode,
  question: string,
  dataContext?: string,
): string {
  let systemPrompt: string
  let userMessage: string

  if (mode === 'progress') {
    systemPrompt = SYSTEM_PROMPT_PROGRESS
    const ctx = dataContext && dataContext.length > 0
      ? dataContext
      : '(no stats available yet)'
    userMessage = `[STUDENT CONTEXT]\n${ctx}\n\n[QUESTION]\n${question}`
  } else {
    systemPrompt = SYSTEM_PROMPT_TOPIC
    const prefix = detectMathSolveRequest(question)
      ? '(Note: refuse to solve, only explain.) '
      : ''
    userMessage = `[QUESTION]\n${prefix}${question}`
  }

  return (
    `<|im_start|>system\n${systemPrompt}<|im_end|>\n` +
    `<|im_start|>user\n${userMessage}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  )
}

/** Strips ChatML token markers from streaming text chunks. */
export function parseChatChunk(text: string): string {
  return text.replace(/<\|[^|]*\|>/g, '')
}
