import { View, Linking, StyleSheet } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ArrowAngularTopRightOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { layout, radius, spacing, weight } from '../../theme/tokens'
import type { FeedItem } from '../../utils/admissionsFeed'
import { isHttpUrl, newsSources } from '../../utils/newsSources'
import { Sheet } from '../ui/Sheet'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { decorative, focusRing, heading } from '../ui/a11y'

interface Props {
  item: FeedItem
  onClose: () => void
}

/** Opens a source link — http(s) only, checked again right before opening. */
function openSource(url: string) {
  if (isHttpUrl(url)) void Linking.openURL(url).catch(() => {})
}

/**
 * One admissions announcement on the P3 Sheet: the school and report date,
 * the body, any action the student has to take, and its sources as links
 * (http(s) only). The sheet's own Close button dismisses it.
 */
export function NewsDetailModal({ item, onClose }: Props) {
  const { theme: t } = useTheme()

  // {label, url} links (admin console) or plain URL strings (older rows).
  const sources = newsSources(item.sources)
  const meta = [item.schoolName, item.reportDate].filter(s => s != null && s.length > 0).join(' · ')

  return (
    <Sheet visible title={item.title} onClose={onClose} closeLabel="Done">
      <View style={{ gap: spacing.lg, paddingBottom: spacing.md }}>
        {meta ? <Text role="footnote" color={t.textSecondary}>{meta}</Text> : null}

        <Text role="body">{item.body}</Text>

        {item.actionRequired != null && item.actionRequired.length > 0 ? (
          <View
            style={{
              gap: spacing.xs, padding: spacing.md,
              borderRadius: radius.field, borderCurve: 'continuous',
              backgroundColor: t.accentSurface,
            }}
          >
            <Text role="footnote" color={t.accentText} style={weight('600')}>Action required</Text>
            <Text role="subheadline">{item.actionRequired}</Text>
          </View>
        ) : null}

        {sources.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text role="footnote" color={t.textSecondary} {...heading(3)} style={weight('600')}>Sources</Text>
            <View style={{ backgroundColor: t.surface2, borderRadius: radius.group, borderCurve: 'continuous', overflow: 'hidden' }}>
              {sources.map((src, i) => (
                <PressableScale
                  key={`${i}-${src.url}`}
                  onPress={() => openSource(src.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`${src.label}, opens in your browser`}
                  style={({ pressed, focused }) => [
                    {
                      minHeight: layout.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
                      backgroundColor: pressed ? t.surface2 : 'transparent',
                      borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: t.divider,
                    },
                    focusRing(t.focusRing, focused),
                  ]}
                >
                  <Text role="body" color={t.accentText} style={[{ flex: 1, textDecorationLine: 'underline' }]}>{src.label}</Text>
                  <View {...decorative}>
                    <Lineicons icon={ArrowAngularTopRightOutlined} size={14} color={t.accentText} />
                  </View>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}
