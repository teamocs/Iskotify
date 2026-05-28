# Practice Session Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a card count picker and timer picker to the ready/start screen of all three practice session types (topic quiz, full review/weak topics, custom deck quiz).

**Architecture:** Each practice screen gains two new state variables (`cardCount`, `timerSecs`) and a `timerSecsRef` that mirrors `timerSecs` for safe use inside timer closures. A new `allQuestionsRef` stores the full loaded question pool; `startQuiz()` shuffles and slices it to `cardCount` instead of slicing at load time. The ready phase is converted from a centered `View` to a `ScrollView` and gains a config card above the rules card.

**Tech Stack:** React Native (StyleSheet, ScrollView, TouchableOpacity), TypeScript, no new dependencies

---

## File Map

| File | Change |
|------|--------|
| `apps/mobile/app/practice/[topicId].tsx` | Modify — topic quiz (min 20, step 10) |
| `apps/mobile/app/practice/listing/[slug].tsx` | Modify — full review / weak topics (min 100, step 50) |
| `apps/mobile/app/practice/deck/[deckId].tsx` | Modify — custom deck quiz (min 20, step 10) |

---

### Task 1: Update `apps/mobile/app/practice/[topicId].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/[topicId].tsx`

**Diff summary:**
1. Remove `TIMER_SECS = 20` and `MAX_QUESTIONS = 10` constants
2. Add `allQuestionsRef`, `timerSecsRef`, `cardCount` state, `timerSecs` state
3. Remove `.slice(0, MAX_QUESTIONS)` in `load()`; store full list in `allQuestionsRef`; initialize `cardCount` to `Math.min(20, parsed.length)`
4. Modify `startTimer()` to read `timerSecsRef.current`
5. Modify `startQuiz()` to shuffle + slice `allQuestionsRef.current` to `cardCount`
6. Simplify `handlePlayAgain()` to just call `startQuiz()`
7. Add `configCard`, `configRow`, `configLabel`, `configChipsRow`, `configChip`, `configChipOn`, `configChipTxt`, `configChipTxtOn` styles
8. Wrap ready phase in `ScrollView`; replace the `readySub` line; add config card above rules card

- [ ] **Step 1: Replace the constants block and add new state/refs**

At the top of the file, replace:
```tsx
const TIMER_SECS = 20
const MAX_QUESTIONS = 10
```
With:
```tsx
const TIMER_OPTIONS = [20, 30, 45, 60] as const
const MIN_QUESTIONS = 20
const QUESTION_STEP = 10
```

Inside the component, after the `const { recordSession }` line, add:
```tsx
const allQuestionsRef = useRef<QuizQuestion[]>([])
const timerSecsRef = useRef(20)
const [cardCount, setCardCount] = useState(MIN_QUESTIONS)
const [timerSecs, setTimerSecs] = useState(20)
```

Remove the `timeLeftRef = useRef(TIMER_SECS)` line and replace with:
```tsx
const timeLeftRef = useRef(20)
```

Remove `const [timeLeft, setTimeLeft] = useState(TIMER_SECS)` and replace with:
```tsx
const [timeLeft, setTimeLeft] = useState(20)
```

Add a `useEffect` to sync `timerSecs` state → ref (add it near the other `useEffect` hooks):
```tsx
useEffect(() => { timerSecsRef.current = timerSecs }, [timerSecs])
```

- [ ] **Step 2: Update `load()` — remove slice, initialize cardCount**

Replace:
```tsx
const parsed = buildQuizQuestions(shuffle(rawCards)).slice(0, MAX_QUESTIONS)
setQuestions(parsed)
setPhase(parsed.length === 0 ? 'results' : 'ready')
```
With:
```tsx
const parsed = buildQuizQuestions(shuffle(rawCards))
allQuestionsRef.current = parsed
const initialCount = Math.min(MIN_QUESTIONS, parsed.length)
setCardCount(initialCount > 0 ? initialCount : parsed.length)
setQuestions(parsed)
setPhase(parsed.length === 0 ? 'results' : 'ready')
```

