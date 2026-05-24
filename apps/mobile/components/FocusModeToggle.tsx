import { useMemo } from 'react'
import { StyleSheet, View, Text, Switch } from 'react-native'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  enabled: boolean
  onToggle: (v: boolean) => void
}

export function FocusModeToggle({ enabled, onToggle }: Props) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 18,
      padding: 14,
      width: '100%',
      gap: 12,
      marginBottom: 14,
    },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.accentSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconTxt: { fontSize: 18 },
    body: { flex: 1 },
    label: {
      fontFamily: 'Outfit_700Bold',
      fontSize: typo.md,
      color: t.textPrimary,
      marginBottom: 2,
    },
    desc: {
      fontFamily: 'Lexend_400Regular',
      fontSize: typo.xs,
      color: t.textTertiary,
      lineHeight: 15,
    },
  }), [t, typo])

  return (
    <View style={s.row}>
      <View style={s.iconBox}>
        <Text style={s.iconTxt}>🔒</Text>
      </View>
      <View style={s.body}>
        <Text style={s.label}>Focus Mode</Text>
        <Text style={s.desc}>Hides nav bar, blocks screenshots, warns before exit</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        thumbColor={enabled ? t.accentText : t.textTertiary}
        trackColor={{ false: t.surface2, true: t.accentSurface }}
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel="Focus Mode toggle"
      />
    </View>
  )
}
