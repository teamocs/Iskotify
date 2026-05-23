# Chat Polish PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 user-reported bugs in the Ask Kuya Baw chat experience (close button unreachable, keyboard hides input, latency >15s with no feedback, Home Ask-pill stale after model download) — all as a single JS-only OTA bundle.

**Architecture:** Modal safe-area + keyboard fix uses `react-native-safe-area-context` (already installed) plus the right `KeyboardAvoidingView` behavior per platform. Latency drops via `n_predict: 100`, tightened prompts, and `top_k` sampling. A new presentational `<TypingDots>` component (Reanimated) gives instant feedback. Home refresh swaps mount `useEffect` for `useFocusEffect` so model status is re-derived on every Home focus.

**Tech Stack:** React Native · `react-native-safe-area-context` (existing) · `react-native-reanimated` (existing) · `expo-router` `useFocusEffect` (existing) · llama.rn

---

## File Map

| File | Role |
|---|---|
| `apps/mobile/services/llm.ts` | *(modify)* `streamChatInference`: `n_predict 250→100`, drop `top_p`, add `top_k: 40` |
| `apps/mobile/services/chatPrompts.ts` | *(modify)* Tighten both system prompts to "max 2 sentences" |
| `apps/mobile/components/TypingDots.tsx` *(new)* | Reanimated 3-dot pulse animation for the empty-streaming bubble |
| `apps/mobile/components/ChatBubble.tsx` | *(modify)* Render `<TypingDots />` when `isStreaming && text===''`; render slow-hint after 8s |
| `apps/mobile/components/AskKuyaModal.tsx` | *(modify)* Wrap in `SafeAreaView`, use `useSafeAreaInsets`, fix `KeyboardAvoidingView` behavior, bottom padding for input row |
| `apps/mobile/hooks/useModelDownload.ts` | *(modify)* Replace mount `useEffect` with `useFocusEffect`; skip if downloading |
| `apps/mobile/services/__tests__/llm.test.ts` | *(modify)* Update streamChatInference config test to assert `top_k: 40`, no `top_p` |
| `apps/mobile/services/__tests__/chatPrompts.test.ts` | *(modify)* Update system-prompt-content assertions for new length-cap wording |
| `apps/mobile/hooks/__tests__/useModelDownload.test.ts` | *(modify)* Adjust tests if focus-effect changes initial-render behavior |

---

## Task 1: Tighten chat latency in `llm.ts` + `chatPrompts.ts`

**Files:**
- Modify: `apps/mobile/services/llm.ts`
- Modify: `apps/mobile/services/chatPrompts.ts`
- Modify: `apps/mobile/services/__tests__/llm.test.ts`
- Modify: `apps/mobile/services/__tests__/chatPrompts.test.ts`

- [ ] **Step 1: Update `streamChatInference` inference params in `apps/mobile/services/llm.ts`**

Locate `streamChatInference` (search for `export async function streamChatInference`). Find this block:

```ts
      const result = await ctx.completion(
        {
          prompt,
          n_predict: 250,
          temperature: 0.5,
          top_p: 0.9,
          repeat_penalty: 1.1,
          stop: ['<|im_end|>', '</s>', '<|im_start|>'],
        },
```

Replace with:

```ts
      const result = await ctx.completion(
        {
          prompt,
          n_predict: 100,
          temperature: 0.5,
          top_k: 40,
          repeat_penalty: 1.1,
          stop: ['<|im_end|>', '</s>', '<|im_start|>'],
        },
```

Two changes: `n_predict: 250 → 100`, and `top_p: 0.9` replaced by `top_k: 40`.

- [ ] **Step 2: Tighten both system prompts in `apps/mobile/services/chatPrompts.ts`**

Find this block:

```ts
const SYSTEM_PROMPT_PROGRESS =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Answer the student's question using ONLY the ` +
  `context block below. If the answer isn't in the context, say "Wala pa ` +
  `akong info diyan, sorry!" — never make up stats. Keep answers under 3 ` +
  `short sentences. End with one specific action they can take today.`
```

Replace with:

```ts
const SYSTEM_PROMPT_PROGRESS =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Answer the student's question using ONLY the ` +
  `context block below. If the answer isn't in the context, say "Wala pa ` +
  `akong info diyan, sorry!" — never make up stats. Answer in 1 sentence, ` +
  `max 2. Be specific and direct. End with one concrete action. ` +
  `Be concise. No preamble — get to the answer immediately.`