- [ ] **Step 3: Update `startTimer()` to use `timerSecsRef`**

Replace the entire `startTimer` function body:
```tsx
function startTimer() {
  const secs = timerSecsRef.current
  stopTimer()
  timeLeftRef.current = secs
  setTimeLeft(secs)

  timerProgress.setValue(1)
  timerAnimRef.current = Animated.timing(timerProgress, {
    toValue: 0,
    duration: secs * 1000,
    useNativeDriver: false,
  })
  timerAnimRef.current.start()

  timerRef.current = setInterval(() => {
    timeLeftRef.current -= 1
    setTimeLeft(timeLeftRef.current)
    if (timeLeftRef.current <= 0) {
      stopTimer()
      advanceRef.current(null)
    }
  }, 1000)
}
```

- [ ] **Step 4: Update `startQuiz()` and `handlePlayAgain()`**

Replace the existing `startQuiz` function:
```tsx
function startQuiz() {
  const sliced = shuffle([...allQuestionsRef.current]).slice(0, cardCount)
  startTimeRef.current = Date.now()
  setCurrentIdx(0)
  setAnswers([])
  setSelectedIdx(null)
  setQuestions(sliced)
  setPhase('quiz')
  setTimeout(() => startTimer(), 50)
}
```

Replace `handlePlayAgain`:
```tsx
function handlePlayAgain() {
  startQuiz()
}
```

- [ ] **Step 5: Add config styles to the `useMemo` StyleSheet**

Inside `s = useMemo(() => StyleSheet.create({...}), [t, typo])`, add before the closing brace:
```tsx
configCard: {
  backgroundColor: t.surface,
  borderWidth: 1,
  borderColor: t.border,
  borderRadius: 18,
  padding: 14,
  width: '100%',
  gap: 14,
  marginBottom: 20,
},
configRow: { gap: 6 },
configLabel: {
  fontSize: typo.xs,
  fontWeight: '700',
  color: t.textTertiary,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  fontFamily: 'Lexend_600SemiBold',
},
configChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
configChip: {
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: t.border,
  backgroundColor: t.surface2,
},
configChipOn: { borderColor: t.accent, backgroundColor: t.accentSurface },
configChipTxt: {
  fontSize: typo.sm,
  fontWeight: '600',
  color: t.textTertiary,
  fontFamily: 'Lexend_600SemiBold',
},
configChipTxtOn: { color: '#fca5a5' },
```

Also update `readySub` to not reference the old constant:
The existing `readySub` style stays unchanged — it's just a text style.

- [ ] **Step 6: Replace the ready phase JSX**

Replace the entire `if (phase === 'ready') { return (...) }` block with:
```tsx
if (phase === 'ready') {
  const cardOpts: number[] = []
  for (let n = MIN_QUESTIONS; n <= questions.length; n += QUESTION_STEP) cardOpts.push(n)
  if (cardOpts.length === 0 && questions.length > 0) cardOpts.push(questions.length)

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: 28,
          paddingTop: 48,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.readyIcon}><Text style={{ fontSize: 40 }}>🎯</Text></View>
        <Text style={s.readyTitle}>{topicName}</Text>
        <Text style={s.readySub}>{questions.length} cards available</Text>

        <View style={s.configCard}>
          <View style={s.configRow}>
            <Text style={s.configLabel}>Cards</Text>
            <View style={s.configChipsRow}>
              {cardOpts.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.configChip, cardCount === n && s.configChipOn]}
                  onPress={() => setCardCount(n)}
                >
                  <Text style={[s.configChipTxt, cardCount === n && s.configChipTxtOn]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.configRow}>
            <Text style={s.configLabel}>Time per card</Text>
            <View style={s.configChipsRow}>
              {TIMER_OPTIONS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.configChip, timerSecs === t && s.configChipOn]}
                  onPress={() => setTimerSecs(t)}
                >
                  <Text style={[s.configChipTxt, timerSecs === t && s.configChipTxtOn]}>{t}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={s.rulesCard}>
          <Text style={s.ruleItem}>⏱  Timer counts down each question</Text>
          <Text style={s.ruleItem}>🔤  Tap A / B / C / D to answer</Text>
          <Text style={s.ruleItem}>🔒  No hints — results revealed at the end</Text>
        </View>
        <TouchableOpacity style={s.startBtn} onPress={() => startQuiz()}>
          <Text style={s.startBtnTxt}>Start Quiz →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
          <Text style={s.ghostBtnTxt}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
```

