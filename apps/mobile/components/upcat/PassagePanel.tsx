import { useState, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'

/**
 * Passage display for reading-comprehension questions.
 *
 * Inline: a collapsible, reading-optimized preview that sits above the question
 * without dominating it. "Read full" opens a distraction-free full-screen reader
 * (comfortable measure + line-height, safe-area aware) so long passages are
 * actually readable, then the student returns to the question. Works on native
 * and web (RN Modal renders as an overlay on web).
 */
export function PassagePanel({ passage }: { passage: string }) {
  const { theme: t, typo } = useTheme()
  const insets = useSafeAreaInsets()
  const [expanded, setExpanded] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)

  const s = useMemo(() => StyleSheet.create({
    wrap: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, borderCurve: 'continuous', marginHorizontal: 14, marginBottom: 10, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 8, paddingVertical: 6, gap: 8 },
    toggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
    title: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold' },
    chev: { color: t.textSecondary, fontSize: 15 },
    readBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderCurve: 'continuous', backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.22)' },
    readTxt: { fontSize: typo.xs, color: t.accentText, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
    body: { paddingHorizontal: 14, paddingBottom: 12, maxHeight: 200 },
    text: { fontSize: typo.sm, color: t.textSecondary, lineHeight: 22, fontFamily: 'Lexend_400Regular' },
    // Full-screen reader
    fsRoot: { flex: 1, backgroundColor: t.bg },
    fsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.divider, gap: 8 },
    fsTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    fsClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
    fsCloseTxt: { fontSize: 22, color: t.textSecondary },
    fsBody: { paddingHorizontal: 22, paddingTop: 18 },
    fsText: { fontSize: typo.base, color: t.textPrimary, lineHeight: 29, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Pressable
          style={s.toggle}
          onPress={() => setExpanded(e => !e)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse passage' : 'Expand passage'}
          accessibilityState={{ expanded }}
        >
          <Text style={s.title} maxFontSizeMultiplier={1.4}>📄 Passage</Text>
          <Text style={s.chev}>{expanded ? '▾' : '▸'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.readBtn, pressed && { opacity: 0.7 }]}
          onPress={() => setFullscreen(true)}
          accessibilityRole="button"
          accessibilityLabel="Read the full passage"
        >
          <Text style={s.readTxt} maxFontSizeMultiplier={1.4}>⤢ Read full</Text>
        </Pressable>
      </View>

      {expanded && (
        <ScrollView style={s.body} nestedScrollEnabled showsVerticalScrollIndicator>
          <Text style={s.text} maxFontSizeMultiplier={1.6}>{passage}</Text>
        </ScrollView>
      )}

      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
        presentationStyle="fullScreen"
      >
        <View style={[s.fsRoot, { paddingTop: insets.top }]}>
          <View style={s.fsHeader}>
            <Text style={s.fsTitle} maxFontSizeMultiplier={1.4}>Passage</Text>
            <Pressable
              onPress={() => setFullscreen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close passage"
              style={({ pressed }) => [s.fsClose, pressed && { opacity: 0.6 }]}
            >
              <Text style={s.fsCloseTxt}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={[s.fsBody, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator>
            <Text style={s.fsText} maxFontSizeMultiplier={1.8}>{passage}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}
