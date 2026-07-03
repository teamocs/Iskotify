import { useMemo, useState, useCallback } from 'react'
import { StyleSheet, View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'
import { ensureEmbedModelDownloaded, embedText, EMBED_MODEL_SIZE_LABEL } from '../services/embeddings'
import { cosineSimilarity } from '../services/vectorSearch'

// ── Phase 2 embedding SPIKE screen (manual dev URL: /dev-embedding-spike) ─────
//
// NOT linked from any nav/tab — a throwaway on-device validator. Verifies that
// (1) the bge-small GGUF downloads unauthenticated, (2) llama.rn embedding mode
// loads it, and (3) similar strings score higher cosine than unrelated ones.
// Deliverable of T2.0 in docs/superpowers/plans/2026-07-03-kuya-rag-reliability.md.
// Harmless if opened in prod (dormant module, no side effects until the button).

const RELATED_A = 'is coding a safe career?'
const RELATED_B = 'will AI replace programmers?'
const UNRELATED = 'what is the deadline for scholarships'

type Phase = 'idle' | 'downloading' | 'embedding' | 'done' | 'error'

export default function DevEmbeddingSpikeScreen() {
  const { theme: t, typo } = useTheme()
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [dim, setDim] = useState<number | null>(null)
  const [simRelated, setSimRelated] = useState<number | null>(null)
  const [simUnrelated, setSimUnrelated] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setPhase('downloading')
    setProgress(0)
    setDim(null)
    setSimRelated(null)
    setSimUnrelated(null)
    setError(null)
    try {
      await ensureEmbedModelDownloaded((f) => setProgress(f))

      setPhase('embedding')
      const [a, b, u] = await Promise.all([
        embedText(RELATED_A),
        embedText(RELATED_B),
        embedText(UNRELATED),
      ])

      if (!a || !b || !u) {
        setError(
          'embedding unavailable on this device/build — embedText returned null ' +
          '(model failed to load in llama.rn embedding mode, or the device lacks support).',
        )
        setPhase('error')
        return
      }

      setDim(a.length)
      setSimRelated(cosineSimilarity(a, b))
      setSimUnrelated(cosineSimilarity(a, u))
      setPhase('done')
    } catch (err) {
      setError(`spike failed — ${(err as Error)?.message ?? String(err)}`)
      setPhase('error')
    }
  }, [])

  const busy = phase === 'downloading' || phase === 'embedding'

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    content: { padding: spacing.xl, gap: spacing.lg },
    title: { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, letterSpacing: -0.4 },
    sub: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, lineHeight: typo.sm * 1.5 },
    btn: {
      backgroundColor: t.accentStrong, borderRadius: radius.lg, paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
    },
    btnDisabled: { opacity: 0.6 },
    btnText: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.base, color: t.textInverse },
    card: { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
    label: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, flex: 1 },
    value: { fontFamily: 'Lexend_600SemiBold', fontSize: typo.base, color: t.textPrimary },
    valueGood: { color: t.success },
    valueLow: { color: t.textSecondary },
    errorCard: { backgroundColor: t.dangerSurface, borderColor: t.danger, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
    errorText: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.danger, lineHeight: typo.sm * 1.5 },
    hint: { fontFamily: 'Lexend_400Regular', fontSize: typo.xs, color: t.textTertiary },
  }), [t, typo])

  const btnLabel =
    phase === 'downloading' ? `Downloading model (${Math.round(progress * 100)}%)`
    : phase === 'embedding' ? 'Embedding…'
    : 'Run embedding spike'

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title} accessibilityRole="header">Embedding Spike</Text>
        <Text style={s.sub}>
          Phase 2 on-device validator. Downloads the {EMBED_MODEL_SIZE_LABEL} bge-small embedding
          model, then embeds three sentences and reports cosine similarity. Related pair should
          score noticeably higher than the unrelated pair. Not wired into chat.
        </Text>

        <Pressable
          onPress={run}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Run embedding spike"
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [s.btn, busy && s.btnDisabled, pressed && !busy ? { opacity: 0.8 } : null]}
        >
          {busy ? <ActivityIndicator color={t.textInverse} /> : null}
          <Text style={s.btnText}>{btnLabel}</Text>
        </Pressable>

        {phase === 'done' && (
          <View style={s.card} accessibilityLabel="Spike results">
            <View style={s.row}>
              <Text style={s.label}>Vector dimension</Text>
              <Text style={s.value}>{dim}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Related pair cosine{'\n'}(expected high)</Text>
              <Text style={[s.value, s.valueGood]}>{simRelated?.toFixed(4)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Related vs unrelated{'\n'}(expected lower)</Text>
              <Text style={[s.value, s.valueLow]}>{simUnrelated?.toFixed(4)}</Text>
            </View>
            <Text style={s.hint}>
              "{RELATED_A}" vs "{RELATED_B}" should beat "{RELATED_A}" vs "{UNRELATED}".
            </Text>
          </View>
        )}

        {phase === 'error' && error && (
          <View style={s.errorCard} accessibilityLabel="Spike error">
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
