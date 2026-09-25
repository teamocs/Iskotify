import { useState, useEffect } from 'react'
import { View, Text, Pressable, Alert, BackHandler, Switch, Platform } from 'react-native'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  SparkOutlined,
  QuestionMarkCircleOutlined,
  Shield2Outlined,
  ExitOutlined,
  Bug1Outlined,
  Comment1Outlined,
  Download1Outlined,
  ChevronLeftOutlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'
import { useTheme } from '../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../theme/tokens'
import { InfoPage } from '../components/info/InfoPage'
import { ListRow } from '../components/ui/ListRow'
import { Avatar } from '../components/ui/Avatar'
import { decorative, focusRing, heading, type WebPressableState } from '../components/ui/a11y'
import { AiModelDownloadSheet } from '../components/AiModelDownloadSheet'
import { useNotifications } from '../hooks/useNotifications'
import { useHomeStats } from '../hooks/useHomeStats'

function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${h12}:00 ${suffix}`
}

const version = Constants.expoConfig?.version ?? '1.0.0'

type Icon = typeof SparkOutlined

/** A labelled group: level-2 heading, then a bordered list. */
function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.xxl }}>
      <View style={{ gap: 2 }}>
        <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)}>{title}</Text>
        {note ? <Text style={textStyle('bodySm', t.textSecondary)}>{note}</Text> : null}
      </View>
      <View
        style={{
          backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
          borderRadius: radius.xl, borderCurve: 'continuous', overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  )
}

function Divider() {
  const { theme: t } = useTheme()
  return <View style={{ height: 1, backgroundColor: t.divider, marginLeft: spacing.lg }} />
}

function IconTile({ icon, tone = 'neutral' }: { icon: Icon; tone?: 'neutral' | 'accent' | 'danger' }) {
  const { theme: t } = useTheme()
  const bg = tone === 'accent' ? t.accentSurface : tone === 'danger' ? t.dangerSurface : t.surface2
  const fg = tone === 'accent' ? t.accentText : tone === 'danger' ? t.dangerStrong : t.textSecondary
  return (
    <View style={{ width: 36, height: 36, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Lineicons icon={icon} size={18} color={fg} />
    </View>
  )
}

/** A text row with a trailing control (switch, stepper, segmented picker). */
function ControlRow({ label, sub, dimmed, children }: { label: string; sub?: string; dimmed?: boolean; children: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        minHeight: 64, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md,
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg, opacity: dimmed ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, minWidth: 160, gap: 2 }}>
        <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{label}</Text>
        {sub ? <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  )
}

function StepButton({ label, direction, disabled, onPress }: { label: string; direction: 'back' | 'forward'; disabled: boolean; onPress: () => void }) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        return [{
          width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: t.inputBorder,
          backgroundColor: pressed || (hovered && !disabled) ? t.surface2 : t.surface,
        }, focusRing(t.focusRing, focused)]
      }}
    >
      <View {...decorative} style={direction === 'forward' ? { transform: [{ scaleX: -1 }] } : null}>
        <Lineicons icon={ChevronLeftOutlined} size={16} color={t.textPrimary} />
      </View>
    </Pressable>
  )
}

const THEME_OPTIONS: { label: string; value: 'system' | 'light' | 'dark' }[] = [
  { label: 'Auto', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

export default function SettingsScreen() {
  const db = useDb()
  const { theme: t, themePref, setTheme } = useTheme()
  const [profileName, setProfileName] = useState('Student')
  const [profileEmail, setProfileEmail] = useState('')
  const [modelDownloadVisible, setModelDownloadVisible] = useState(false)
  const { focusedListings } = useHomeStats()
  const {
    enabled: notifEnabled, toggle: toggleNotifs,
    dailyReminderHour, weeklySummaryEnabled, setReminderHour, toggleWeeklySummary,
  } = useNotifications()

  useEffect(() => {
    async function load() {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const row = rows[0]
      if (!row) return
      setProfileName(row.fullName || 'Student')
      setProfileEmail(row.email ?? '')
    }
    void load()
  }, [db])

  function handleExitApp() {
    Alert.alert(
      'Exit Iskotify?',
      'Your progress is saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ],
    )
  }

  // react-native-web colours the ON thumb from `activeThumbColor` (its own
  // default is teal); native reads `thumbColor` for both states.
  const switchColors = {
    trackColor: { false: t.inputBorder, true: t.accent },
    thumbColor: t.surfaceRaised,
    ios_backgroundColor: t.inputBorder,
    ...({ activeThumbColor: t.surfaceRaised } as object),
  }

  return (
    <InfoPage title="Settings" fallbackHref="/(tabs)">
      <Group title="Profile">
        <ListRow
          title={profileName}
          subtitle={profileEmail || 'View your profile'}
          leading={<Avatar name={profileName} size={40} />}
          onPress={() => router.push('/profile')}
        />
      </Group>

      <Group title="Appearance">
        <ControlRow label="Theme" sub="Auto follows your phone's setting">
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Theme"
            style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.md, padding: spacing.xs, gap: spacing.xs }}
          >
            {THEME_OPTIONS.map(opt => {
              const on = themePref === opt.value
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => void setTheme(opt.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={opt.label}
                  aria-checked={on}
                  style={(state) => {
                    const { pressed, hovered, focused } = state as WebPressableState
                    return [{
                      minHeight: 44, minWidth: 64, paddingHorizontal: spacing.md,
                      alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm,
                      backgroundColor: on ? t.surface : pressed || hovered ? t.surfaceSubtle : 'transparent',
                      boxShadow: on ? t.shadowSm : undefined,
                    }, focusRing(t.focusRing, focused)]
                  }}
                >
                  <Text style={[textStyle('label', on ? t.textPrimary : t.textSecondary), { fontFamily: on ? fonts.bodySemi : fonts.bodyMedium }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </ControlRow>
      </Group>

      <Group title="Notifications" note="Daily nudges, reminders and your weekly summary">
        <ControlRow label="Push notifications" sub={notifEnabled ? 'On: daily nudge, weekly summary, exam countdowns' : 'Off'}>
          <Switch
            accessibilityLabel="Push notifications"
            value={notifEnabled}
            onValueChange={() => void toggleNotifs(focusedListings)}
            {...switchColors}
          />
        </ControlRow>
        <Divider />
        <ControlRow label="Daily reminder time" sub="When your daily practice nudge arrives" dimmed={!notifEnabled}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <StepButton
              label="Earlier"
              direction="back"
              disabled={!notifEnabled}
              onPress={() => void setReminderHour((dailyReminderHour + 23) % 24, focusedListings)}
            />
            <Text
              accessibilityLiveRegion="polite"
              style={[textStyle('titleSm', t.textPrimary), { minWidth: 76, textAlign: 'center', fontVariant: ['tabular-nums'] }]}
            >
              {formatHour(dailyReminderHour)}
            </Text>
            <StepButton
              label="Later"
              direction="forward"
              disabled={!notifEnabled}
              onPress={() => void setReminderHour((dailyReminderHour + 1) % 24, focusedListings)}
            />
          </View>
        </ControlRow>
        <Divider />
        <ControlRow label="Weekly summary" sub="A Sunday nudge to review your weak areas" dimmed={!notifEnabled}>
          <Switch
            accessibilityLabel="Weekly summary"
            value={weeklySummaryEnabled}
            onValueChange={() => void toggleWeeklySummary(focusedListings)}
            disabled={!notifEnabled}
            {...switchColors}
          />
        </ControlRow>
      </Group>

      <Group title="Offline tools">
        <ListRow
          title="On-device AI model"
          subtitle="Download it for smarter search without internet"
          leading={<IconTile icon={Download1Outlined} />}
          onPress={() => setModelDownloadVisible(true)}
        />
      </Group>

      <Group title="Feedback">
        <ListRow title="Report a bug" leading={<IconTile icon={Bug1Outlined} />} onPress={() => router.push('/settings/report-bug')} />
        <Divider />
        <ListRow title="Leave feedback" leading={<IconTile icon={Comment1Outlined} />} onPress={() => router.push('/settings/leave-feedback')} />
      </Group>

      <Group title="About">
        <ListRow title="About Iskotify" leading={<IconTile icon={SparkOutlined} tone="accent" />} onPress={() => router.push('/about')} />
        <Divider />
        <ListRow title="Help and support" leading={<IconTile icon={QuestionMarkCircleOutlined} />} onPress={() => router.push('/help')} />
        <Divider />
        <ListRow title="Privacy and terms" leading={<IconTile icon={Shield2Outlined} />} onPress={() => router.push('/privacy')} />
      </Group>

      {/* BackHandler.exitApp only works on Android; elsewhere the row would do nothing. */}
      {Platform.OS === 'android' ? (
        <Group title="Session">
          <ListRow title="Exit app" leading={<IconTile icon={ExitOutlined} tone="danger" />} onPress={handleExitApp} showChevron={false} />
        </Group>
      ) : null}

      <Text style={[textStyle('caption', t.textSecondary), { textAlign: 'center' }]}>{`Iskotify v${version}`}</Text>

      <AiModelDownloadSheet
        visible={modelDownloadVisible}
        onClose={() => setModelDownloadVisible(false)}
        onReady={() => setModelDownloadVisible(false)}
      />
    </InfoPage>
  )
}