Note: the `TIMER_OPTIONS.map(t => ...)` loop uses `t` as the loop variable which shadows the `t` (theme) in scope. Rename loop variable to `sec`:
```tsx
{TIMER_OPTIONS.map(sec => (
  <TouchableOpacity
    key={sec}
    style={[s.configChip, timerSecs === sec && s.configChipOn]}
    onPress={() => setTimerSecs(sec)}
  >
    <Text style={[s.configChipTxt, timerSecs === sec && s.configChipTxtOn]}>{sec}s</Text>
  </TouchableOpacity>
))}
```

- [ ] **Step 7: Verify TypeScript**

Run:
```
cd apps/mobile && npx tsc --noEmit
```

Expected: no new errors from changed lines. Pre-existing errors in `hooks/__tests__/useHomeStats.test.ts:80-82,101-102` and `hooks/usePracticeData.ts:114` are known and unrelated.

- [ ] **Step 8: Commit**

```
git add apps/mobile/app/practice/[topicId].tsx
git commit -m "feat(practice): add card count + timer config to topic quiz ready screen"
```

---

### Task 2: Update `apps/mobile/app/practice/listing/[slug].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/listing/[slug].tsx`

**Diff summary:**
1. Remove `TIMER_SECS = 20` and `MAX_QUESTIONS = 20` constants
2. Add `TIMER_OPTIONS`, `MIN_QUESTIONS = 100`, `QUESTION_STEP = 50`
3. Add `allQuestionsRef`, `timerSecsRef`, `cardCount` state, `timerSecs` state
4. Remove `.slice(0, MAX_QUESTIONS)` in `load()`; initialize `cardCount` to `Math.min(100, parsed.length)`
5. Update `startTimer()` to read `timerSecsRef.current`
6. Update `startQuiz()` to shuffle + slice from `allQuestionsRef` to `cardCount`
7. Add config styles + config card in ready phase

- [ ] **Step 1: Replace constants, add new state/refs**

Replace:
```tsx
const TIMER_SECS = 20
const MAX_QUESTIONS = 20
```
With:
```tsx
const TIMER_OPTIONS = [20, 30, 45, 60] as const
const MIN_QUESTIONS = 100
const QUESTION_STEP = 50
```

Inside the component, after `const { recordSession }` and `const { theme: t, typo }`:
Add these state declarations near the other `useState` lines:
```tsx
const allQuestionsRef = useRef<QuizQuestion[]>([])
const timerSecsRef = useRef(20)
const [cardCount, setCardCount] = useState(MIN_QUESTIONS)
const [timerSecs, setTimerSecs] = useState(20)
```

Replace `useRef(TIMER_SECS)` with `useRef(20)` for `timeLeftRef`.
Replace `useState(TIMER_SECS)` with `useState(20)` for `timeLeft`.

Add sync effect (near the other `useEffect` hooks):
```tsx
useEffect(() => { timerSecsRef.current = timerSecs }, [timerSecs])
```

- [ ] **Step 2: Update `load()` — remove slice, initialize cardCount**

Replace:
```tsx
const parsed = buildQuizQuestions(rawCards).slice(0, MAX_QUESTIONS)
setQuestions(parsed)
setPhase(parsed.length === 0 ? 'results' : 'ready')
```
With:
```tsx
const parsed = buildQuizQuestions(rawCards)
allQuestionsRef.current = parsed
const initialCount = Math.min(MIN_QUESTIONS, parsed.length)
setCardCount(initialCount > 0 ? initialCount : parsed.length)
setQuestions(parsed)
setPhase(parsed.length === 0 ? 'results' : 'ready')
```

