import { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { ListRow } from '../ui/ListRow'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { groupTopicsBySubject } from '../../utils/groupTopicsBySubject'

type Subject = { id: string; name: string }
type TopicLite = { topic: { id: string; name: string; subjectId: string }; cardCount: number; accuracy: number | null }

/**
 * Text field styling shared by the Practice sheets. The outline uses
 * textTertiary (≥5:1 in both themes) because a control boundary must clear
 * 3:1 (WCAG 1.4.11) and the theme's decorative `border` token does not.
 */
function useFieldStyle() {
  const { theme: t } = useTheme()
  return {
    ...textStyle('body', t.textPrimary),
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: t.textTertiary,
    borderRadius: radius.md,
    borderCurve: 'continuous' as const,
    backgroundColor: t.surface,
  }
}

// ── Search ────────────────────────────────────────────────────────────────

export interface SearchEntry { key: string; type: 'Subject' | 'Topic' | 'Mock exam'; name: string; href: string }

interface SearchProps {
  visible: boolean
  entries: SearchEntry[]
  onClose: () => void
  onOpen: (href: string) => void
}

export function PracticeSearchSheet({ visible, entries, onClose, onOpen }: SearchProps) {
  const { theme: t } = useTheme()
  const field = useFieldStyle()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const results = useMemo(
    () => (q === '' ? [] : entries.filter(e => e.name.toLowerCase().includes(q)).slice(0, 30)),
    [q, entries],
  )

  function close() { setQuery(''); onClose() }

  return (
    <Sheet visible={visible} title="Search practice" onClose={close}>
      <TextInput
        style={field}
        value={query}
        onChangeText={setQuery}
        placeholder="Search subjects, topics, or mock exams"
        placeholderTextColor={t.textTertiary}
        accessibilityLabel="Search subjects, topics, or mock exams"
        autoFocus
        returnKeyType="search"
        autoCorrect={false}
      />
      <View style={{ marginTop: spacing.md, marginHorizontal: -spacing.lg }} accessibilityLiveRegion="polite">
        {q === '' ? (
          <Text style={[textStyle('bodySm', t.textSecondary), { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg }]}>
            Type to search your subjects, topics, and mock exams.
          </Text>
        ) : results.length === 0 ? (
          <Text style={[textStyle('bodySm', t.textSecondary), { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg }]}>
            No matches for “{query.trim()}”
          </Text>
        ) : (
          results.map(r => (
            <ListRow
              key={r.key}
              title={r.name}
              subtitle={r.type}
              accessibilityLabel={`${r.type}: ${r.name}`}
              onPress={() => { setQuery(''); onClose(); onOpen(r.href) }}
            />
          ))
        )}
      </View>
    </Sheet>
  )
}

// ── New deck ───────────────────────────────────────────────────────────────

interface DeckProps {
  visible: boolean
  subjects: Subject[]
  topicRows: TopicLite[]
  onClose: () => void
  onCreate: (name: string, topicIds: string[]) => Promise<void>
}

function TopicCheckRow({ label, sub, checked, onToggle }: { label: string; sub: string; checked: boolean; onToggle: () => void }) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={`${label}, ${sub}`}
      accessibilityState={{ checked }}
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          {
            minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            paddingHorizontal: spacing.sm, borderRadius: radius.sm,
            backgroundColor: pressed ? t.surface2 : checked ? t.accentSurface : 'transparent',
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <View
        {...decorative}
        style={{
          width: 24, height: 24, borderRadius: 6, borderWidth: 2,
          borderColor: checked ? t.accent : t.textTertiary,
          backgroundColor: checked ? t.accent : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {checked ? <Lineicons icon={CheckOutlined} size={14} color={t.textInverse} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={textStyle('body', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={1.8}>{label}</Text>
        <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.8}>{sub}</Text>
      </View>
    </Pressable>
  )
}

export function NewDeckSheet({ visible, subjects, topicRows, onClose, onCreate }: DeckProps) {
  const { theme: t } = useTheme()
  const field = useFieldStyle()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)

  const groups = useMemo(() => {
    const byId = new Map(topicRows.map(r => [r.topic.id, r]))
    return groupTopicsBySubject(
      { topics: topicRows.map(r => ({ id: r.topic.id, name: r.topic.name, subjectId: r.topic.subjectId, accuracy: r.accuracy })), subjects },
      topic => byId.get(topic.id)!,
      undefined,
      'alpha',
    )
  }, [subjects, topicRows])

  function reset() { setName(''); setSelected(new Set()); setStep(1); setSaving(false) }
  function close() { reset(); onClose() }
  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  async function create() {
    if (!name.trim() || selected.size === 0) return
    setSaving(true)
    try { await onCreate(name.trim(), Array.from(selected)); reset(); onClose() } finally { setSaving(false) }
  }

  const footer = step === 1 ? (
    <Button label="Next: pick topics" fullWidth disabled={!name.trim()} onPress={() => setStep(2)} />
  ) : (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Button label="Back" variant="secondary" onPress={() => setStep(1)} />
      <Button
        label="Create deck"
        loading={saving}
        disabled={selected.size === 0}
        onPress={() => { void create() }}
        style={{ flex: 1 }}
      />
    </View>
  )

  return (
    <Sheet visible={visible} title={step === 1 ? 'New deck' : `Pick topics · ${selected.size} chosen`} onClose={close} footer={footer}>
      {step === 1 ? (
        <View style={{ gap: spacing.sm }}>
          <Text nativeID="deck-name-label" style={textStyle('label', t.textSecondary)}>Deck name</Text>
          <TextInput
            style={field}
            value={name}
            onChangeText={setName}
            placeholder="e.g. UPCAT Science finals"
            placeholderTextColor={t.textTertiary}
            accessibilityLabel="Deck name"
            aria-labelledby="deck-name-label"
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => { if (name.trim()) setStep(2) }}
          />
        </View>
      ) : groups.length === 0 ? (
        <Text style={textStyle('body', t.textSecondary)}>No topics on this device yet. Add an exam from Explore to download its topics.</Text>
      ) : (
        <View style={{ gap: spacing.md }}>
          {groups.map(g => (
            <View key={g.subjectId} style={{ gap: spacing.xs }}>
              <Text accessibilityRole="header" style={[textStyle('label', t.textSecondary), { fontFamily: fonts.bodySemi }]}>
                {g.subjectName}
              </Text>
              {g.rows.map(row => (
                <TopicCheckRow
                  key={row.topic.id}
                  label={row.topic.name}
                  sub={`${row.cardCount} card${row.cardCount === 1 ? '' : 's'}`}
                  checked={selected.has(row.topic.id)}
                  onToggle={() => toggle(row.topic.id)}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  )
}
