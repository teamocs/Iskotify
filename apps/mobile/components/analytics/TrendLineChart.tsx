import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Polyline, Circle, Line } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeContext'
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

const CHART_W = 300
const CHART_H = 110
const PAD_X = 8
const PAD_Y = 12

function fmtWeek(ts: number): string {
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export function TrendLineChart({ points }: { points: TrendPoint[] }) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    wrap: { gap: 6 },
    labelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    labelTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    emptyWrap: { alignItems: 'center', paddingVertical: 20 },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  const hasData = points.some(p => p.accuracy !== null)
  if (!hasData) {
    return (
      <View style={s.emptyWrap}>
        <Text style={s.emptyTxt}>Complete a few more sessions to see your trend.</Text>
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
    <View style={s.wrap}>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        <Line x1={PAD_X} y1={yFor(100)} x2={CHART_W - PAD_X} y2={yFor(100)} stroke={t.surfaceSubtle} strokeWidth={1} />
        <Line x1={PAD_X} y1={yFor(50)} x2={CHART_W - PAD_X} y2={yFor(50)} stroke={t.surfaceSubtle} strokeWidth={1} strokeDasharray="2,3" />
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
      <View style={s.labelsRow}>
        {points.map((p, i) => (
          <Text key={i} style={s.labelTxt} maxFontSizeMultiplier={1.4}>
            {i === 0 || i === n - 1 ? fmtWeek(p.weekStart) : ''}
          </Text>
        ))}
      </View>
    </View>
  )
}
