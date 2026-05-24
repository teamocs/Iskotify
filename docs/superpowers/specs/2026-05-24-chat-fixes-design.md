# Chat Fixes Design

## Overview

Five bug fixes / UX improvements to the Ask Kuya chat feature, bundled as one OTA-shippable change (JS only, no native modules).

1. **User profile in chat context** — Kuya Baw currently doesn't know the student's name, school, or grade. Inject those into both chat modes.
2. **Math confidence** — Replace the blanket "never solve math" rule with an LLM-driven self-assessment: confident + simple → answer; complex → suggest "try first" and explain the concept.
3. **Tagalog second-person enforcement** — Model currently echoes the student's first-person pronouns (`kong`, `ko`, `ako`) instead of addressing them in second person (`mong`, `mo`, `ka`).
4. **Mode toggle: chips → tabs + rename** — Replace the pill-chip toggle with a segmented tab strip. Rename "My Progress" → "About Me" so it doesn't read like chat history.
5. **Suggestions row** — Recommended questions currently wrap to multiple rows. Switch to a single horizontally-scrollable row with the scrollbar hidden.

Ships via `eas update` on the in-flight v1.1.0 APK (no native code added).

---

## 1. User profile in chat context (both modes)

### Current behaviour

`apps/mobile/services/chatContext.ts` exposes one function: `buildProgressContext(db, stats)`. It uses `stats` (which already includes `fullName`) plus a SQLite query for recent sessions, but never emits the name in the prompt.

`apps/mobile/hooks/useKuyaChat.ts` calls `buildProgressContext` for progress mode and passes `undefined` for topic mode — so Kuya Baw has zero student identity context when answering "Ano ang photosynthesis?".

### Changes

**`apps/mobile/services/chatContext.ts`:**

1. Add a helper `loadStudentIdentity(db)` that queries `userSettings` (id = 1) for `fullName`, `school`, `gradeLevel` and returns a one-line string:
   - With school + grade: `Student: Juan dela Cruz (Grade 11 student at UP Los Baños).`
   - With grade only: `Student: Juan dela Cruz (Grade 11 student).`
   - With school only: `Student: Juan dela Cruz (student at UP Los Baños).`
   - With name only: `Student: Juan dela Cruz.`
   - Empty / no name: `Student: (anonymous).`

2. Update `buildProgressContext(db, stats)` to call `loadStudentIdentity(db)` and prepend the identity line as the first line of the returned block.

3. Add a new exported helper `buildTopicContext(db)` that returns ONLY the identity line (no stats, no sessions). It's the minimal context for topic mode.

**`apps/mobile/hooks/useKuyaChat.ts`:**

In the `send` callback, replace the conditional context build:

```ts
// before
const dataCtx = mode === 'progress'
  ? await buildProgressContext(db, stats)
  : undefined
```

with always-build:

```ts
// after
const dataCtx = mode === 'progress'
  ? await buildProgressContext(db, stats)
  : await buildTopicContext(db)
```

**`apps/mobile/services/chatPrompts.ts`:**

`buildChatPrompt(mode, question, dataContext)` already handles `dataContext`. No type changes; just stop expecting `undefined` for topic mode.

### Why this works

- Name + grade + school in the prompt enable Kuya Baw to address the student personally (*"Juan, here's how to solve..."*) and to tailor vocabulary (G11 vs G12 expectations).
- One extra SQLite query per send. The query is a single-row lookup on a primary key — negligible.
- Defaults to `(anonymous)` for tests / pre-onboarding edge cases.

---

## 2. Math confidence — trust the LLM

### Current behaviour

`chatPrompts.ts` ships with:
- A regex heuristic (`STRONG_MATH_PATTERNS`, `SOLVE_KEYWORDS`, `MATH_TOKENS`, `detectMathSolveRequest`).
- A prefix `(Note: refuse to solve, only explain.)` prepended to detected math-solve requests.
- A system-prompt rule: *"If the student asks you to SOLVE a math problem, DO NOT solve it. Instead say 'Subukan mo muna! Pero here's the concept:' then explain..."*

