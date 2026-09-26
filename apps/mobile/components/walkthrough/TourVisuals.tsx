// RN Image is fine for the tiny bundled app icon.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import { Image, Text, View, type ViewStyle } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  CheckCircle1Outlined, PlusOutlined, Search1Outlined, StopwatchOutlined, Book1Outlined,
  Pencil1Outlined, CalendarDaysOutlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { decorative } from '../ui/a11y'
import { TAB_DESTINATIONS, type TabName } from '../navigation/destinations'
import type { TourCardId } from './tourFlow'

/**
 * Tour illustrations: simplified, silent mocks of each screen drawn with the
 * app's own tokens, type roles and icons (no images beyond the app icon).
 * Values inside are illustrative, never the student's data, and the whole
 * stage is hidden from assistive tech: the card's title and body say it.
 */

const TAB_FOR: Partial<Record<TourCardId, TabName>> = {
  today: 'index', practice: 'practice', explore: 'explore', progress: 'progress',
}

function Panel({ children, style, dim }: { children: React.ReactNode; style?: ViewStyle; dim?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={[{
        backgroundColor: t.surfaceRaised, borderRadius: radius.lg, borderCurve: 'continuous',
        padding: spacing.md, gap: spacing.sm, boxShadow: t.shadowSm, opacity: dim ? 0.45 : 1,
      }, style]}
    >
      {children}
    </View>
  )
}

function Line({ children, role = 'bodySm', tone = 'secondary' }: {
  children: React.ReactNode
  role?: 'bodySm' | 'label' | 'caption' | 'titleSm' | 'numeric' | 'numericLg'
  tone?: 'primary' | 'secondary' | 'accent'
}) {
  const { theme: t } = useTheme()
  const color = tone === 'primary' ? t.textPrimary : tone === 'accent' ? t.accentText : t.textSecondary
  return <Text style={textStyle(role, color)} numberOfLines={1} maxFontSizeMultiplier={1.3}>{children}</Text>
}

function Pill({ label, filled }: { label: string; filled?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
        backgroundColor: filled ? t.accent : t.accentSurface,
      }}
    >
      <Text style={textStyle('label', filled ? t.textInverse : t.accentText)} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  )
}

