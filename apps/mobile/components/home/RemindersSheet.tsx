import { View, Text, Switch, Platform } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Book1Outlined, TargetUserOutlined, CalendarDaysOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Sheet } from '../ui/Sheet'
import { decorative } from '../ui/a11y'

const REMINDERS = [
  { icon: Book1Outlined, title: 'Daily practice reminder', detail: 'Every day at 9:00 AM, naming your next step' },
  { icon: TargetUserOutlined, title: 'Weekly weak-areas nudge', detail: 'Sundays at 10:00 AM' },
  { icon: CalendarDaysOutlined, title: 'Exam countdown alerts', detail: '7 days, 3 days and 1 day before an exam in Focus' },
] as const

interface Props {
  visible: boolean
  enabled: boolean
  onToggle: () => void
  onClose: () => void
}

/** Local study reminders (no push server): one switch, and what it sends. */
export function RemindersSheet({ visible, enabled, onToggle, onClose }: Props) {
  const { theme: t } = useTheme()
  return (
    <Sheet visible={visible} title="Study reminders" onClose={onClose}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56,
          paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: t.divider,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>Send study reminders</Text>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
            {enabled ? 'On. They stay on this device.' : 'Off. Turn on to get the reminders below.'}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          accessibilityLabel="Send study reminders"
          trackColor={{ false: t.divider, true: t.accentBorder }}
          thumbColor={enabled ? t.accentText : t.surfaceRaised}
          ios_backgroundColor={t.divider}
        />
      </View>

      <Text accessibilityRole="header" style={[textStyle('label', t.textSecondary), { marginTop: spacing.lg, marginBottom: spacing.xs }]}>
        What you'll get
      </Text>
      {REMINDERS.map(r => (
        <View
          key={r.title}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}
        >
          <View
            {...decorative}
            style={{
              width: 36, height: 36, borderRadius: radius.pill, backgroundColor: t.surface2,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Lineicons icon={r.icon} size={18} color={enabled ? t.accentText : t.textTertiary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={textStyle('titleSm', enabled ? t.textPrimary : t.textSecondary)} maxFontSizeMultiplier={2}>{r.title}</Text>
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{r.detail}</Text>
          </View>
        </View>
      ))}

      {Platform.OS === 'android' ? (
        <Text style={[textStyle('caption', t.textSecondary), { marginTop: spacing.md }]} maxFontSizeMultiplier={2}>
          Reminders need the installed app build to work on Android.
        </Text>
      ) : null}
    </Sheet>
  )
}