This blanket-refuses to solve even simple arithmetic. The student is the one who said this is overcorrected — for "What's 12 × 8?" they want an answer, not a concept lecture.

### Changes

**`apps/mobile/services/chatPrompts.ts`:**

1. **Delete** the four exports: `STRONG_MATH_PATTERNS` (private), `SOLVE_KEYWORDS` (private), `MATH_TOKENS` (private), and `detectMathSolveRequest` (exported).
2. **Delete** the `prefix` computation in `buildChatPrompt` for topic mode — `userMessage` becomes just `[QUESTION]\n${safeQuestion}` (plus context block from Section 1).
3. **Rewrite** the math rule in `SYSTEM_PROMPT_TOPIC`:

```
- For math: if it's a straightforward problem you're confident in (basic arithmetic,
  single-formula plug-and-chug, common geometry), solve it step-by-step in 1-2
  short sentences.
- If it's complex (multi-step word problem, multiple unknowns, calculus, ambiguous
  setup), say "Subukan mo muna! Here's the concept:" then explain the approach
  WITHOUT solving.
```

The model self-assesses. The two examples in parentheses anchor the threshold for the LLM.

### Why this works

- The Qwen 2.5 1.5B Instruct model is competent enough on simple arithmetic + single-formula problems that letting it answer those produces good results.
- The "try first" behaviour stays for genuinely-difficult problems where teaching > spoon-feeding.
- No heuristic to maintain; no false positives like "Did Newton **solve** gravity?" misfiring as a math-solve request.

---

## 3. Tagalog second-person enforcement

### Current behaviour

Student asks: *"Anong dapat kong i-focus today?"* (first person: "what should **I** focus on")
Model replies: *"Ano ang kaya **kong** i-focus ngayon..."* (still first person: "what can **I** focus")

The model is echoing the pronoun. It should switch to second person (`mong`, `mo`, `ka`): *"Dapat **mong** i-focus si Math today."*

### Changes

Add this block to BOTH `SYSTEM_PROMPT_PROGRESS` and `SYSTEM_PROMPT_TOPIC` in `apps/mobile/services/chatPrompts.ts`:

```
- If the student writes in Tagalog/Taglish, respond in Tagalog/Taglish.
- ALWAYS address the student in second person: use mo, ka, mong, iyong, sayo.
- NEVER refer to the student with ako, ko, akin, kong, sakin (those are first person — wrong).
- Example — student says "Anong dapat kong gawin?" → answer "Dapat MONG gawin si X" (not "Dapat KONG gawin").
```

The literal example with the contrast (`MONG` vs `KONG`) is intentional — the model trained on parallel-pair examples like this is more reliable than abstract grammar rules.

### Why this works

- Prompt-engineering fix only. No code logic changes.
- The contrastive example pins the failure mode the user actually observed.

---

## 4. Mode toggle: chips → tabs + rename

### Current behaviour

`apps/mobile/components/AskKuyaModal.tsx` lines 229–254 render two pill-shaped buttons in a row labeled "My progress" and "A topic". When tapped, they swap `mode` via `setMode`. The user said: chips read as filters, not navigation; "My progress" reads like chat history.

### Changes

Replace the entire `{/* Mode toggle */}` block with a segmented tab strip:

```tsx
{/* Mode tabs */}
<View style={s.tabRow}>
  {(['progress', 'topic'] as const).map(m => {
    const active = mode === m
    const disabled = isStreaming && !active
    return (
      <Pressable
        key={m}
        style={[s.tabItem, disabled && s.tabItemDisabled]}
        onPress={() => setMode(m)}
        disabled={disabled}
        accessibilityRole="tab"
        accessibilityState={{ selected: active, disabled }}
        accessibilityLabel={m === 'progress' ? 'About Me tab' : 'A Topic tab'}
      >
        <Text style={[s.tabItemText, active && s.tabItemTextActive]}>
          {m === 'progress' ? 'About Me' : 'A Topic'}
        </Text>
        {active && <View style={s.tabUnderline} />}
      </Pressable>
    )
  })}
</View>
```

