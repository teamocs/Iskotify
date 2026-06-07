import { useMemo } from 'react'
import { StyleSheet, View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

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

/** Returns true when value looks like a 3- or 6-digit CSS hex colour (#RGB / #RRGGBB). */
function isValidHex(value: string | null | undefined): value is string {
  if (!value) return false
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value.trim())
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiImpactCard({ impact }: Props) {
  const { theme: t, typo } = useTheme()

  const aiTakesOver   = useMemo(() => safeParseArray(impact.whatAiTakesOver),  [impact.whatAiTakesOver])
  const staysHuman    = useMemo(() => safeParseArray(impact.whatStaysHuman),   [impact.whatStaysHuman])
  const newJobs       = useMemo(() => safeParseArray(impact.newJobsEmerging),  [impact.newJobsEmerging])
  const skillsRaw     = useMemo(() => safeParseArray(impact.skillsToDevelop),  [impact.skillsToDevelop])

  const accentColor = isValidHex(impact.colorCode) ? impact.colorCode : t.accent

  const s = useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: t.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: t.border,
      padding: 16,
      marginBottom: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    headerLabel: {
      fontSize: typo.sm,
      fontWeight: '700',
      color: t.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      fontFamily: 'Lexend_600SemiBold',
    },
    scorePill: {
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: accentColor + '22',
      borderWidth: 1,
      borderColor: accentColor + '55',
    },
    scoreTxt: {
      fontSize: typo.xs,
      fontWeight: '700',
      fontFamily: 'Lexend_600SemiBold',
      color: accentColor,
    },
    riskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    riskDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: accentColor,
    },
    riskTxt: {
      fontSize: typo.xs,
      color: t.textTertiary,
      fontFamily: 'Lexend_400Regular',
    },
    divider: {
      height: 1,
      backgroundColor: t.divider,
      marginVertical: 10,
    },
    twoColRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 10,
    },
    col: {
      flex: 1,
    },
    colHeader: {
      fontSize: typo.xs,
      fontWeight: '700',
      fontFamily: 'Lexend_600SemiBold',
      color: t.textSecondary,
      marginBottom: 6,
    },
    listItem: {
      fontSize: typo.xs,
      color: t.textSecondary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: 16,
      marginBottom: 3,
    },
    sectionTitle: {
      fontSize: typo.xs,
      fontWeight: '700',
      color: t.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      fontFamily: 'Lexend_600SemiBold',
      marginBottom: 8,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 12,
    },
    chip: {
      borderRadius: 8,
      paddingHorizontal: 9,
      paddingVertical: 4,
      backgroundColor: accentColor + '15',
      borderWidth: 1,
      borderColor: accentColor + '40',
    },
    chipTxt: {
      fontSize: typo.xs,
      color: accentColor,
      fontFamily: 'Lexend_400Regular',
    },
    outlookTxt: {
      fontSize: typo.sm,
      color: t.textPrimary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: 19,
      marginBottom: 12,
    },
    summaryTxt: {
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: 19,
      marginBottom: 10,
    },
    citationTxt: {
      fontSize: typo.xs,
      color: t.textTertiary,
      fontFamily: 'Lexend_400Regular',
      fontStyle: 'italic',
    },
  }), [t, typo, accentColor])

  const hasScore = impact.aiSafetyScore != null
  const hasRisk  = impact.automationRiskLow != null && impact.automationRiskHigh != null

  return (
    <View style={s.card}>

      {/* Header row: "AI Impact" + score pill */}
      <View style={s.headerRow}>
        <Text style={s.headerLabel}>AI Impact</Text>
        {hasScore ? (
          <View style={s.scorePill}>
            <Text style={s.scoreTxt}>
              {impact.aiSafetyScore}/5
              {impact.aiSafetyLabel ? ` · ${impact.aiSafetyLabel}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Automation risk range */}
      {hasRisk ? (
        <View style={s.riskRow}>
          <View style={s.riskDot} />
          <Text style={s.riskTxt}>
            Automation risk {impact.automationRiskLow}–{impact.automationRiskHigh}%
          </Text>
        </View>
      ) : null}

      <View style={s.divider} />

      {/* Two-column: AI takes over | Stays human */}
      {(aiTakesOver.length > 0 || staysHuman.length > 0) ? (
        <View style={s.twoColRow}>
          {aiTakesOver.length > 0 ? (
            <View style={s.col}>
              <Text style={s.colHeader}>🤖 AI takes over</Text>
              {aiTakesOver.map((item, i) => (
                <Text key={i} style={s.listItem}>• {item}</Text>
              ))}
            </View>
          ) : null}
          {staysHuman.length > 0 ? (
            <View style={s.col}>
              <Text style={s.colHeader}>🧠 Stays human</Text>
              {staysHuman.map((item, i) => (
                <Text key={i} style={s.listItem}>• {item}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* New jobs emerging */}
      {newJobs.length > 0 ? (
        <>
          <Text style={s.sectionTitle}>🚀 New jobs emerging</Text>
          {newJobs.map((item, i) => (
            <Text key={i} style={s.listItem}>• {item}</Text>
          ))}
        </>
      ) : null}

      {/* Skills to build */}
      {skillsRaw.length > 0 ? (
        <>
          <Text style={s.sectionTitle}>Skills to build</Text>
          <View style={s.chipRow}>
            {skillsRaw.map((skill, i) => (
              <View key={i} style={s.chip}>
                <Text style={s.chipTxt}>{skill}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* 2030 outlook */}
      {impact.careerOutlook2030 ? (
        <>
          <Text style={s.sectionTitle}>2030 Outlook</Text>
          <Text style={s.outlookTxt}>{impact.careerOutlook2030}</Text>
        </>
      ) : null}

      {/* Kuya Baw summary */}
      {impact.kuyaBawSummary ? (
        <Text style={s.summaryTxt}>{impact.kuyaBawSummary}</Text>
      ) : null}

      {/* Citation */}
      {impact.keySource ? (
        <Text style={s.citationTxt}>Source: {impact.keySource}</Text>
      ) : null}

    </View>
  )
}