- [ ] **Step 3: Update `startTimer()` to use `timerSecsRef`**

Replace the existing `startTimer` function body:
```tsx
function startTimer() {
  const secs = timerSecsRef.current
  stopTimer()
  timeLeftRef.current = secs
  setTimeLeft(secs)
  timerProgress.setValue(1)
  timerAnimRef.current = Animated.timing(timerProgress, { toValue: 0, duration: secs * 1000, useNativeDriver: false })
  timerAnimRef.current.start()
  timerRef.current = setInterval(() => {
    timeLeftRef.current -= 1
    setTimeLeft(timeLeftRef.current)
    if (timeLeftRef.current <= 0) { stopTimer(); advanceRef.current(null) }
  }, 1000)
}
```

- [ ] **Step 4: Update `startQuiz()`**

Replace the existing `startQuiz` function:
```tsx
function startQuiz() {
  const sliced = shuffle([...allQuestionsRef.current]).slice(0, cardCount)
  startTimeRef.current = Date.now()
  setCurrentIdx(0); setAnswers([]); setSelectedIdx(null)
  setQuestions(sliced)
  setPhase('quiz')
  setTimeout(() => startTimer(), 50)
}
```

- [ ] **Step 5: Add config styles**

Inside `s = useMemo(() => StyleSheet.create({...}), [t, typo])`, add before the closing brace:
```tsx
configCard: {
  backgroundColor: t.surface,
  borderWidth: 1,
  borderColor: t.border,
  borderRadius: 18,
  padding: 14,
  width: '100%',
  gap: 14,
  marginBottom: 20,
},
configRow: { gap: 6 },
configLabel: {
  fontSize: typo.xs,
  fontWeight: '700',
  color: t.textTertiary,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  fontFamily: 'Lexend_600SemiBold',
},
configChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
configChip: {
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: t.border,
  backgroundColor: t.surface2,
},
configChipOn: { borderColor: t.accent, backgroundColor: t.accentSurface },
configChipTxt: {
  fontSize: typo.sm,
  fontWeight: '600',
  color: t.textTertiary,
  fontFamily: 'Lexend_600SemiBold',
},
configChipTxtOn: { color: '#fca5a5' },
```

- [ ] **Step 6: Replace the ready phase JSX**

Replace the entire `if (phase === 'ready') return (...)` block with:
```tsx
if (phase === 'ready') {
  const cardOpts: number[] = []
  for (let n = MIN_QUESTIONS; n <= questions.length; n += QUESTION_STEP) cardOpts.push(n)
  if (cardOpts.length === 0 && questions.length > 0) cardOpts.push(questions.length)

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: 28,
          paddingTop: 48,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.readyIcon}><Text style={{ fontSize: 36 }}>{mode === 'weak' ? '⚠️' : '⚡'}</Text></View>
        <Text style={s.readyTitle}>{modeLabel}</Text>
        <Text style={s.readySub}>{listingTitle}</Text>
        <Text style={s.readySub2}>{questions.length} cards available</Text>

        <View style={s.configCard}>
          <View style={s.configRow}>
            <Text style={s.configLabel}>Cards</Text>
            <View style={s.configChipsRow}>
              {cardOpts.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.configChip, cardCount === n && s.configChipOn]}
                  onPress={() => setCardCount(n)}
                >
                  <Text style={[s.configChipTxt, cardCount === n && s.configChipTxtOn]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.configRow}>
            <Text style={s.configLabel}>Time per card</Text>
            <View style={s.configChipsRow}>
              {TIMER_OPTIONS.map(sec => (
                <TouchableOpacity
                  key={sec}
                  style={[s.configChip, timerSecs === sec && s.configChipOn]}
                  onPress={() => setTimerSecs(sec)}
                >
                  <Text style={[s.configChipTxt, timerSecs === sec && s.configChipTxtOn]}>{sec}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity style={s.startBtn} onPress={startQuiz}>
          <Text style={s.startBtnTxt}>Start Quiz →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
          <Text style={s.ghostBtnTxt}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
```

