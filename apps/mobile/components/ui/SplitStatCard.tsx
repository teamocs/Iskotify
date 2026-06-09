import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

export interface StatColumn {
  icon?: React.ReactNode
  value: string
  label: string
  valueColor?: string
}

/**
 * One rounded container split into equal columns by a faint vertical divider; each
 * column centers an icon box, a large statistic, and a small label (design system §3).
 * Supports 2+ columns.
 */
export function SplitStatCard({ columns }: { columns: StatColumn[] }) {
  const { theme: t, typo } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radius.xl,
        borderCurve: 'continuous',
        boxShadow: t.shadowSm,
        paddingVertical: spacing.lg,
      }}
    >
      {columns.map((col, i) => (
        <View key={col.label} style={{ flex: 1, alignItems: 'center', gap: spacing.xs, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: t.divider }}>
          {col.icon ? (
            <View style={{ width: 32, height: 32, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: t.accentSurface, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
              {col.icon}
            </View>
          ) : null}
          <Text style={{ fontSize: typo.h3, fontWeight: '700', color: col.valueColor ?? t.textPrimary, fontFamily: 'Outfit_700Bold', fontVariant: ['tabular-nums'] }}>
            {col.value}
          </Text>
          <Text style={{ fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {col.label}
          </Text>
        </View>
      ))}
    </View>
  )
}