```

Find this block:

```ts
const SYSTEM_PROMPT_TOPIC =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Explain concepts clearly with one short example.\n\n` +
  `IMPORTANT RULES:\n` +
  `- If the student asks you to SOLVE a math problem, DO NOT solve it. ` +
  `Instead say "Subukan mo muna! Pero here's the concept:" then explain ` +
  `the relevant formula or approach.\n` +
  `- If you don't know the answer, say "Hindi ko sure 'to, baka mas okay ` +
  `i-check sa textbook." Never make up facts.\n` +
  `- Keep answers under 4 sentences. One concrete example if helpful.`
```

Replace with:

```ts
const SYSTEM_PROMPT_TOPIC =
  `You are Kuya Baw, a warm Filipino review coach for UPCAT and scholarship ` +
  `applicants. Speak in Taglish — casual mix of English + Filipino, like a ` +
  `supportive older sibling. Explain concepts clearly with one short example.\n\n` +
  `IMPORTANT RULES:\n` +
  `- If the student asks you to SOLVE a math problem, DO NOT solve it. ` +
  `Instead say "Subukan mo muna! Pero here's the concept:" then explain ` +
  `the relevant formula or approach.\n` +
  `- If you don't know the answer, say "Hindi ko sure 'to, baka mas okay ` +
  `i-check sa textbook." Never make up facts.\n` +
  `- Explain in 1 sentence + 1 short example sentence. Maximum 2 sentences total.\n` +
  `- Be concise. No preamble — get to the answer immediately.`
```

- [ ] **Step 3: Update `llm.test.ts` streamChatInference test**

In `apps/mobile/services/__tests__/llm.test.ts`, find the test that asserts the completion config (search for `'fires onToken for each token emitted by the completion callback'` or the test that calls `streamChatInference` and inspects `completion.mock.calls`). The existing tests may not assert on config params directly — they just verify the callback fires. Add this NEW test to the `describe('streamChatInference', ...)` block (do not modify existing tests):

```ts
  it('passes top_k: 40 and n_predict: 100 to completion (no top_p)', async () => {
    const completion = jest.fn().mockResolvedValue({ text: 'ok' })
    const llama = require('llama.rn')
    llama.initLlama.mockResolvedValue({
      completion,
      release: jest.fn().mockResolvedValue(undefined),
    })

    const { streamChatInference } = require('../llm')
    const controller = new AbortController()
    await streamChatInference('p', () => {}, controller.signal)

    const config = completion.mock.calls[0]![0]
    expect(config.n_predict).toBe(100)
    expect(config.top_k).toBe(40)
    expect(config.temperature).toBe(0.5)
    expect(config.repeat_penalty).toBe(1.1)
    expect(config.top_p).toBeUndefined()
  })
```

- [ ] **Step 4: Update `chatPrompts.test.ts` to match new prompt wording**

In `apps/mobile/services/__tests__/chatPrompts.test.ts`, find tests that assert content of the system prompts (search for `'Kuya Baw'` and the length-cap assertions). The existing tests check for "Kuya Baw" and "Taglish" presence — those still pass. The "Subukan mo muna" assertion still passes.

Add one new assertion to the existing `'system prompts mention Kuya Baw and Taglish'` test, or add a new test that verifies the conciseness rule:

```ts
  it('both system prompts include the conciseness directive', () => {
    const progress = buildChatPrompt('progress', 'q', 'ctx')
    const topic = buildChatPrompt('topic', 'q')
    expect(progress).toContain('No preamble')
    expect(topic).toContain('No preamble')
  })

  it('progress prompt enforces max 2 sentences', () => {
    const prompt = buildChatPrompt('progress', 'q', 'ctx')
    expect(prompt).toContain('1 sentence, max 2')
  })

  it('topic prompt enforces max 2 sentences total', () => {
    const prompt = buildChatPrompt('topic', 'q')
    expect(prompt).toContain('Maximum 2 sentences total')
  })
