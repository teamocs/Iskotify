# Mobile Logo, MC Generation & Pre-Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix app logo (landing screen + app icons), make every flashcard playable with auto-generated MC distractors, and replace the 5-card dynamic pre-assessment with a reliable 20-question static one.

**Architecture:** Three independent improvements to `apps/mobile`. Logo fix uses `@resvg/resvg-js` to rasterise the existing `logo.svg` into the PNG icons Expo requires. MC distractor generation is a pure utility function that processes the full card pool — cards already embedding `A)/B)/C)/D)` options are parsed as-is; plain Q+A cards get 3 distractors synthesised from other cards' answers in the same set. The pre-assessment replaces a DB-query-dependent step (often returning 0 cards) with 20 hardcoded UPCAT-style questions that work instantly, offline, with no sync dependency.

**Tech Stack:** Expo / React Native, TypeScript, `@resvg/resvg-js` (devDep), SQLite via Drizzle ORM, NativeWind

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/mobile/app/landing.tsx` |
| Create | `apps/mobile/scripts/generate-icons.js` |
| Modify | `apps/mobile/package.json` |
| Modify | `apps/mobile/app.json` |
| Create | `apps/mobile/utils/mcDistractors.ts` |
| Modify | `apps/mobile/app/practice/[topicId].tsx` |
| Modify | `apps/mobile/app/practice/deck/[deckId].tsx` |
| Modify | `apps/mobile/app/practice/listing/[slug].tsx` |
| Create | `apps/mobile/data/preAssessment.ts` |
| Modify | `apps/mobile/app/onboarding.tsx` |

---

## Task 1: Fix App Logo — Landing Screen, Icon PNGs, app.json

**Files:**
- Modify: `apps/mobile/app/landing.tsx`
- Create: `apps/mobile/scripts/generate-icons.js`
- Modify: `apps/mobile/package.json` (add devDependency)
- Modify: `apps/mobile/app.json`

### Context
`landing.tsx` currently shows a hardcoded maroon `<View>` with the letter "I" as the Iskotify logo. `_layout.tsx` already imports `LogoSvg` correctly — replicate that pattern in `landing.tsx`.

`app.json` has no `icon` field and a 120-byte placeholder `splash.png`. Expo requires 1024×1024 PNG icons. The real `logo.svg` lives at `assets/images/logo.svg` (a 2048×2048 pixel-art SVG already containing its own `#831626` maroon background).

- [ ] **Step 1: Replace the "I" badge in landing.tsx with LogoSvg**

Open `apps/mobile/app/landing.tsx`. Find the logo badge block (lines 88–95):

```tsx
{/* Logo badge */}
<View style={{
  width: 88, height: 88,
  backgroundColor: '#831626',
  borderRadius: 24,
  alignItems: 'center', justifyContent: 'center',
  marginBottom: 4,
}}>
  <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 48, color: '#fff', lineHeight: 56 }}>I</Text>
</View>
```

Replace with:

```tsx
{/* Logo */}
<LogoSvg width={88} height={88} style={{ marginBottom: 4, borderRadius: 24 }} />
```

Add the import at the top of the file (after the existing imports):

```tsx
import LogoSvg from '../assets/images/logo.svg'
```

- [ ] **Step 2: Install @resvg/resvg-js as a dev dependency**

Run from `apps/mobile/`:

```bash
cd apps/mobile && pnpm add -D @resvg/resvg-js
```

Expected: package installs without errors.

- [ ] **Step 3: Create the icon generation script**

Create `apps/mobile/scripts/generate-icons.js`:

```js
// One-time script: node scripts/generate-icons.js
const { Resvg } = require('@resvg/resvg-js')
const fs = require('fs')
const path = require('path')

const svgContent = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'images', 'logo.svg'),
  'utf-8'
)

function renderAt(size) {
  const resvg = new Resvg(svgContent, { fitTo: { mode: 'width', value: size } })
  return resvg.render().asPng()
}

const outDir = path.join(__dirname, '..', 'assets', 'images')

fs.writeFileSync(path.join(outDir, 'icon.png'), renderAt(1024))
console.log('✓ icon.png (1024×1024)')

fs.writeFileSync(path.join(outDir, 'adaptive-icon.png'), renderAt(1024))
console.log('✓ adaptive-icon.png (1024×1024)')

fs.writeFileSync(path.join(outDir, 'splash.png'), renderAt(512))
console.log('✓ splash.png (512×512)')

console.log('Done — icons written to assets/images/')
```