function Bar({ value }: { value: number }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(value * 100)}%`, height: '100%', borderRadius: radius.pill, backgroundColor: t.accentText }} />
    </View>
  )
}

function IconTile({ icon, active }: { icon: typeof Pencil1Outlined; active?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        width: 36, height: 36, borderRadius: radius.md, borderCurve: 'continuous',
        backgroundColor: active ? t.accentSurface : t.surface2, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Lineicons icon={icon} size={18} color={active ? t.accentText : t.textSecondary} />
    </View>
  )
}

/** The app's tab bar in miniature, the card's tab lit: this is where it lives. */
function MiniTabBar({ active }: { active: TabName }) {
  const { theme: t } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm,
        borderTopWidth: 1, borderTopColor: t.divider, marginHorizontal: -spacing.lg, marginBottom: -spacing.lg,
        backgroundColor: t.tabBar, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl,
      }}
    >
      {TAB_DESTINATIONS.map(d => {
        const on = d.name === active
        return (
          <View key={d.name} style={{ alignItems: 'center', gap: 2, minWidth: 56 }}>
            <View
              style={{
                paddingHorizontal: spacing.md, paddingVertical: 2, borderRadius: radius.pill,
                backgroundColor: on ? t.accentSurface : 'transparent',
              }}
            >
              <Lineicons icon={d.icon} size={18} color={on ? t.accentText : t.textSecondary} />
            </View>
            <Text style={textStyle('caption', on ? t.accentText : t.textSecondary)} maxFontSizeMultiplier={1.2}>{d.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

function WelcomeVisual() {
  return (
    <View style={{ gap: spacing.sm, justifyContent: 'center', flex: 1 }}>
      <Panel dim style={{ marginHorizontal: spacing.xl }}>
        <Line role="label">Flashcards due</Line>
      </Panel>
      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconTile icon={Pencil1Outlined} active />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Line role="label" tone="accent">Next step</Line>
            <Line role="titleSm" tone="primary">10 Math questions</Line>
          </View>
          <Pill label="Start" filled />
        </View>
      </Panel>
      <Panel dim style={{ marginHorizontal: spacing.xl }}>
        <Line role="label">Mock exam</Line>
      </Panel>
    </View>
  )
}

function TodayVisual() {
  return (
    <View style={{ gap: spacing.md, flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <Line role="numericLg" tone="primary">42</Line>
        <View style={{ paddingBottom: spacing.xs }}>
          <Line role="bodySm">days to your exam</Line>
        </View>
      </View>
      <Panel>
        <Line role="label" tone="accent">Next step</Line>
        <Line role="titleSm" tone="primary">Science drill, 15 minutes</Line>
        <Bar value={0.66} />
        <Line role="caption">2 of 3 done today</Line>
      </Panel>
    </View>
  )
}

function PracticeVisual() {
  const { theme: t } = useTheme()
  return (
    <View style={{ gap: spacing.sm, flex: 1, justifyContent: 'center' }}>
      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Line role="titleSm" tone="primary">Mock exam</Line>
            <Line role="caption">Section 2 of 4</Line>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Lineicons icon={StopwatchOutlined} size={16} color={t.textSecondary} />
            <Line role="numeric" tone="primary">38:12</Line>
          </View>
        </View>
        <Bar value={0.4} />
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start',
            paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: t.successSurface,
          }}
        >
          <Lineicons icon={CheckCircle1Outlined} size={14} color={t.successStrong} />
          <Text style={textStyle('caption', t.successStrong)} maxFontSizeMultiplier={1.2}>Answers saved</Text>
        </View>
      </Panel>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {([[Book1Outlined, 'Drills'], [CalendarDaysOutlined, 'Due today']] as const).map(([icon, label]) => (
          <Panel key={label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }}>
            <Lineicons icon={icon} size={16} color={t.accentText} />
            <Line role="label" tone="primary">{label}</Line>
          </Panel>
        ))}
      </View>
    </View>
  )
}

function ExploreVisual() {
  const { theme: t } = useTheme()
  const row = (title: string, meta: string, added?: boolean) => (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Line role="titleSm" tone="primary">{title}</Line>
          <Line role="caption">{meta}</Line>
        </View>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm, paddingVertical: 2,
            borderRadius: radius.pill, backgroundColor: added ? t.accentSurface : 'transparent',
            borderWidth: 1, borderColor: t.accentBorder,
          }}
        >
          <Lineicons icon={added ? CheckCircle1Outlined : PlusOutlined} size={14} color={t.accentText} />
          <Text style={textStyle('caption', t.accentText)} maxFontSizeMultiplier={1.2}>{added ? 'In focus' : 'Focus'}</Text>
        </View>
      </View>
    </Panel>
  )
  return (
    <View style={{ gap: spacing.sm, flex: 1 }}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md,
          minHeight: 40, borderRadius: radius.pill, backgroundColor: t.surfaceRaised, borderWidth: 1, borderColor: t.inputBorder,
        }}
      >
        <Lineicons icon={Search1Outlined} size={16} color={t.textSecondary} />
        <Line role="bodySm">Exams, schools, scholarships</Line>
      </View>
      {row('Scholarship application', 'Deadline in 3 weeks', true)}
      {row('Entrance exam', 'Registration opens soon')}
    </View>
  )
}

function ProgressVisual() {
  const rows: [string, number][] = [['Math', 0.62], ['Science', 0.48], ['Language', 0.71]]
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Panel style={{ gap: spacing.md }}>
        <Line role="titleSm" tone="primary">Readiness by subject</Line>
        {rows.map(([name, v]) => (
          <View key={name} style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Line role="label" tone="primary">{name}</Line>
              <Line role="label">{`${Math.round(v * 100)}%`}</Line>
            </View>
            <Bar value={v} />
          </View>
        ))}
      </Panel>
    </View>
  )
}

function ReadyVisual() {
  const { theme: t } = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
      <Image
        source={require('../../assets/images/icon.png')}
        style={{ width: 88, height: 88, borderRadius: radius.xxl }}
        accessibilityIgnoresInvertColors
      />
      <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={1.3}>Para sa mga Iskolar ng Bayan</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {TAB_DESTINATIONS.map((d, i) => <IconTile key={d.name} icon={d.icon} active={i === 0} />)}
      </View>
    </View>
  )
}

const VISUALS: Record<TourCardId, () => React.ReactElement> = {
  welcome: WelcomeVisual,
  today: TodayVisual,
  practice: PracticeVisual,
  explore: ExploreVisual,
  progress: ProgressVisual,
  ready: ReadyVisual,
}

/** The stage above (phones) or beside (desktop) the card's words. */
export function TourVisual({ id, compact }: { id: TourCardId; compact: boolean }) {
  const { theme: t } = useTheme()
  const Visual = VISUALS[id]
  const tab = TAB_FOR[id]
  return (
    <View
      {...decorative}
      style={{
        backgroundColor: t.accentSurface, borderRadius: radius.xl, borderCurve: 'continuous',
        padding: spacing.lg, overflow: 'hidden',
        height: compact ? 288 : undefined, flex: compact ? undefined : 1, minHeight: compact ? undefined : 380,
      }}
    >
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Visual />
      </View>
      {tab ? <View style={{ marginTop: spacing.md }}><MiniTabBar active={tab} /></View> : null}
    </View>
  )
}