```

Add inside the existing `describe('buildChatPrompt', ...)` block.

- [ ] **Step 5: Run tests**

```powershell
cd apps/mobile; npx jest services/__tests__/llm.test.ts services/__tests__/chatPrompts.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"
```

Expected: `PASS` · `Tests: 30 passed` (was 28 in llm + 22 in chatPrompts = 50; new is 50 + 1 llm + 3 chatPrompts = 54). Actual count may differ if implementer split things differently — verify all pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/mobile/services/llm.ts apps/mobile/services/chatPrompts.ts apps/mobile/services/__tests__/llm.test.ts apps/mobile/services/__tests__/chatPrompts.test.ts
git commit -m "perf(chat): drop n_predict to 100, switch to top_k, tighten prompts to ~5s answers"
```

---

## Task 2: TypingDots component

**Files:**
- Create: `apps/mobile/components/TypingDots.tsx`

This is a pure presentational component. No tests (animation behavior is validated manually on-device).

- [ ] **Step 1: Create `apps/mobile/components/TypingDots.tsx`**

```tsx
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated'
import { useTheme } from '../theme/ThemeContext'

interface DotProps {
  delay: number
  color: string
}

function Dot({ delay, color }: DotProps) {
  const opacity = useSharedValue(0.3)

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
          withTiming(0.3, { duration: 600 }),
        ),
        -1,
        false,
      ),
    )
  }, [delay, opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return <Animated.View style={[styles.dot, { backgroundColor: color }, animatedStyle]} />
}

export function TypingDots() {
  const { theme: t } = useTheme()

  return (
    <View style={styles.row} accessibilityLabel="Kuya Baw is typing">
      <Dot delay={0} color={t.textSecondary} />
      <Dot delay={200} color={t.textSecondary} />
      <Dot delay={400} color={t.textSecondary} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
```

- [ ] **Step 2: Type-check**

```powershell
cd apps/mobile; npx tsc --noEmit 2>&1 | grep "TypingDots"
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add apps/mobile/components/TypingDots.tsx
git commit -m "feat(chat): add TypingDots animated indicator for streaming bubble"
```

---

## Task 3: Render TypingDots + slow-hint in ChatBubble

**Files:**
- Modify: `apps/mobile/components/ChatBubble.tsx`

- [ ] **Step 1: Read the current `apps/mobile/components/ChatBubble.tsx` to understand its structure**

Run: `cat apps/mobile/components/ChatBubble.tsx`

Expected: see the existing component that renders message text + streaming cursor + error.

- [ ] **Step 2: Modify `apps/mobile/components/ChatBubble.tsx` to render TypingDots when text is empty and add the slow-hint**

Add imports at the top of the file (alongside existing imports):

```tsx
import { useEffect, useMemo, useState } from 'react'
import { TypingDots } from './TypingDots'
```

(`useState` and `useEffect` are likely already imported via `useMemo` import — verify and add if missing.)

Inside the `ChatBubble` component body, before the `return`, add the slow-hint logic:

```tsx
const [showSlowHint, setShowSlowHint] = useState(false)

useEffect(() => {
  if (!message.isStreaming || message.text.length > 0) {
    setShowSlowHint(false)
    return
  }
  const t = setTimeout(() => setShowSlowHint(true), 8000)
  return () => clearTimeout(t)
}, [message.isStreaming, message.text])
```

Add a style for the slow-hint italics inside the `StyleSheet.create({...})`:

```tsx
slowHint: {
  fontStyle: 'italic',
  color: t.textSecondary,
  fontFamily: 'Lexend_400Regular',
  fontSize: typo.sm,
},
```

Now find the JSX block that renders the assistant bubble. It currently looks something like:

```tsx
<Text style={[s.text, isUser ? s.textUser : s.textAssistant]}>
  {message.text}
  {message.isStreaming && <Text style={s.cursor}>▍</Text>}
</Text>
```

Replace with:

```tsx
{message.isStreaming && message.text.length === 0 ? (
  showSlowHint ? (
    <Text style={s.slowHint}>Kuya Baw is thinking...</Text>
  ) : (
    <TypingDots />
  )
) : (
  <Text style={[s.text, isUser ? s.textUser : s.textAssistant]}>
    {message.text}
    {message.isStreaming && <Text style={s.cursor}>▍</Text>}
  </Text>
)}
```

This means:
- If `isStreaming` AND text is empty AND <8s elapsed → `<TypingDots />`
- If `isStreaming` AND text is empty AND ≥8s elapsed → italicized "Kuya Baw is thinking..."
- Otherwise (text exists OR not streaming) → text + optional cursor (existing behavior)

- [ ] **Step 3: Type-check**

