import { View, Text, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bell1Outlined, Bell1Solid } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { Avatar } from '../ui/Avatar'
import { focusRing, type WebPressableState } from '../ui/a11y'

function phHour(): number {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + 8 * 3_600_000).getHours()
}

function timeGreeting(): string {
  const h = phHour()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Hoisted: building an Intl formatter is slow — do it once per JS load.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

interface Props {
  fullName: string
  streakDays: number
  remindersOn: boolean
  onOpenReminders: () => void
  /** Web-only refresh control (renders nothing on native). */
  refreshControl?: React.ReactNode
}

/**
 * Today's header: the greeting is the screen heading, the date (and streak)
 * sit quietly under it. Only real controls on the right — reminders and the
 * avatar that opens Profile. The logo lives in the sidebar on desktop and in
 * the footer tagline here, so it is not repeated as a fake button tile.
 */
export function TodayHeader({ fullName, streakDays, remindersOn, onOpenReminders, refreshControl }: Props) {
  const { theme: t } = useTheme()
  const firstName = fullName.split(' ')[0] || 'Student'
  const meta = [DATE_FORMAT.format(new Date()), streakDays > 0 ? `${streakDays}-day streak` : null]

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <Text
          accessibilityRole="header"
          style={[textStyle('title', t.textPrimary), { fontFamily: fonts.headingReg }]}
          maxFontSizeMultiplier={1.4}
        >
          {timeGreeting()}, <Text style={{ fontFamily: fonts.heading }}>{firstName}</Text>
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm }}>
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{meta[0]}</Text>
          {meta[1] ? (
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{meta[1]}</Text>
          ) : null}
        </View>
      </View>
      {refreshControl}
      <Pressable
        onPress={onOpenReminders}
        accessibilityRole="button"
        accessibilityLabel="Study reminders"
        accessibilityHint={remindersOn ? 'Reminders are on' : 'Reminders are off'}
        style={(state) => {
          const { pressed, hovered, focused } = state as WebPressableState
          return [
            {
              width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
            },
            focusRing(t.focusRing, focused),
          ]
        }}
      >
        <Lineicons icon={remindersOn ? Bell1Solid : Bell1Outlined} size={22} color={remindersOn ? t.accentText : t.textSecondary} />
      </Pressable>
      <Avatar
        name={fullName}
        size={36}
        onPress={() => router.push('/profile')}
        accessibilityLabel="Profile"
        accessibilityHint="Opens your profile and settings"
      />
    </View>
  )
}
