import { useMemo } from 'react'
import { StyleSheet, View, Text, Switch } from 'react-native'
import { useTheme } from '../theme/ThemeContext'
import { weight } from '../theme/tokens'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Locked1Outlined } from '@lineiconshq/free-icons'
import { decorative } from './ui/a11y'

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
    body: { flex: 1 },
    label: {
      ...weight('700'),
      fontSize: typo.md,
      color: t.textPrimary,
      marginBottom: 2,
    },
    desc: {
      ...weight('400'),
      fontSize: typo.xs,
      color: t.textTertiary,
      lineHeight: 15,
    },
  }), [t, typo])

  return (
    <View style={s.row}>
      <View style={s.iconBox} {...decorative}>
        <Lineicons icon={Locked1Outlined} size={18} color={t.accentText} />
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
        aria-checked={enabled}
        accessibilityLabel="Focus Mode toggle"
      />
    </View>
  )
}