- [ ] **Step 4: Run the icon generation script**

```bash
cd apps/mobile && node scripts/generate-icons.js
```

Expected output:
```
✓ icon.png (1024×1024)
✓ adaptive-icon.png (1024×1024)
✓ splash.png (512×512)
Done — icons written to assets/images/
```

Verify the files exist and are > 10 KB:
```bash
ls -lh apps/mobile/assets/images/*.png
```

- [ ] **Step 5: Update app.json**

Replace the entire `apps/mobile/app.json` with:

```json
{
  "expo": {
    "name": "Iskotify",
    "slug": "iskotify",
    "scheme": "iskotify",
    "version": "0.0.1",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/images/splash.png",
      "backgroundColor": "#1a1a2e",
      "resizeMode": "contain"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "app.iskotify.mobile"
    },
    "android": {
      "package": "app.iskotify.mobile",
      "edgeToEdgeEnabled": true,
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#831626"
      }
    },
    "web": {
      "bundler": "metro",
      "output": "static"
    },
    "plugins": [
      "expo-router",
      "expo-sqlite",
      "expo-web-browser"
    ],
    "experiments": {
      "typedRoutes": true,
      "tsconfigPaths": true
    },
    "extra": {
      "router": {},
      "eas": {
        "projectId": "2aff33cd-6887-46ff-9242-4e0803ca31d5"
      }
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/landing.tsx apps/mobile/app.json apps/mobile/package.json apps/mobile/scripts/generate-icons.js apps/mobile/assets/images/icon.png apps/mobile/assets/images/adaptive-icon.png apps/mobile/assets/images/splash.png
git commit -m "feat(mobile): fix app logo — use LogoSvg in landing, add proper icon/splash PNGs"
```

---

## Task 2: MC Distractor Generation Utility + Update Practice Screens

**Files:**
- Create: `apps/mobile/utils/mcDistractors.ts`
- Modify: `apps/mobile/app/practice/[topicId].tsx`
- Modify: `apps/mobile/app/practice/deck/[deckId].tsx`
- Modify: `apps/mobile/app/practice/listing/[slug].tsx`

### Context
All three practice screens contain a local `parseQuizQuestion` function that returns `null` for flashcards lacking the embedded `A)/B)/C)/D)` option format — filtering them out entirely. The fix: a shared `buildQuizQuestions` utility that synthesises distractors for plain Q+A cards from the surrounding card pool so that every card becomes playable.

- [ ] **Step 1: Create apps/mobile/utils/mcDistractors.ts**

