import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'

export interface ReviewCard {
  id: string
  question: string
  answer: string
  explanation: string | null
  options: string[] | null
  correct_answer_index: number | null
  ai_options: string[] | null
  ai_correct_index: number | null
  ai_explanation: string | null
  ai_enhanced_at: string | null
}

/**
 * Read-only preview of a draft topic's cards, one list with a divider between
 * cards (not a card per card). The correct option is marked with an icon and
 * spoken text, never by colour alone.
 */
export function ReviewCardList({ cards }: { cards: ReviewCard[] }) {
  return (
    <ol className="divide-y divide-subtle">
      {cards.map((c, i) => {
        const hasAi = Array.isArray(c.ai_options) && c.ai_options.length >= 4
        const opts = hasAi ? c.ai_options! : (c.options ?? [])
        const correct = hasAi ? c.ai_correct_index : c.correct_answer_index
        const explanation = hasAi ? c.ai_explanation : c.explanation
        return (
          <li key={c.id} className="space-y-2 px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-ink-muted">Card {i + 1}</h3>
              {hasAi && <Badge tone="info">AI-enhanced</Badge>}
            </div>
            <p className="font-medium leading-snug text-ink">{c.question}</p>
            <p className="text-sm text-ink">
              <span className="text-ink-muted">Answer: </span>
              <span className="font-medium">{c.answer}</span>
            </p>
            {opts.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {opts.map((o, j) => {
                  const isCorrect = j === correct
                  return (
                    <li key={j} className={`flex items-start gap-1 ${isCorrect ? 'font-medium text-success' : 'text-ink-muted'}`}>
                      <span className="inline-block w-5 shrink-0 font-medium">{String.fromCharCode(65 + j)}.</span>
                      <span>
                        {o}
                        {isCorrect && <span className="sr-only">(correct answer)</span>}
                      </span>
                      {isCorrect && <Icon name="check" size={14} className="mt-0.5 shrink-0" />}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Badge tone="warning">No distractors yet — Gemini will fill these in shortly</Badge>
            )}
            {explanation && (
              <p className="border-t border-subtle pt-2 text-xs leading-relaxed text-ink-muted">
                <span className="font-medium">Explanation:</span> {explanation}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
