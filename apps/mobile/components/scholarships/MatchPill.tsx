import { Badge } from '../ui/Badge'
import type { MatchStatus } from '../../utils/scholarshipMatch'

interface MatchPillProps {
  status: MatchStatus
}

const PILL = {
  eligible:   { label: 'Eligible',     tone: 'success' },
  maybe:      { label: 'Maybe',        tone: 'warning' },
  ineligible: { label: 'Not eligible', tone: 'danger' },
} as const

/**
 * Scholarship eligibility as a Badge. Badge puts each status's `*Strong` text
 * token on its own `*Surface` tint; the old pill used the DEFAULT status colour
 * on that tint, which falls under 4.5:1 in the light theme (DESIGN.md "strong"
 * role). The word carries the status, so no check glyph is needed.
 */
export function MatchPill({ status }: MatchPillProps) {
  if (status === 'unknown') return null
  const p = PILL[status]
  return <Badge label={p.label} tone={p.tone} />
}
