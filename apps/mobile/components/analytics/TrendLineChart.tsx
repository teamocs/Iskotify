import { useState } from 'react'
import { View, Text } from 'react-native'
import Svg, { Polyline, Circle, Line } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import type { TrendPoint } from '../../services/analyticsAggregates'

/**
 * TrendLineChart — the accuracy-over-weeks line chart for the "Progress
 * Trend" section (Task G). A continuous, longer-window (default 8 weeks)
 * time series reads better as a line than as bars — direction and momentum
 * are the point, not any single week's exact height — so this reaches for
 * react-native-svg (already an installed, previously-unused dependency)
 * instead of extending the existing hand-rolled WeeklyChart bars, which stay
 * as-is for the short 7-day "This Week" view where discrete daily values are
 * what matters.
 *
 * Gaps (weeks with zero sessions, accuracy: null) break the line rather than
 * dropping to 0% — a week with no practice isn't a 0% week.
 */

/** Fallback drawing width before the first layout pass. */
const DEFAULT_W = 300
const CHART_H = 110
const PAD_X = 8
const PAD_Y = 12

function fmtWeek(ts: number): string {
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

/** "Weekly accuracy trend, latest 70%, 2 of 8 weeks with practice" — the chart as one phrase. */
export function trendChartLabel(points: TrendPoint[]): string {
  const known = points.filter(p => p.accuracy !== null)
  const latest = known[known.length - 1]?.accuracy
  return `Weekly accuracy trend, latest ${latest ?? 0}%, ${known.length} of ${points.length} weeks with practice`
}

export function TrendLineChart({ points }: { points: TrendPoint[] }) {
  const { theme: t } = useTheme()
  // Draw at the measured width so the line spans the card instead of being
  // letterboxed inside a fixed 300-wide viewBox on wide screens.
  const [CHART_W, setChartW] = useState(DEFAULT_W)

  const hasData = points.some(p => p.accuracy !== null)
  if (!hasData) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <Text style={[textStyle('bodySm', t.textSecondary), { textAlign: 'center' }]} maxFontSizeMultiplier={2}>
          Complete a few more sessions to see your trend.
        </Text>
      </View>
    )
  }

  const usableW = CHART_W - PAD_X * 2
  const usableH = CHART_H - PAD_Y * 2
  const n = points.length

  const xFor = (i: number) => PAD_X + (n === 1 ? usableW / 2 : (i / (n - 1)) * usableW)
  const yFor = (acc: number) => PAD_Y + usableH - (acc / 100) * usableH

  // Break the polyline at gaps (null-accuracy weeks) instead of interpolating through them.
  const segments: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  points.forEach((p, i) => {
    if (p.accuracy === null) {
      if (current.length > 0) { segments.push(current); current = [] }
      return
    }
    current.push({ x: xFor(i), y: yFor(p.accuracy) })
  })
  if (current.length > 0) segments.push(current)

  const lastKnownIdx = [...points].map((p, i) => ({ p, i })).filter(({ p }) => p.accuracy !== null).pop()?.i
  const lineColor = t.accentText

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={trendChartLabel(points)}
        onLayout={e => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== CHART_W) setChartW(w) }}
      >
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        <Line x1={PAD_X} y1={yFor(100)} x2={CHART_W - PAD_X} y2={yFor(100)} stroke={t.divider} strokeWidth={1} />
        <Line x1={PAD_X} y1={yFor(50)} x2={CHART_W - PAD_X} y2={yFor(50)} stroke={t.divider} strokeWidth={1} strokeDasharray="2,3" />
        {segments.map((seg, si) => (
          <Polyline
            key={si}
            points={seg.map(pt => `${pt.x},${pt.y}`).join(' ')}
            fill="none"
            stroke={lineColor}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {points.map((p, i) => p.accuracy === null ? null : (
          <Circle
            key={i}
            cx={xFor(i)}
            cy={yFor(p.accuracy)}
            r={i === lastKnownIdx ? 4 : 2.5}
            fill={i === lastKnownIdx ? lineColor : t.surface}
            stroke={lineColor}
            strokeWidth={2}
          />
        ))}
      </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {points.map((p, i) => (
          <Text key={i} style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.4}>
            {i === 0 || i === n - 1 ? fmtWeek(p.weekStart) : ''}
          </Text>
        ))}
      </View>
    </View>
  )
}