**Styles to add (replacing the chip styles `togglePill`, `togglePillActive`, `togglePillDisabled`, `togglePillText`, `togglePillTextActive`):**

```ts
tabRow: {
  flexDirection: 'row',
  borderBottomWidth: 1,
  borderBottomColor: t.border,
},
tabItem: {
  flex: 1,
  alignItems: 'center',
  paddingVertical: 12,
  position: 'relative',
},
tabItemDisabled: { opacity: 0.5 },
tabItemText: {
  fontFamily: 'Lexend_500Medium',
  fontSize: typo.sm,
  color: t.textSecondary,
},
tabItemTextActive: {
  color: t.textPrimary,
  fontFamily: 'Lexend_600SemiBold',
},
tabUnderline: {
  position: 'absolute',
  bottom: -1,
  left: 12,
  right: 12,
  height: 3,
  borderRadius: 2,
  backgroundColor: t.accent,
},
```

**Type unchanged:** `ChatMode = 'progress' | 'topic'` stays — only the label strings flip from "My progress" → "About Me".

### Why this works

- Full-width segmented tabs are a familiar pattern (Twitter feed, Instagram profile) — users read as navigation, not as a filter chip.
- The 3px underline under the active label is the canonical Material/iOS-tabs visual cue.
- Borders + flush layout integrate cleanly with the existing header / message-list / input-row vertical stack.

---

## 5. Suggestions — single row, horizontal scroll, hidden scrollbar

### Current behaviour

Three suggested questions render with `flexWrap: 'wrap'` so on small screens they wrap to two or three rows, eating vertical space above the input.

### Changes

Replace the wrap-row `<View>` with a horizontal `<ScrollView>`:

```tsx
{showSuggestions && (
  <View style={s.suggestSection}>
    <Text style={s.suggestLabel}>💡 Try asking:</Text>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.suggestScrollContent}
    >
      {SUGGESTIONS[mode].map(text => (
        <Pressable
          key={text}
          style={s.suggestChip}
          onPress={() => onSuggestionTap(text)}
          accessibilityRole="button"
          accessibilityLabel={`Use suggestion: ${text}`}
        >
          <Text style={s.suggestChipText}>{text}</Text>
        </Pressable>
      ))}
    </ScrollView>
  </View>
)}
```

**Styles changed:**

```ts
// rename `suggestRow` → `suggestSection` (clearer)
suggestSection: { paddingTop: 6, paddingBottom: 8 },

suggestLabel: {
  fontFamily: 'Lexend_500Medium',
  fontSize: 11,
  color: t.textTertiary,
  marginBottom: 6,
  paddingHorizontal: 16,
},

// NEW — replaces `suggestChipsWrap`
suggestScrollContent: {
  paddingHorizontal: 16,
  gap: 8,
  flexDirection: 'row',  // explicit so children sit in a row inside ScrollView
},

// `suggestChip` keeps its existing visual style but loses `marginRight` / `marginBottom`
// (the parent's gap: 8 handles spacing)
suggestChip: {
  backgroundColor: t.surfaceSubtle,
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  alignSelf: 'flex-start',  // keep so chip hugs its text width
},

// `suggestChipText` unchanged
```

**Drop** the old `suggestRow` and `suggestChipsWrap` styles.

### Why this works

- `horizontal` + `showsHorizontalScrollIndicator={false}` is the standard React Native pattern for hidden-scrollbar horizontal lists.
- Single row of chips keeps vertical real-estate for the message list.
- Chips can be any length — long ones cause horizontal overflow but the chip itself stays on one line, scrollable into view.

---

## 6. File map

**Modified files (4):**

