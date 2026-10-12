import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, weight } from '../../theme/tokens'
import { Badge } from '../ui/Badge'
import { Chip } from '../ui/Chip'
import { Text } from '../ui/Text'
import { decorative, heading } from '../ui/a11y'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiImpactRow {
  courseId: string
  courseName: string | null
  cluster: string | null
  boardExam: boolean
  boardExamName: string | null
  automationRiskLow: number | null
  automationRiskHigh: number | null
  aiSafetyScore: number | null
  aiSafetyLabel: string | null
  colorCode: string | null
  whatAiTakesOver: string   // stored as JSON-string TEXT
  whatStaysHuman: string    // stored as JSON-string TEXT
  newJobsEmerging: string   // stored as JSON-string TEXT
  skillsToDevelop: string   // stored as JSON-string TEXT
  careerOutlook2030: string | null
  keyStat: string | null
  keySource: string | null
  keyQuote: string | null
  quoteBy: string | null
  phAdvantage: string | null
  phNotes: string | null
  kuyaBawSummary: string | null
  lastUpdated: string | null
  remoteUpdatedAt: number | null
}

interface Props {
  impact: AiImpactRow
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** A list line with a drawn dot, not a glyph. */
function Item({ children }: { children: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <View {...decorative} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.textSecondary, marginTop: 7 }} />
      <Text role="footnote" color={t.textSecondary} style={{ flex: 1 }}>{children}</Text>
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  const { theme: t } = useTheme()
  return <Text role="footnote" color={t.textSecondary} {...heading(3)} style={weight('600')}>{children}</Text>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * How AI is expected to change a course's careers, from the catalog: the
 * AI-safe score, the automation-risk range, what AI takes over and what stays
 * human, new jobs, skills to build, the 2030 outlook and the cited source.
 * Theme tones only (the catalog's own colour code is not used for text: it
 * is not contrast-checked).
 */
export function AiImpactCard({ impact }: Props) {
  const { theme: t } = useTheme()

  const aiTakesOver = useMemo(() => safeParseArray(impact.whatAiTakesOver), [impact.whatAiTakesOver])
  const staysHuman  = useMemo(() => safeParseArray(impact.whatStaysHuman),  [impact.whatStaysHuman])
  const newJobs     = useMemo(() => safeParseArray(impact.newJobsEmerging), [impact.newJobsEmerging])
  const skills      = useMemo(() => safeParseArray(impact.skillsToDevelop), [impact.skillsToDevelop])

  const hasScore = impact.aiSafetyScore != null
  const hasRisk  = impact.automationRiskLow != null && impact.automationRiskHigh != null

  return (
    <View
      testID="ai-impact-card"
      style={{ backgroundColor: t.surface, borderRadius: radius.card, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text role="headline" {...heading(2)}>AI impact</Text>
        {hasScore ? (
          <Badge
            label={`AI-safe ${impact.aiSafetyScore}/5${impact.aiSafetyLabel ? ` · ${impact.aiSafetyLabel}` : ''}`}
            tone="accent"
          />
        ) : null}
      </View>

      {hasRisk ? (
        <Text role="footnote" color={t.textSecondary}>
          Automation risk {impact.automationRiskLow}–{impact.automationRiskHigh}%
        </Text>
      ) : null}

      {(aiTakesOver.length > 0 || staysHuman.length > 0) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.divider }}>
          {aiTakesOver.length > 0 ? (
            <View style={{ flexBasis: 200, flexGrow: 1, minWidth: 0, gap: spacing.xs }}>
              <SectionTitle>AI takes over</SectionTitle>
              {aiTakesOver.map((item, i) => <Item key={i}>{item}</Item>)}
            </View>
          ) : null}
          {staysHuman.length > 0 ? (
            <View style={{ flexBasis: 200, flexGrow: 1, minWidth: 0, gap: spacing.xs }}>
              <SectionTitle>Stays human</SectionTitle>
              {staysHuman.map((item, i) => <Item key={i}>{item}</Item>)}
            </View>
          ) : null}
        </View>
      ) : null}

      {newJobs.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <SectionTitle>New jobs emerging</SectionTitle>
          {newJobs.map((item, i) => <Item key={i}>{item}</Item>)}
        </View>
      ) : null}

      {skills.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>Skills to build</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {skills.map((skill, i) => <Chip key={i} label={skill} />)}
          </View>
        </View>
      ) : null}

      {impact.careerOutlook2030 ? (
        <View style={{ gap: spacing.xs }}>
          <SectionTitle>2030 outlook</SectionTitle>
          <Text role="subheadline">{impact.careerOutlook2030}</Text>
        </View>
      ) : null}

      {impact.kuyaBawSummary ? (
        <Text role="subheadline" color={t.textSecondary}>{impact.kuyaBawSummary}</Text>
      ) : null}

      {impact.keySource ? (
        <Text role="caption" color={t.textSecondary} style={{ fontStyle: 'italic' }}>Source: {impact.keySource}</Text>
      ) : null}
    </View>
  )
}
