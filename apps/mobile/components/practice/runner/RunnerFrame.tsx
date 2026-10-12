import type { Ref } from 'react'
import { View, ScrollView, useWindowDimensions, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../../theme/ThemeContext'
import { spacing } from '../../../theme/tokens'
import { useBreakpoint, pagePadding, contentMaxWidth } from '../../../hooks/useBreakpoint'
import { WebTopSpacer } from '../../ui/WebTopSpacer'
import { Glass } from '../../ui/Glass'

/** The reading column: the question never runs wider than a readable measure. */
export const RUNNER_READING = contentMaxWidth('reading')

interface Props {
  /** The one slim focus header (ExamFocusHeader / PracticeFocusHeader). */
  header: React.ReactNode
  /** Passage + question (QuestionCard). */
  question: React.ReactNode
  /** The answer choices (OptionList). */
  options: React.ReactNode
  /** Footer actions (RunnerActions) — laid out inside the reading column. */
  actions: React.ReactNode
  /** Question navigator side panel; shown on expanded widths only. */
  navPanel?: React.ReactNode
  /** The question pane, so the screen can reset its scroll when the question changes. */
  scrollRef?: Ref<ScrollView>
  /** testID of the reading column (default runner-reading-column). */
  columnTestID?: string
  /** Overlays: review sheet, report modal. */
  children?: React.ReactNode
}

/**
 * The focus-mode frame every question runner shares (mock exam, UPCAT
 * subtest, diagnostic, flashcard quiz) — the same layout as
 * app/practice/exam/[slug].tsx:
 * - a translucent glass top bar (RunnerTopBar) and a glass bottom bar, so a
 *   question reads as a full-screen modal;
 * - the question in a centred reading column capped at 720;
 * - expanded (>= 1024): options follow the question inside that column, and
 *   the question navigator sits beside it as a side panel;
 * - phones/tablets: options in a fixed zone under the question pane (capped
 *   at 42% of the window so the question keeps the majority of the screen,
 *   and the choices never jump between questions); the navigator lives in the
 *   review sheet opened from the header;
 * - footer actions inside the same column, never stretched across a wide window.
 */
export function RunnerFrame({
  header, question, options, actions, navPanel, scrollRef, columnTestID = 'runner-reading-column', children,
}: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const expanded = bp === 'expanded'
  const { height: winH } = useWindowDimensions()
  const column: ViewStyle = {
    width: '100%',
    maxWidth: RUNNER_READING,
    alignSelf: 'center',
    paddingHorizontal: pagePadding(bp),
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <WebTopSpacer />
      {header}

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            <View testID={columnTestID} style={column}>
              {question}
              {expanded ? <View style={{ marginTop: spacing.xl }}>{options}</View> : null}
            </View>
          </ScrollView>

          {expanded ? null : (
            <ScrollView
              style={{ flexGrow: 0, maxHeight: winH * 0.42 }}
              contentContainerStyle={{ paddingVertical: spacing.sm }}
              showsVerticalScrollIndicator={false}
            >
              <View style={column}>{options}</View>
            </ScrollView>
          )}

          {/* The bottom glass bar: Previous · Questions · the one primary action. */}
          <Glass variant="header" testID="runner-bottom-bar" style={{ borderTopWidth: 1, borderTopColor: t.divider }}>
            <View
              testID="runner-footer"
              style={[column, { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }]}
            >
              {actions}
            </View>
          </Glass>
        </View>

        {expanded && navPanel ? navPanel : null}
      </View>

      {children}
    </SafeAreaView>
  )
}