| File | Changes |
|---|---|
| `apps/mobile/services/chatContext.ts` | Add `loadStudentIdentity(db)` helper. Update `buildProgressContext` to prepend identity line. Add new `buildTopicContext(db)` export. |
| `apps/mobile/services/chatPrompts.ts` | Delete heuristic regexes + `detectMathSolveRequest`. Rewrite math rule in topic system prompt. Add Tagalog second-person block to BOTH system prompts. Drop the math-prefix injection in `buildChatPrompt`. |
| `apps/mobile/hooks/useKuyaChat.ts` | Replace `undefined` topic-mode context with `await buildTopicContext(db)`. |
| `apps/mobile/components/AskKuyaModal.tsx` | Replace chip toggle with tab strip + underline. Rename label "My progress" → "About Me". Replace wrap suggestion row with horizontal ScrollView. |

**Test files (2):**

| File | Changes |
|---|---|
| `apps/mobile/services/__tests__/chatContext.test.ts` | Extend in-memory schema to add `user_settings` table. New tests for `loadStudentIdentity` formatting variants. New test for `buildTopicContext`. Existing tests updated to assert the new identity line at the top of progress context. |
| `apps/mobile/services/__tests__/chatPrompts.test.ts` | Delete the `detectMathSolveRequest` tests. Keep ChatML-injection sanitization tests. Add tests that both `SYSTEM_PROMPT_PROGRESS` and `SYSTEM_PROMPT_TOPIC` contain the Tagalog second-person instruction and the new math rule. |

---

## 7. Testing approach

**Unit tests (Jest, pure JS):**

- `loadStudentIdentity` — 5 input variants → 5 expected output strings.
- `buildTopicContext` — returns only the identity line, no stats / no sessions.
- `buildProgressContext` — existing assertions still pass + new assertion that output starts with `Student:`.
- `chatPrompts` — assert system-prompt strings contain `"ALWAYS address the student in second person"` and `"Subukan mo muna"`.
- `chatPrompts` — assert `detectMathSolveRequest` is no longer exported (TypeScript compile would catch this; explicit test optional).

**No UI tests for tab strip or horizontal scroll** — these are visual tweaks, validated manually on-device. Existing render-children smoke tests for `AskKuyaModal` (if any) should still pass since the JSX shape is similar.

**Manual on-device validation** (after OTA install):

1. Open chat → first message → Kuya Baw addresses you by name ("Juan, ...").
2. Switch to "A Topic" tab → ask "Ano ang photosynthesis?" → answer is in Taglish, second-person.
3. Ask "What's 12 × 8?" → Kuya answers `96` with a one-sentence explanation.
4. Ask "Solve: if x² + 5x = 24, find x" → Kuya says "Subukan mo muna! Here's the concept: it's a quadratic, use the quadratic formula..." (no answer).
5. Ask in Tagalog "Anong dapat kong i-focus ngayon?" → reply uses **mo/mong**, never **ko/kong**.
6. Tap "About Me" tab → tab underline slides under it; "A Topic" loses underline; styling reads as tabs not chips.
7. Open chat fresh → suggested questions sit in a single row; long suggestion scrolls horizontally; no visible scrollbar.

---

## 8. Rollout

Single OTA bundle:

```bash
eas update --branch preview --message "feat(mobile): chat fixes — profile context, math confidence, tabs, single-row suggestions"
```

No version bump. No EAS build. Targets the v1.1.0 APK (the one just queued from the previous bundle).

---

## 9. Out of scope

- Voice input / TTS for chat (separate feature).
- Multi-language toggle (English-only mode) — Kuya Baw stays Taglish-default.
- Persisting chat history across sessions — out of scope for this PR.
- Markdown rendering in chat bubbles (bold, lists) — separate UX polish.
- Tab swipe gesture inside the modal — the EdgeSwipeNavigator (PR 4) operates only on tab navigation, not inside modals.
- Refactoring the existing 13-test `chatPrompts.test.ts` beyond removing the math-heuristic suite.