```ts
export interface RawCard {
  id: string
  question: string
  answer: string
  explanation: string
  difficulty: number
}

export interface QuizQuestion {
  id: string
  stem: string
  options: string[]    // 4 answer texts, no letter prefix
  answerIndex: number  // 0–3
  explanation: string
  difficulty: number
}

const FALLBACKS = ['Cannot be determined', 'None of the above', 'All of the above']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

function stripPrefix(answer: string): string {
  return answer.replace(/^[A-D]\)\s*/, '').trim()
}

function parseEmbedded(card: RawCard): QuizQuestion | null {
  const m = card.question.match(/\bA\)\s*(.*?)\s+B\)\s*(.*?)\s+C\)\s*(.*?)\s+D\)\s*([\s\S]+?)$/)
  if (!m) return null
  const stem = card.question.replace(/\s+A\)\s[\s\S]*$/, '').trim()
  const options = [m[1]!.trim(), m[2]!.trim(), m[3]!.trim(), m[4]!.trim()]
  const letter = card.answer.match(/^([A-D])\)/)?.[1]
  if (!letter) return null
  const answerIndex = 'ABCD'.indexOf(letter)
  if (answerIndex === -1) return null
  return { id: card.id, stem, options, answerIndex, explanation: card.explanation, difficulty: card.difficulty }
}

/**
 * Converts every RawCard to a QuizQuestion.
 * Cards with embedded A)/B)/C)/D) options are parsed directly.
 * Plain Q+A cards get 3 distractors synthesised from other cards' answers.
 * Never filters — always returns one QuizQuestion per input card.
 */
export function buildQuizQuestions(cards: RawCard[]): QuizQuestion[] {
  return cards.map(card => {
    const embedded = parseEmbedded(card)
    if (embedded) return embedded

    const correct = stripPrefix(card.answer)
    const pool = cards
      .filter(c => c.id !== card.id)
      .map(c => stripPrefix(c.answer))
      .filter(a => a.length > 0 && a.toLowerCase() !== correct.toLowerCase())
    const unique = [...new Set(pool)]
    const distractors = shuffle(unique).slice(0, 3)

    let fi = 0
    while (distractors.length < 3) {
      const fb = FALLBACKS[fi % FALLBACKS.length]!
      if (!distractors.includes(fb)) distractors.push(fb)
      fi++
    }

    const all = shuffle([correct, ...distractors.slice(0, 3)])
    return {
      id: card.id,
      stem: card.question.trim(),
      options: all,
      answerIndex: Math.max(0, all.indexOf(correct)),
      explanation: card.explanation,
      difficulty: card.difficulty,
    }
  })
}
```

- [ ] **Step 2: Update apps/mobile/app/practice/[topicId].tsx**

At the top of the file, add the import after the existing imports:

```tsx
import { buildQuizQuestions } from '../../utils/mcDistractors'
import type { RawCard } from '../../utils/mcDistractors'
```

Remove the local `parseQuizQuestion` function (lines 38–50 — the entire function block starting `function parseQuizQuestion`).

In the `load()` function inside the `useEffect`, find:

```tsx
const parsed = shuffle(cardRows)
  .map(parseQuizQuestion)
  .filter((q): q is QuizQuestion => q !== null)
  .slice(0, MAX_QUESTIONS)
```

Replace with:

```tsx
const parsed = buildQuizQuestions(shuffle(cardRows as RawCard[])).slice(0, MAX_QUESTIONS)
```

Also remove the local `QuizQuestion` interface since it's now imported. Replace:

```tsx
interface QuizQuestion {
  id: string
  stem: string
  options: string[]   // 4 answer texts, letter prefix stripped
  answerIndex: number // 0-3
  explanation: string
  difficulty: number
}
```

With:

```tsx
import type { QuizQuestion } from '../../utils/mcDistractors'
```

(Consolidate with the earlier import line: `import { buildQuizQuestions, type QuizQuestion, type RawCard } from '../../utils/mcDistractors'`)

- [ ] **Step 3: Update apps/mobile/app/practice/deck/[deckId].tsx**

Same changes as Step 2, but import paths are one level deeper:

```tsx
import { buildQuizQuestions, type QuizQuestion, type RawCard } from '../../../utils/mcDistractors'
```

Remove the local `parseQuizQuestion` function (lines 39–51).

In the `load()` function, find:

```tsx
const parsed = shuffle(cardRows)
  .map(parseQuizQuestion)
  .filter((q): q is QuizQuestion => q !== null)
  .slice(0, MAX_QUESTIONS)
```

Replace with:

```tsx
const parsed = buildQuizQuestions(shuffle(cardRows as RawCard[])).slice(0, MAX_QUESTIONS)
```

Remove the local `QuizQuestion` interface (lines 22–29).

- [ ] **Step 4: Update apps/mobile/app/practice/listing/[slug].tsx**

Same import path as deck screen:

```tsx
import { buildQuizQuestions, type QuizQuestion, type RawCard } from '../../../utils/mcDistractors'
```

Remove the local `parseQuizQuestion` function (lines 23–33).

In the `load()` function, find (line 99):

```tsx
const parsed = shuffle(filtered).map(parseQuizQuestion).filter((q): q is QuizQuestion => q !== null).slice(0, MAX_QUESTIONS)
```