Note: The listing screen does NOT have a `rulesCard` (it was never there). Keep the config card and start button only.

Also update the `Retry` button in results to use `startQuiz` (no args), which now handles internal shuffling — the existing `onPress={startQuiz}` is already correct since `startQuiz` takes no parameters after our change.

- [ ] **Step 7: Verify TypeScript**

Run:
```
cd apps/mobile && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```
git add apps/mobile/app/practice/listing/[slug].tsx
git commit -m "feat(practice): add card count + timer config to listing quiz ready screen"
```

---

### Task 3: Update `apps/mobile/app/practice/deck/[deckId].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/deck/[deckId].tsx`

This screen is structurally identical to `[topicId].tsx` (same min 20, step 10, same rulesCard in ready phase). The changes mirror Task 1 exactly.

- [ ] **Step 1: Replace constants, add state/refs**

Replace:
```tsx
const TIMER_SECS = 20
const MAX_QUESTIONS = 10
```
With:
```tsx
const TIMER_OPTIONS = [20, 30, 45, 60] as const
const MIN_QUESTIONS = 20
const QUESTION_STEP = 10
```

Inside the component, add after `const { recordSession }`:
```tsx
const allQuestionsRef = useRef<QuizQuestion[]>([])
const timerSecsRef = useRef(20)
const [cardCount, setCardCount] = useState(MIN_QUESTIONS)
const [timerSecs, setTimerSecs] = useState(20)
```

Replace `useRef(TIMER_SECS)` → `useRef(20)` for `timeLeftRef`.
Replace `useState(TIMER_SECS)` → `useState(20)` for `timeLeft`.

Add sync effect:
```tsx
useEffect(() => { timerSecsRef.current = timerSecs }, [timerSecs])
```

- [ ] **Step 2: Update `load()` — remove slice, initialize cardCount**

Replace:
```tsx
const parsed = buildQuizQuestions(shuffle(rawCards)).slice(0, MAX_QUESTIONS)
setQuestions(parsed)
setPhase(parsed.length === 0 ? 'results' : 'ready')
```
With:
```tsx
const parsed = buildQuizQuestions(shuffle(rawCards))
allQuestionsRef.current = parsed
const initialCount = Math.min(MIN_QUESTIONS, parsed.length)
setCardCount(initialCount > 0 ? initialCount : parsed.length)
setQuestions(parsed)
setPhase(parsed.length === 0 ? 'results' : 'ready')
```

- [ ] **Step 3: Update `startTimer()` to use `timerSecsRef`**

Replace `startTimer` function body (same as Task 1):
```tsx
function startTimer() {
  const secs = timerSecsRef.current
  stopTimer()
  timeLeftRef.current = secs
  setTimeLeft(secs)

  timerProgress.setValue(1)
  timerAnimRef.current = Animated.timing(timerProgress, {
    toValue: 0,
    duration: secs * 1000,
    useNativeDriver: false,
  })
  timerAnimRef.current.start()

  timerRef.current = setInterval(() => {
    timeLeftRef.current -= 1
    setTimeLeft(timeLeftRef.current)
    if (timeLeftRef.current <= 0) {
      stopTimer()
      advanceRef.current(null)
    }
  }, 1000)
}
```

- [ ] **Step 4: Update `startQuiz()` and `handlePlayAgain()`**

Replace existing `startQuiz`:
```tsx
function startQuiz() {
  const sliced = shuffle([...allQuestionsRef.current]).slice(0, cardCount)
  startTimeRef.current = Date.now()
  setCurrentIdx(0)
  setAnswers([])
  setSelectedIdx(null)
  setQuestions(sliced)
  setPhase('quiz')
  setTimeout(() => startTimer(), 50)
}
```

Replace `handlePlayAgain`:
```tsx
function handlePlayAgain() {
  startQuiz()
}
```

- [ ] **Step 5: Add config styles**

Same styles as Task 1 — add to `StyleSheet.create`:
```tsx
configCard: {
  backgroundColor: t.surface,
  borderWidth: 1,
  borderColor: t.border,
  borderRadius: 18,
  padding: 14,
  width: '100%',
  gap: 14,
  marginBottom: 20,
},
configRow: { gap: 6 },
configLabel: {
  fontSize: typo.xs,
  fontWeight: '700',
  color: t.textTertiary,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  fontFamily: 'Lexend_600SemiBold',
},
configChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
configChip: {
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: t.border,
  backgroundColor: t.surface2,
},
configChipOn: { borderColor: t.accent, backgroundColor: t.accentSurface },
configChipTxt: {
  fontSize: typo.sm,
  fontWeight: '600',
  color: t.textTertiary,
  fontFamily: 'Lexend_600SemiBold',
},
configChipTxtOn: { color: '#fca5a5' },
```

- [ ] **Step 6: Replace the ready phase JSX**

Replace the `if (phase === 'ready') { return (...) }` block:
```tsx
if (phase === 'ready') {
  const cardOpts: number[] = []
  for (let n = MIN_QUESTIONS; n <= questions.length; n += QUESTION_STEP) cardOpts.push(n)
  if (cardOpts.length === 0 && questions.length > 0) cardOpts.push(questions.length)

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: 28,
          paddingTop: 48,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.readyIcon}><Text style={{ fontSize: 40 }}>🎯</Text></View>
        <Text style={s.readyTitle}>{deckName}</Text>
        <Text style={s.readySub}>{questions.length} cards available</Text>

        <View style={s.configCard}>
          <View style={s.configRow}>
            <Text style={s.configLabel}>Cards</Text>
            <View style={s.configChipsRow}>
              {cardOpts.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.configChip, cardCount === n && s.configChipOn]}
                  onPress={() => setCardCount(n)}
                >
                  <Text style={[s.configChipTxt, cardCount === n && s.configChipTxtOn]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.configRow}>
            <Text style={s.configLabel}>Time per card</Text>
            <View style={s.configChipsRow}>
              {TIMER_OPTIONS.map(sec => (
                <TouchableOpacity
                  key={sec}
                  style={[s.configChip, timerSecs === sec && s.configChipOn]}
                  onPress={() => setTimerSecs(sec)}
                >
                  <Text style={[s.configChipTxt, timerSecs === sec && s.configChipTxtOn]}>{sec}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={s.rulesCard}>
          <Text style={s.ruleItem}>⏱  Timer counts down each question</Text>
          <Text style={s.ruleItem}>🔤  Tap A / B / C / D to answer</Text>
          <Text style={s.ruleItem}>🔒  No hints — results revealed at the end</Text>
        </View>
        <TouchableOpacity style={s.startBtn} onPress={() => startQuiz()}>
          <Text style={s.startBtnTxt}>Start Quiz →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
          <Text style={s.ghostBtnTxt}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
```

- [ ] **Step 7: Verify TypeScript**

Run:
```
cd apps/mobile && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```
git add apps/mobile/app/practice/deck/[deckId].tsx
git commit -m "feat(practice): add card count + timer config to deck quiz ready screen"
```

---

## Manual Verification Checklist

After all 3 tasks:

- [ ] Open a topic quiz → ready screen shows "X cards available", cards chips (20, 30, 40...) and timer chips (20s, 30s, 45s, 60s)
- [ ] Select 30 cards → tap Start → exactly 30 questions run; progress dots show 30 dots
- [ ] Select 45s timer → each question shows 45s counting down; timer bar animates over 45s
- [ ] If topic has < 20 cards, only one chip shows with that count; quiz still starts
- [ ] Open a listing full-review quiz → ready screen shows 100, 150, 200... chips; minimum 100
- [ ] If listing has < 100 cards (e.g. weak topics), only one chip shows; quiz still starts
- [ ] Open a custom deck quiz → behaves same as topic quiz (min 20, step 10)
- [ ] Play Again / Retry after results reshuffles from the FULL pool (not just the previously sliced set)
- [ ] Timer urgency color (red) still triggers at ≤5s regardless of chosen timer
