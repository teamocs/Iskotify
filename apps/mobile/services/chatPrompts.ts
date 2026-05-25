export type ChatMode = 'progress' | 'topic'

const SYSTEM_PROMPT_PROGRESS =
  `You are Kuya Baw, a friendly review coach for UPCAT/scholarship students.\n` +
  `Always respond in clear English, even if the student asks in Tagalog.\n` +
  `Answer using ONLY the [STUDENT CONTEXT] block below. If the answer isn't ` +
  `in the context, say "I don't have that info yet."\n` +
  `Example — student asks "Anong dapat kong i-focus today?" → ` +
  `you answer in English: "Focus on Algebra today — it's your weakest at 32%."\n` +
  `RULES:\n` +
  `- Maximum 2 sentences. Be direct. No preamble.\n` +
  `- Address the student in second person (you/your).\n` +
  `- End with one specific action when relevant.`

const SYSTEM_PROMPT_TOPIC =
  `You are Kuya Baw, a friendly review coach for UPCAT/scholarship students.\n` +
  `Always respond in clear English, even if the student asks in Tagalog.\n` +
  `Example — student asks "Anong photosynthesis?" → ` +
  `you answer in English: "Photosynthesis is how plants make food from sunlight using chlorophyll."\n` +
  `RULES:\n` +
  `- Maximum 2 sentences total. Be direct. No preamble.\n` +
  `- For complex math (multi-step, calculus, word problems): say "Try it yourself ` +
  `first!" and give the formula/concept; don't solve.\n` +
  `- For simple math (arithmetic, single formula): solve it step-by-step.\n` +
  `- If unsure, say "I'm not sure — check your textbook."\n` +
  `- Address the student in second person (you/your).`

export function buildChatPrompt(
  mode: ChatMode,
  question: string,
  dataContext?: string,
  history?: Array<{ role: 'user' | 'assistant'; text: string }>,
): string {
  const sanitize = (s: string) =>
    s.replace(/<(start|end)_of_turn>\s*(?:user|model)\b[\s\S]*$/gi, '').replace(/<(start|end)_of_turn>/g, '')

  const safeQuestion = sanitize(question)

  const systemPrompt = mode === 'progress' ? SYSTEM_PROMPT_PROGRESS : SYSTEM_PROMPT_TOPIC
  const instruction = `[INSTRUCTION] Respond in clear English only.`

  let finalUserContent: string
  if (mode === 'progress') {
    const ctx = dataContext && dataContext.length > 0
      ? dataContext
      : '(no stats available yet)'
    finalUserContent = `${systemPrompt}\n\n${instruction}\n\n[STUDENT CONTEXT]\n${ctx}\n\n[QUESTION]\n${safeQuestion}`
  } else {
    finalUserContent = `${systemPrompt}\n\n${instruction}\n\n[QUESTION]\n${safeQuestion}`
  }

  // Build history turns — sanitize each message to prevent turn token injection
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
