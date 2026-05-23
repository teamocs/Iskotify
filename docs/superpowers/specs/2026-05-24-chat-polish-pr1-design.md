# Chat Polish PR 1 Design — Modal Layout + Latency + Home Refresh

## Overview

Fix three concrete user-reported bugs in the Ask Kuya Baw chat experience plus one stale-state bug on Home:

1. The close (✕) button at the top of `AskKuyaModal` is unreachable because the modal renders edge-to-edge under the status bar.
2. The keyboard hides the chat input on Android because `KeyboardAvoidingView` doesn't work inside a React Native `Modal` without explicit `behavior='height'` on Android.
3. Chat answers take >15 seconds and the user has no indication anything is happening between tapping Send and seeing the first token.
4. After downloading the on-device model on the Practice tab, navigating back to Home still shows the "Install AI Reviewer first" Alert because `AiModelBanner` never re-checks `modelExists()`.

All fixes ship as a single OTA bundle via `eas update --branch preview` — no new native modules are added, so no APK build is required.

---

## 1. Modal layout + keyboard avoidance

**Root causes:**

- `AskKuyaModal` doesn't use `SafeAreaView`. Status bar overlaps the header, putting the close button physically tappable but visually obscured.
- `KeyboardAvoidingView` is configured `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — Android receives `undefined` which is a no-op. React Native `Modal` renders in its own native `Window` whose insets the parent layout cannot see, so the input row sits below the keyboard.

**Fix:**

1. Wrap `AskKuyaModalInner`'s root in `<SafeAreaView edges={['top', 'bottom']}>` from `react-native-safe-area-context` (already installed via the Home tab). `edges={['top', 'bottom']}` adds vertical insets only; horizontal stays edge-to-edge.
2. Call `const insets = useSafeAreaInsets()` (from the same package) inside `AskKuyaModalInner` so the `KeyboardAvoidingView` and input-row paddingBottom calculations have explicit numeric inset values to work with.
3. Change `KeyboardAvoidingView` `behavior` to `Platform.OS === 'ios' ? 'padding' : 'height'`. `'height'` works correctly inside Android Modals — the view shrinks rather than translates, which the input row inherits.
4. Add `keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}` so iOS accounts for the status bar height in its padding math.
5. Add explicit bottom padding to the input row: `paddingBottom: Math.max(insets.bottom, 12)` — guarantees ≥12 px above the home-indicator / nav-bar on every device, including older Androids that report `insets.bottom === 0`.

No new dependencies.

---

## 2. Chat latency target ≤5 s + generating indicator

### Inference parameter changes (`services/llm.ts`)

| Param | Old | New | Reason |
|---|---|---|---|
| `n_predict` | 250 | **100** | Caps output ~1–2 short sentences. At 10–20 tok/s on midrange Android, 5–10 s ceiling. Most replies hit a `<\|im_end\|>` stop earlier. |
| `temperature` | 0.5 | 0.5 (unchanged) | Coherent without being robotic. |
| `top_p` | 0.9 | **removed** | Replaced by `top_k`. |
| `top_k` | — | **40** | Faster than top-p at similar diversity on Qwen 1.5B. ~5–10 % throughput win. |
| `repeat_penalty` | 1.1 | 1.1 (unchanged) | Already added in earlier PR. |
| `stop` | `['<\|im_end\|>', '</s>', '<\|im_start\|>']` | unchanged | Standard Qwen ChatML stops. |

### System prompt tightening (`services/chatPrompts.ts`)

Both modes share a new closing line: `"Be concise. No preamble — get to the answer immediately."`

- **Progress mode:** length cap changes from `"Keep answers under 3 short sentences. End with one specific action they can take today."` to `"Answer in 1 sentence, max 2. Be specific and direct. End with one concrete action."`
- **Topic mode:** length cap changes from `"Keep answers under 4 sentences. One concrete example if helpful."` to `"Explain in 1 sentence + 1 short example sentence. Maximum 2 sentences total."`

All other content (the Kuya Baw persona, Taglish guidance, math-refuse rules, "Wala pa akong info diyan", "Hindi ko sure 'to") stays unchanged.

### Generating indicator — `<TypingDots />` component

A new tiny presentational component renders inside the assistant bubble whenever `message.isStreaming === true` AND `message.text === ''`. Three dots that pulse in sequence on a 1.4 s loop.

```
┌──────────────┐
│ ● ● ●  ←     │   while waiting for first token
└──────────────┘

once tokens arrive:

┌──────────────┐
│ Based sa     │
│ stats mo...▍ │
└──────────────┘
```

Implementation: `react-native-reanimated` (already installed) — each dot's `opacity` cycles `0.3 → 1 → 0.3` on staggered timings (`0 ms / 200 ms / 400 ms` offsets) via a shared timing loop. GPU-accelerated; zero JS-thread cost.

### Cold-start fallback

If no token arrives within **8 seconds** (cold model load on the very first chat after app start, or after the AppState idle-release fired), the dots are replaced by an italicized line: `*Kuya Baw is thinking...*`. This reassures the user during the slow-init path. As soon as the first token streams in, the line is replaced by the streamed text.

Trigger: a `setTimeout(8000)` in `ChatBubble` that flips a local `showSlowHint` state. Cleared if `message.text` becomes non-empty or `message.isStreaming` flips to false.

---

## 3. Home Ask-pill auto-refresh after download

**Root cause:** `useModelDownload` (in `apps/mobile/hooks/useModelDownload.ts`) runs a one-shot `useEffect(() => { check() }, [])` on mount. `AiModelBanner` is rendered inside the Home tab and doesn't remount when the user navigates away to Practice and back, so `modelStatus` is captured at first mount and never re-derived.

**Fix:** swap the mount-time `useEffect` for a `useFocusEffect` from `expo-router`. Re-runs on every screen focus.

```tsx
import { useFocusEffect } from 'expo-router'

useFocusEffect(
  useCallback(() => {
    let cancelled = false
    async function check() {
      // Don't clobber an in-flight download
      if (modelStatus === 'downloading') return

      if (!hasEnoughRam()) {
        if (!cancelled) setModelStatus('unsupported')
        return
      }
      const exists = await modelExists()
      if (!cancelled) setModelStatus(exists ? 'ready' : 'absent')
    }
    void check()
    return () => { cancelled = true }
  }, [modelStatus])
)
```

**Cost:** one `FileSystem.getInfoAsync()` call per Home focus ≈ 5 ms. Imperceptible.

**Guard against clobbering active downloads:** if `modelStatus === 'downloading'` (or implicitly during an in-flight download where the user already kicked off `startDownload()`), the focus-effect skips the re-derivation. This preserves the progress + final 'ready' state set by the existing download flow.

The mount-time `useEffect` is removed — `useFocusEffect` fires on first focus too, covering the same case.

---

## 4. File map

| File | Change |
|---|---|
| `apps/mobile/components/AskKuyaModal.tsx` | Wrap in `SafeAreaView`, fix `KeyboardAvoidingView` behavior + offset, add `paddingBottom: max(insets.bottom, 12)` to input row |
| `apps/mobile/components/ChatBubble.tsx` | Render `<TypingDots />` when streaming+empty; render slow-hint italics after 8 s; existing streaming-cursor logic preserved |
| `apps/mobile/components/TypingDots.tsx` *(new)* | Reanimated 3-dot pulse animation, ~50 lines |
| `apps/mobile/services/llm.ts` | `n_predict 250→100`, drop `top_p`, add `top_k: 40` in `streamChatInference` |
| `apps/mobile/services/chatPrompts.ts` | Tighten length caps in both system prompts, add `"Be concise. No preamble"` closing line |
| `apps/mobile/hooks/useModelDownload.ts` | Replace mount `useEffect` with `useFocusEffect`; skip if downloading |
| `apps/mobile/services/__tests__/chatPrompts.test.ts` | Update tests to reflect new length-cap strings (3 tests) |
| `apps/mobile/services/__tests__/llm.test.ts` | Update `streamChatInference` config-test assertion to expect `top_k: 40` instead of `top_p: 0.9` |
| `apps/mobile/hooks/__tests__/useModelDownload.test.ts` | Update tests where they exercise the mount effect — the behavior now triggers on focus, may need a small wrapper |

---

## 5. Testing approach

**Unit-test changes only** — UI changes (`SafeAreaView`, keyboard, dots animation) are validated manually on-device.

- `chatPrompts.test.ts`: update the system-prompt-content tests to expect the new "max 2 sentences" wording.
- `llm.test.ts`: update the streamChatInference happy-path test to assert `top_k: 40` is passed to `ctx.completion`.
- `useModelDownload.test.ts`: existing 6 tests need to be reviewed — most should still pass (focus-effect fires on initial render in test environment). Any that explicitly tested the mount-time effect get rewritten to use the focus pattern.

**Manual on-device validation** (not gated):

1. Open chat on a device with notch — close button is reachable.
2. Tap input — keyboard appears, input row stays above keyboard.
3. Send a question — dots appear immediately, replaced by streamed text within ~3 s; full answer in ~5 s.
4. Send while AI is mid-stream (impossible — Send is disabled).
5. Cold-launch the app, immediately open chat, send: dots → after 8 s, italics "Kuya Baw is thinking..." → first token replaces it.
6. Practice tab → download model → swipe back to Home → tap Ask: opens modal immediately, no Alert.

---

## 6. Rollout

Single OTA bundle via `eas update --branch preview --message "fix(chat): modal safe-area + keyboard + latency + Home refresh"`.

No version bump required (no native modules added). Existing APK installs receive the fix on next app launch.

---

## 7. Out of scope (other PRs in the decomposed plan)

- App-wide `react-native-keyboard-controller` adoption for school picker + other input screens (**PR 2**)
- Pull-to-refresh on tab screens (**PR 3**)
- Swipe-between-tabs navigation (**PR 4**)
- Multi-turn conversation memory (Phase 2 of Ask Kuya Baw)
- Voice input / TTS output
