import { Platform, View } from 'react-native'
import { Book1Outlined, TargetUserOutlined, CalendarDaysOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { Sheet } from '../ui/Sheet'
import { InsetGroup, InsetRow } from '../ui/InsetGroup'
import { Text } from '../ui/Text'

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

/**
 * Local study reminders (no push server), on the P3 Sheet: one switch row
 * (the whole row toggles), then an inset group of what it sends.
 */
export function RemindersSheet({ visible, enabled, onToggle, onClose }: Props) {
  const { theme: t } = useTheme()
  return (
    <Sheet visible={visible} title="Study reminders" onClose={onClose}>
      <View style={{ gap: spacing.xl, paddingTop: spacing.sm }}>
        <InsetGroup inset={false}>
          <InsetRow
            title="Send study reminders"
            subtitle={enabled ? 'On. They stay on this device.' : 'Off. Turn on to get the reminders below.'}
            switchValue={enabled}
            onSwitchChange={() => onToggle()}
          />
        </InsetGroup>

        <InsetGroup inset={false} header="What you'll get">
          {REMINDERS.map(r => (
            <InsetRow
              key={r.title}
              title={r.title}
              subtitle={r.detail}
              icon={r.icon}
              iconTone={enabled ? 'accent' : 'neutral'}
            />
          ))}
        </InsetGroup>

        {Platform.OS === 'android' ? (
          <Text role="footnote" color={t.textSecondary}>
            Reminders need the installed app build to work on Android.
          </Text>
        ) : null}
      </View>
    </Sheet>
  )
}