```powershell
cd apps/mobile; npx tsc --noEmit 2>&1 | grep "ChatBubble"
```

Expected: no output.

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/components/ChatBubble.tsx
git commit -m "feat(chat): show TypingDots + 8s slow-hint fallback in streaming bubble"
```

---

## Task 4: AskKuyaModal safe-area + keyboard avoidance

**Files:**
- Modify: `apps/mobile/components/AskKuyaModal.tsx`

- [ ] **Step 1: Update imports in `apps/mobile/components/AskKuyaModal.tsx`**

Find the existing imports at the top:

```tsx
import {
  FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
```

Add a new import line after the react-native import:

```tsx
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
```

- [ ] **Step 2: Add `useSafeAreaInsets` call inside `AskKuyaModalInner` and wrap in SafeAreaView**

Find the `AskKuyaModalInner` component body. Near the top, after the existing hook calls (`useTheme`, `useKuyaChat`, etc.), add:

```tsx
const insets = useSafeAreaInsets()
```

Find the outermost element of the return statement — currently `<KeyboardAvoidingView style={s.container} behavior={...}>`. Wrap the entire `<KeyboardAvoidingView>` block in `<SafeAreaView>`:

Change:
```tsx
  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ...existing header, toggle, list, suggestions, input... */}
    </KeyboardAvoidingView>
  )
```

To:
```tsx
  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        {/* ...existing header, toggle, list, suggestions, input... */}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
```

Three changes:
- Wrap in `<SafeAreaView edges={['top', 'bottom']}>`
- `KeyboardAvoidingView behavior`: `'padding' (iOS) / 'height' (Android)` (was undefined on Android)
- New `keyboardVerticalOffset` prop

- [ ] **Step 3: Add safeArea style and bottom padding to the input row**

In the `StyleSheet.create({...})` call, add a new `safeArea` entry at the top:

```tsx
safeArea: { flex: 1, backgroundColor: t.bg },
```

Find the existing `inputRow` style:

```tsx
inputRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderTopWidth: 1,
  borderTopColor: t.border,
  gap: 8,
},
```

Note that since style depends on `insets.bottom` (which is dynamic), the bottom-padding needs to be applied INLINE at the JSX site rather than in the StyleSheet. Find the JSX block that renders the input row:

```tsx
<View style={s.inputRow}>
  <TextInput ... />
  <Pressable ... >...</Pressable>
</View>
```

Change to:

```tsx
<View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
  <TextInput ... />
  <Pressable ... >...</Pressable>
</View>
```

This keeps the static `paddingVertical: 10` for the top of the input row but overrides the bottom padding with the safe-area-aware value.

- [ ] **Step 4: Type-check**

```powershell
cd apps/mobile; npx tsc --noEmit 2>&1 | grep "AskKuyaModal"
```

Expected: no output.

- [ ] **Step 5: Run mobile test suite to confirm no regressions**

```powershell
cd apps/mobile; npx jest --no-coverage 2>&1 | tail -3
```

Expected: same pre-existing failure count as before (3 baseline). No new failures.

- [ ] **Step 6: Commit**

```powershell
git add apps/mobile/components/AskKuyaModal.tsx
git commit -m "fix(chat): safe-area for close button + keyboard avoidance + input bottom padding"
```

---

## Task 5: useModelDownload focus-aware refresh

**Files:**
- Modify: `apps/mobile/hooks/useModelDownload.ts`
- Modify: `apps/mobile/hooks/__tests__/useModelDownload.test.ts` (if needed)

- [ ] **Step 1: Read the current `apps/mobile/hooks/useModelDownload.ts`**

Run: `cat apps/mobile/hooks/useModelDownload.ts`

Identify the existing mount-time `useEffect` that calls `hasEnoughRam()` and `modelExists()` to set initial `modelStatus`.

- [ ] **Step 2: Replace mount `useEffect` with `useFocusEffect` in `apps/mobile/hooks/useModelDownload.ts`**

Add to the imports at the top:

```ts
import { useFocusEffect } from 'expo-router'
```

(Adjust the line where `useState`, `useEffect`, `useCallback`, `useRef` are imported from `react` if needed — `useCallback` may already be imported, which `useFocusEffect` needs.)

Find the existing mount effect — it looks like:

```ts
useEffect(() => {
  isMountedRef.current = true
  let cancelled = false
  async function check() {
    if (!hasEnoughRam()) {
      if (!cancelled) setModelStatus('unsupported')
      return
    }
    const exists = await modelExists()
    if (!cancelled) setModelStatus(exists ? 'ready' : 'absent')
  }
  void check()
  return () => {
    cancelled = true
    isMountedRef.current = false
    taskRef.current?.stop()
    taskRef.current = null
  }
}, [])
```

This effect mixes two responsibilities: (a) check model status on mount, (b) cleanup on unmount. Split them so cleanup stays in a mount effect (`useEffect` with `[]`), and the status check moves to `useFocusEffect`.

Replace the above effect with these two effects:

```ts
// Cleanup on unmount only — runs once
useEffect(() => {
  isMountedRef.current = true
  return () => {
    isMountedRef.current = false
    taskRef.current?.stop()
    taskRef.current = null
  }
}, [])