Replace with:

```tsx
const parsed = buildQuizQuestions(shuffle(filtered) as RawCard[]).slice(0, MAX_QUESTIONS)
```

Remove the local `QuizQuestion` interface (lines 16–18).

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors related to the changed files. (Other pre-existing errors are acceptable.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/utils/mcDistractors.ts apps/mobile/app/practice/[topicId].tsx "apps/mobile/app/practice/deck/[deckId].tsx" "apps/mobile/app/practice/listing/[slug].tsx"
git commit -m "feat(mobile): add MC distractor generation — all flashcards now playable in practice mode"
```

---

## Task 3: 20-Question Static Pre-Assessment + Onboarding Rewrite

**Files:**
- Create: `apps/mobile/data/preAssessment.ts`
- Modify: `apps/mobile/app/onboarding.tsx`

### Context
The current Step 3 queries the local DB for flashcards matching the selected listing. This often yields 0 cards (sync may not have completed, or those cards don't have embedded MC options). The fix is 20 hardcoded UPCAT-style questions covering 5 subjects that work instantly and offline. The onboarding Step 3 state machine is completely replaced — no more `assessCards`/`loadingAssess` DB query.

The current code also has an async transaction bug in `handleAssessAnswer` where `.run()` is called synchronously inside a non-async transaction callback. The rewrite fixes this too.

- [ ] **Step 1: Create apps/mobile/data/preAssessment.ts**

```ts
export interface PreAssessQuestion {
  id: string
  subject: 'Mathematics' | 'Science' | 'English' | 'Abstract Reasoning' | 'Filipino'
  stem: string
  options: string[]    // 4 options, no letter prefix
  answerIndex: number  // 0–3
  explanation: string
}

export const PRE_ASSESS_QUESTIONS: PreAssessQuestion[] = [
  // ── Mathematics (5) ──────────────────────────────────────────────────────────
  {
    id: 'pre-math-1', subject: 'Mathematics',
    stem: 'If 2x + 5 = 13, what is the value of x?',
    options: ['2', '3', '4', '5'], answerIndex: 2,
    explanation: '2x = 13 − 5 = 8, so x = 4.',
  },
  {
    id: 'pre-math-2', subject: 'Mathematics',
    stem: 'What is 15% of 80?',
    options: ['10', '12', '15', '20'], answerIndex: 1,
    explanation: '15% × 80 = 0.15 × 80 = 12.',
  },
  {
    id: 'pre-math-3', subject: 'Mathematics',
    stem: 'A train travels at 60 km/h for 2.5 hours. How far does it travel?',
    options: ['120 km', '140 km', '150 km', '160 km'], answerIndex: 2,
    explanation: 'Distance = speed × time = 60 × 2.5 = 150 km.',
  },
  {
    id: 'pre-math-4', subject: 'Mathematics',
    stem: 'What is the area of a circle with radius 7? (Use π ≈ 3.14)',
    options: ['43.96', '153.86', '200.96', '21.98'], answerIndex: 1,
    explanation: 'Area = π r² = 3.14 × 7² = 3.14 × 49 = 153.86.',
  },
  {
    id: 'pre-math-5', subject: 'Mathematics',
    stem: 'What is 2³ × 2⁴?',
    options: ['14', '49', '128', '4096'], answerIndex: 2,
    explanation: '2³ × 2⁴ = 2⁷ = 128.',
  },
  // ── Science (5) ──────────────────────────────────────────────────────────────
  {
    id: 'pre-sci-1', subject: 'Science',
    stem: 'Which organelle is known as the "powerhouse of the cell"?',
    options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'], answerIndex: 2,
    explanation: 'Mitochondria produce ATP, the cell\'s primary energy currency.',
  },
  {
    id: 'pre-sci-2', subject: 'Science',
    stem: 'What is the chemical formula of water?',
    options: ['CO₂', 'H₂O', 'NaCl', 'O₂'], answerIndex: 1,
    explanation: 'Water is made of two hydrogen atoms bonded to one oxygen atom: H₂O.',
  },
  {
    id: 'pre-sci-3', subject: 'Science',
    stem: "Which statement best describes Newton's First Law of Motion?",
    options: [
      'F = ma',
      'Every action has an equal and opposite reaction',
      'An object at rest stays at rest unless acted on by an external force',
      'Energy cannot be created or destroyed',
    ],
    answerIndex: 2,
    explanation: 'Newton\'s First Law (Law of Inertia): objects maintain their state unless a net force acts on them.',
  },
  {
    id: 'pre-sci-4', subject: 'Science',
    stem: 'How many electrons does a neutral carbon atom have?',
    options: ['4', '6', '8', '12'], answerIndex: 1,
    explanation: 'Carbon has atomic number 6; a neutral atom has 6 protons and 6 electrons.',
  },
  {
    id: 'pre-sci-5', subject: 'Science',
    stem: 'What is the outermost layer of the Earth called?',
    options: ['Mantle', 'Outer core', 'Crust', 'Inner core'], answerIndex: 2,
    explanation: 'The crust is Earth\'s outermost solid layer, ranging 5–70 km thick.',
  },
  // ── English (5) ──────────────────────────────────────────────────────────────
  {
    id: 'pre-eng-1', subject: 'English',
    stem: 'Which sentence is grammatically correct?',
    options: [
      'Him and I went to school.',
      'He and I went to school.',
      'He and me went to school.',
      'Him and me went to school.',
    ],
    answerIndex: 1,
    explanation: '"He and I" are subject pronouns and correct as the sentence\'s subject.',
  },
  {
    id: 'pre-eng-2', subject: 'English',
    stem: 'What does the word "benevolent" mean?',
    options: ['Malicious', 'Strict', 'Generous and kind', 'Indifferent'], answerIndex: 2,
    explanation: 'Benevolent means well-meaning and kindly disposed toward others.',
  },
  {
    id: 'pre-eng-3', subject: 'English',
    stem: 'The word "ephemeral" most nearly means:',
    options: ['Eternal', 'Lasting only a short time', 'Extremely large', 'Difficult to understand'],
    answerIndex: 1,
    explanation: 'Ephemeral describes something that lasts for a very short time.',
  },
  {
    id: 'pre-eng-4', subject: 'English',
    stem: 'Choose the correct verb: "Neither of the students ___ ready."',
    options: ['were', 'are', 'was', 'have been'], answerIndex: 2,
    explanation: '"Neither" is singular, so "was" is the correct verb form.',
  },
  {
    id: 'pre-eng-5', subject: 'English',
    stem: 'In "Life is a journey," what literary device is used?',
    options: ['Simile', 'Alliteration', 'Personification', 'Metaphor'], answerIndex: 3,
    explanation: 'A metaphor directly compares two unlike things without "like" or "as".',
  },
  // ── Abstract Reasoning (3) ───────────────────────────────────────────────────
  {
    id: 'pre-abs-1', subject: 'Abstract Reasoning',
    stem: 'What number comes next: 2, 4, 8, 16, ___?',
    options: ['24', '28', '32', '36'], answerIndex: 2,
    explanation: 'Each number doubles: ×2 each step → 32.',
  },
  {
    id: 'pre-abs-2', subject: 'Abstract Reasoning',
    stem: 'What is the next number: 1, 4, 9, 16, ___?',
    options: ['20', '24', '25', '30'], answerIndex: 2,
    explanation: 'These are perfect squares: 1², 2², 3², 4², 5² = 25.',
  },
  {
    id: 'pre-abs-3', subject: 'Abstract Reasoning',
    stem: 'Complete the analogy: Hot is to Cold as Day is to ___.',
    options: ['Sun', 'Morning', 'Night', 'Noon'], answerIndex: 2,
    explanation: 'Hot/Cold are opposites; Day/Night are opposites.',
  },
  // ── Filipino (2) ─────────────────────────────────────────────────────────────
  {
    id: 'pre-fil-1', subject: 'Filipino',
    stem: 'Ano ang tamang baybay ng salitang nagpapahiwatig ng magandang hitsura?',
    options: ['Maganda', 'Mganda', 'Magandah', 'Maaganda'], answerIndex: 0,
    explanation: '"Maganda" ang tamang baybay na nagpapahiwatig ng kagandahan.',
  },
  {
    id: 'pre-fil-2', subject: 'Filipino',
    stem: 'Ano ang kahulugan ng salitang "maunawain"?',
    options: ['Mahigpit', 'Mapag-unawa at matiyaga', 'Tamad', 'Matapang'], answerIndex: 1,
    explanation: 'Ang "maunawain" ay nangangahulugang marunong umunawa at magpasensya.',
  },
]
```

- [ ] **Step 2: Rewrite onboarding.tsx Step 3 state**

In `apps/mobile/app/onboarding.tsx`, make the following targeted changes.

**A. Add the import** after the existing imports at the top of the file:

```ts
import { PRE_ASSESS_QUESTIONS } from '../data/preAssessment'
import type { PreAssessQuestion } from '../data/preAssessment'
```

**B. Replace the Step 3 state declarations** — find the comment block `// Step 3 — pre-assessment` and replace everything from there through `const [loadingAssess, setLoadingAssess] = useState(true)`:

```ts
// Step 3 — pre-assessment (static 20 questions)
const [assessIdx, setAssessIdx] = useState(0)
const [assessAnswers, setAssessAnswers] = useState<Array<{ q: PreAssessQuestion; correct: boolean }>>([])
const [assessDone, setAssessDone] = useState(false)
```

**C. Remove the `useEffect` that loads DB cards** — delete the entire `useEffect` block that starts `if (step !== 3) return` and runs `loadAssessCards()`. The static questions need no loading.

**D. Replace `handleAssessAnswer`** — find the current function and replace with:

```ts
function handleAssessAnswer(optionIdx: number) {
  const q = PRE_ASSESS_QUESTIONS[assessIdx]
  if (!q) return
  const correct = optionIdx === q.answerIndex
  const newAnswers = [...assessAnswers, { q, correct }]

  if (assessIdx === PRE_ASSESS_QUESTIONS.length - 1) {
    // Save all results to userProgress using synthetic IDs
    const now = Date.now()
    void db.transaction(async tx => {
      for (const r of newAnswers) {
        await tx.insert(userProgress).values({ flashcardId: r.q.id, correct: r.correct, answeredAt: now })
      }
    }).catch(e => console.warn('[onboarding] save assess error:', e))
    setAssessAnswers(newAnswers)
    setAssessDone(true)
  } else {
    setAssessAnswers(newAnswers)
    setAssessIdx(i => i + 1)
  }
}
```

**E. Replace the results render block** — find `if (assessDone) {` and replace the entire block (up to but not including the active question render) with:

```tsx
if (assessDone) {
  const correct = assessAnswers.filter(r => r.correct).length
  const pct = Math.round((correct / assessAnswers.length) * 100)

  // Per-subject breakdown
  const subjects = ['Mathematics', 'Science', 'English', 'Abstract Reasoning', 'Filipino'] as const
  const bySubject = subjects.map(sub => {
    const qs = assessAnswers.filter(r => r.q.subject === sub)
    const c = qs.filter(r => r.correct).length
    return { sub, correct: c, total: qs.length }
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 40, paddingBottom: 48 }}>
        <Text style={assessStyle.resultPct}>{pct}%</Text>
        <Text style={assessStyle.resultTitle}>Assessment Complete!</Text>
        <Text style={assessStyle.resultSub}>
          {correct} of {assessAnswers.length} correct.{'\n'}We've calibrated your starting level.
        </Text>

        {/* Per-subject breakdown */}
        <View style={{ marginBottom: 28, gap: 8 }}>
          {bySubject.filter(s => s.total > 0).map(({ sub, correct: c, total }) => {
            const pctSub = Math.round((c / total) * 100)
            return (
              <View key={sub} style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: '#fff' }}>{sub}</Text>
                  <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: 11, color: pctSub >= 60 ? '#4ade80' : '#f87171' }}>
                    {c}/{total} ({pctSub}%)
                  </Text>
                </View>
                <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 99 }}>
                  <View style={{ height: 4, borderRadius: 99, width: `${pctSub}%` as any, backgroundColor: pctSub >= 60 ? '#4ade80' : '#f87171' }} />
                </View>
              </View>
            )
          })}
        </View>

        {/* Focus list summary */}
        {selectedSlugs.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Your Focus List
            </Text>
            {selectedSlugs.map((slug, i) => {
              const listing = listings.find(l => l.slug === slug)
              return (
                <View key={slug} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(128,0,0,0.82)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 12, color: '#fff' }}>#{i + 1}</Text>
                  </View>
                  <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: '#fff', flex: 1 }}>
                    {listing?.title ?? slug}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        <View style={assessStyle.resultCounts}>
          <View style={assessStyle.resultCount}>
            <Text style={[assessStyle.resultNum, { color: '#4ade80' }]}>{correct}</Text>
            <Text style={assessStyle.resultLbl}>Correct</Text>
          </View>
          <View style={assessStyle.resultCount}>
            <Text style={[assessStyle.resultNum, { color: '#f87171' }]}>{assessAnswers.length - correct}</Text>
            <Text style={assessStyle.resultLbl}>Incorrect</Text>
          </View>
        </View>

        <TouchableOpacity style={[assessStyle.primaryBtn, { marginTop: 8 }]} onPress={finishOnboarding}>
          <Text style={assessStyle.primaryBtnTxt}>Start Learning →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
```

**F. Replace the active question render** — find the block starting `const card = assessCards[assessIdx]!` at the bottom of the component (before the closing of the `OnboardingScreen` function) and replace with:

```tsx
const q = PRE_ASSESS_QUESTIONS[assessIdx]
if (!q) return null  // guard (never reached normally)

return (
  <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
    <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingTop: 20 }}>
      <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
      <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
      <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#831626' }} />
    </View>

    <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 16, color: '#fff' }}>
          Pre-Assessment
        </Text>
        <TouchableOpacity onPress={finishOnboarding} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>Skip</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 6 }}>
        {q.subject} · Question {assessIdx + 1} of {PRE_ASSESS_QUESTIONS.length}
      </Text>
      <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 99 }}>
        <View style={{
          height: 3, backgroundColor: '#831626', borderRadius: 99,
          width: `${((assessIdx + 1) / PRE_ASSESS_QUESTIONS.length) * 100}%` as any,
        }} />
      </View>
    </View>

    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={assessStyle.questionCard}>
        <Text style={assessStyle.questionLabel}>{q.subject.toUpperCase()}</Text>
        <Text style={assessStyle.questionText}>{q.stem}</Text>
      </View>

      <View style={{ gap: 10, marginTop: 8 }}>
        {q.options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={assessStyle.optionBtn}
            onPress={() => handleAssessAnswer(i)}
            activeOpacity={0.75}
          >
            <View style={assessStyle.optionLetter}>
              <Text style={assessStyle.optionLetterTxt}>{(['A', 'B', 'C', 'D'] as const)[i]}</Text>
            </View>
            <Text style={assessStyle.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  </SafeAreaView>
)
```

**G. Remove now-unused state and helpers** — remove these lines that are no longer needed:
- `const [assessCards, setAssessCards] = useState<AssessCard[]>([])` 
- `const [loadingAssess, setLoadingAssess] = useState(true)`
- `const [assessIdx, setAssessIdx] = useState(0)` — (replaced above, so keep the NEW one)
- `const [assessResults, setAssessResults] = useState<...>([])` — (replaced by `assessAnswers`)
- The `AssessCard` interface at the top
- The `answerLetter`, `parseOptions`, `parseQuestionStem` helper functions (they're in the onboarding file but no longer called in Step 3)
- The `loadingAssess` render block (the `if (loadingAssess)` return)
- The `assessCards.length === 0` render block

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: no new errors. Pre-existing errors are acceptable.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/data/preAssessment.ts apps/mobile/app/onboarding.tsx
git commit -m "feat(mobile): replace 5-card pre-assessment with 20 static UPCAT-style questions across 5 subjects"
```

---

## Final: Push

- [ ] **Push all commits**

```bash
git push
```
