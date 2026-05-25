import type { HomeStats } from '../hooks/useHomeStats'

export const COACH_CATEGORIES = [
  'motivation',
  'weak_area',
  'exam_countdown',
  'streak',
  'requirements',
  'daily_reminder',
] as const

export type CoachCategory = typeof COACH_CATEGORIES[number]

export interface CoachContext extends HomeStats {
  acquiredCount: number
  totalRequirements: number
  remainingRequirements: string[]
  practicedToday: boolean
}

const SYSTEM_PROMPT =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Use one or two short sentences. Optionally end ` +
  `with one emoji. Output ONLY the phrase. No quotes, no markdown, no JSON, ` +
  `no explanation, no labels.`

function listingTitle(ctx: CoachContext): string {
  return ctx.listing?.title ?? 'your exam'
}

function buildUserPrompt(cat: CoachCategory, ctx: CoachContext): string | null {
  switch (cat) {
    case 'motivation':
      return `Goal: ${listingTitle(ctx)} in ${ctx.daysLeft ?? '?'} days. Streak: ${ctx.streakDays}. Write a short motivational nudge to start today.`

    case 'weak_area': {
      const w = ctx.weakTopics[0]
      if (!w) return null
      return `Goal: ${listingTitle(ctx)}. Weakest topic: ${w.topicName} at ${w.accuracy}%. Write a short, kind suggestion to focus there today.`
    }

    case 'exam_countdown': {
      if (ctx.daysLeft == null) return null
      const tone = ctx.daysLeft > 30 ? 'relaxed' : ctx.daysLeft >= 7 ? 'focused' : 'intense'
      return `Exam: ${listingTitle(ctx)} in ${ctx.daysLeft} days. Match tone: ${tone}.`
    }

    case 'streak':
      if (ctx.streakDays < 1) return null
      return `Streak: ${ctx.streakDays} days. Today's accuracy: ${ctx.todayAccuracy ?? 'n/a'}%. Praise their consistency.`

    case 'requirements': {
      if (ctx.totalRequirements === 0) return null
      const remaining = ctx.remainingRequirements.slice(0, 2).join(', ') || 'none'
      return `For ${listingTitle(ctx)}: acquired ${ctx.acquiredCount}/${ctx.totalRequirements}. Remaining: ${remaining}. Write a short reminder. If all done, congratulate.`
    }

    case 'daily_reminder':
      if (ctx.practicedToday) return null
      return `Goal: ${listingTitle(ctx)} (${ctx.daysLeft ?? '?'} days left). They haven't practiced yet today. Write a friendly nudge to review a few cards.`
  }
}

export function buildCoachPrompt(category: CoachCategory, ctx: CoachContext): string | null {
  const userPrompt = buildUserPrompt(category, ctx)
  if (userPrompt === null) return null
  return (
    `<start_of_turn>user\n${SYSTEM_PROMPT}\n\n${userPrompt}<end_of_turn>\n` +
    `<start_of_turn>model\n`
  )
}

export function parseCoachPhrase(text: string): string | null {
  let s = text.trim()
  if (!s) return null
  // Strip surrounding quotes, asterisks, backticks (any combination at start/end)
  s = s.replace(/^["'`*]+/, '').replace(/["'`*]+$/, '').trim()
  if (!s) return null
  if (s.length < 10) return null
  if (s.length > 280) return null
  if (s.includes('{') || s.includes('}')) return null
  if (s.includes('<start_of_turn>') || s.includes('<end_of_turn>')) return null
  // Collapse internal whitespace runs
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return null
  return s
}

export function computeContextHash(ctx: CoachContext): string {
  const key =
    `${ctx.listing?.title ?? '-'}|` +
    `${ctx.daysLeft ?? '-'}|` +
    `${ctx.weakTopics[0]?.topicId ?? '-'}|` +
    `${ctx.streakDays}|` +
    `${ctx.todayAccuracy ?? '-'}|` +
    `${ctx.acquiredCount}|` +
    `${ctx.totalRequirements}|` +
    `${ctx.practicedToday ? '1' : '0'}`
  // djb2 hash — fast, deterministic, no external deps
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}