// Re-check model status on every screen focus (so Home reflects model
// downloads that happened on Practice tab without remounting)
useFocusEffect(
  useCallback(() => {
    // Don't clobber in-flight download state
    if (modelStatus === 'downloading') return

    let cancelled = false
    async function check() {
      if (!hasEnoughRam()) {
        if (!cancelled && isMountedRef.current) setModelStatus('unsupported')
        return
      }
      const exists = await modelExists()
      if (!cancelled && isMountedRef.current) setModelStatus(exists ? 'ready' : 'absent')
    }
    void check()
    return () => { cancelled = true }
  }, [modelStatus])
)
```

The `modelStatus` dep on the `useCallback` ensures the guard sees the current value.

- [ ] **Step 3: Run the existing `useModelDownload` tests to check for breakage**

```powershell
cd apps/mobile; npx jest hooks/__tests__/useModelDownload.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"
```

Expected: PASS — `useFocusEffect` runs on initial render in the test environment when no router is mounted (it falls back to a regular `useEffect`-like behavior), so existing tests should still pass.

If they fail: the most likely cause is that `useFocusEffect` requires a router context. Add a mock at the top of `apps/mobile/hooks/__tests__/useModelDownload.test.ts`:

```ts
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react')
    React.useEffect(() => cb(), [])
  },
}))
```

This shims `useFocusEffect` to behave like a one-shot `useEffect` for tests. Re-run the tests after adding the mock; they should now pass.

- [ ] **Step 4: Run mobile test suite to confirm no other regressions**

```powershell
cd apps/mobile; npx jest --no-coverage 2>&1 | tail -3
```

Expected: same pre-existing failure count (3 baseline). No new failures.

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/hooks/useModelDownload.ts
# Add the test file too if you needed to add the mock:
git add apps/mobile/hooks/__tests__/useModelDownload.test.ts
git commit -m "fix(mobile): re-check model status on screen focus so Home updates after Practice download"
```

---

## Self-Review Checklist

- [x] **Spec §1 (modal layout + keyboard)**: Task 4 covers all 5 sub-steps from the spec (SafeAreaView wrap, useSafeAreaInsets, behavior per platform, keyboardVerticalOffset, input bottom padding).
- [x] **Spec §2 (chat latency + indicator)**: Task 1 (inference param changes + system prompt tightening), Task 2 (TypingDots component), Task 3 (render dots in ChatBubble + slow-hint after 8s).
- [x] **Spec §3 (Home Ask-pill refresh)**: Task 5 (useFocusEffect + guard for downloading state).
- [x] **Spec §4 (file map)**: All 6 modified files + 1 new file (TypingDots.tsx) covered across Tasks 1-5. Test files for llm, chatPrompts, useModelDownload all updated.
- [x] **Spec §5 (testing)**: Each task includes a test step where applicable. UI-only changes (TypingDots animation, SafeAreaView wrap, keyboard) are flagged as manual on-device validation per the spec.
- [x] **Spec §6 (rollout)**: All changes are JS-only (no new native modules). Final OTA push after merge is implicit in the workflow.
- [x] **No placeholders**: Every code block contains complete runnable code. No "TBD", no "add error handling", no "similar to Task N".
- [x] **Type consistency**: `streamChatInference` signature unchanged. `useModelDownload` return type unchanged. `ChatBubble` prop shape (`message: ChatMessage`) unchanged. `TypingDots` takes no props. `SafeAreaView`'s `edges` prop uses the documented array of strings.
