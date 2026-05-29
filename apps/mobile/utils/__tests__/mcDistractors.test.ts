import { buildQuizQuestions, RawCard } from '../mcDistractors'

const card = (overrides: Partial<RawCard> = {}): RawCard => ({
  id: '1', question: 'Q?', answer: 'A', explanation: '', ...overrides,
})

describe('buildQuizQuestions', () => {
  describe('AI options — highest priority', () => {
    it('uses aiOptions and aiCorrectIndex when present', () => {
      const c: RawCard = {
        id: 'a1', question: 'Q?', answer: 'Correct',
        explanation: 'admin exp',
        aiOptions: ['Wrong1', 'Correct', 'Wrong2', 'Wrong3'],
        aiCorrectIndex: 1,
        aiExplanation: 'AI exp',
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.options).toHaveLength(4)
      expect(new Set(q!.options)).toEqual(new Set(['Wrong1', 'Correct', 'Wrong2', 'Wrong3']))
      expect(q!.options[q!.answerIndex]).toBe('Correct')
      expect(q!.explanation).toBe('AI exp')
    })

    it('uses aiExplanation over admin explanation even when admin options used', () => {
      const c: RawCard = {
        id: 'a2', question: 'Q?', answer: 'Correct',
        explanation: 'admin exp',
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 0,
        aiExplanation: 'AI exp',
      }
      const [q] = buildQuizQuestions([c])
      expect(new Set(q!.options)).toEqual(new Set(['A', 'B', 'C', 'D']))
      expect(q!.options[q!.answerIndex]).toBe('A')
      expect(q!.explanation).toBe('AI exp')
    })

    it('falls back to admin explanation when aiExplanation absent', () => {
      const c: RawCard = {
        id: 'a3', question: 'Q?', answer: 'Correct',
        explanation: 'admin exp',
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 0,
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.explanation).toBe('admin exp')
    })

    it('ignores aiOptions when aiCorrectIndex is null', () => {
      const c: RawCard = {
        id: 'a4', question: 'Q?', answer: 'Correct',
        explanation: '',
        aiOptions: ['W1', 'Correct', 'W2', 'W3'],
        aiCorrectIndex: null,
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 2,
      }
      const [q] = buildQuizQuestions([c])
      expect(new Set(q!.options)).toEqual(new Set(['A', 'B', 'C', 'D']))
      expect(q!.options[q!.answerIndex]).toBe('C')
    })

    it('falls through to admin options when aiCorrectIndex is out of bounds', () => {
      const c: RawCard = {
        id: 'a5', question: 'Q?', answer: 'Correct',
        explanation: '',
        aiOptions: ['W1', 'W2', 'W3', 'Correct'],
        aiCorrectIndex: 5,   // out of range
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 1,
      }
      const [q] = buildQuizQuestions([c])
      expect(new Set(q!.options)).toEqual(new Set(['A', 'B', 'C', 'D']))
      expect(q!.options[q!.answerIndex]).toBe('B')
    })

    it('falls through when aiOptions length is not 4', () => {
      const c: RawCard = {
        id: 'a6', question: 'Q?', answer: 'Correct',
        explanation: '',
        aiOptions: ['W1', 'W2', 'Correct'],  // length 3
        aiCorrectIndex: 2,
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 0,
      }
      const [q] = buildQuizQuestions([c])
      expect(new Set(q!.options)).toEqual(new Set(['A', 'B', 'C', 'D']))
      expect(q!.options[q!.answerIndex]).toBe('A')
    })
  })

  describe('A. newline format (DB format)', () => {
    it('parses stem and options from A. newline format', () => {
      const c = card({
        question: 'Which organelle produces ATP?\nA. Nucleus\nB. Ribosome\nC. Mitochondria\nD. Chloroplast',
        answer: 'C. Mitochondria',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('Which organelle produces ATP?')
      expect(q!.options).toHaveLength(4)
      expect(q!.options).toContain('Mitochondria')
      expect(q!.options[q!.answerIndex]).toBe('Mitochondria')
    })

    it('strips option labels from stem', () => {
      const c = card({
        question: 'What is H₂O?\nA. Carbon dioxide\nB. Water\nC. Oxygen\nD. Nitrogen',
        answer: 'B. Water',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).not.toMatch(/A\./)
      expect(q!.stem).not.toContain('Carbon dioxide')
    })

    it('handles answer A correctly (correct option is Alpha)', () => {
      const c = card({
        question: 'First letter?\nA. Alpha\nB. Beta\nC. Gamma\nD. Delta',
        answer: 'A. Alpha',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.options[q!.answerIndex]).toBe('Alpha')
      expect(q!.options).toContain('Alpha')
    })

    it('handles answer D correctly (correct option is Four)', () => {
      const c = card({
        question: 'Last option?\nA. One\nB. Two\nC. Three\nD. Four',
        answer: 'D. Four',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.options[q!.answerIndex]).toBe('Four')
      expect(q!.options).toContain('Four')
    })
  })

  describe('A) inline format (legacy)', () => {
    it('parses A) inline format', () => {
      const c = card({
        question: 'What is 2+2? A) 2 B) 3 C) 4 D) 5',
        answer: 'C) 4',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is 2+2?')
      expect(q!.options[q!.answerIndex]).toBe('4')
    })
  })

  describe('stored options (seeded cards)', () => {
    it('uses stored options and returns correct answer at answerIndex', () => {
      const c: RawCard = {
        id: 's1', question: 'What is 2+2?', answer: '4',
        options: ['2', '3', '4', '5'], correctAnswerIndex: 2,
        explanation: '',
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is 2+2?')
      expect(q!.options).toHaveLength(4)
      expect(new Set(q!.options)).toEqual(new Set(['2', '3', '4', '5']))
      expect(q!.options[q!.answerIndex]).toBe('4')
    })

    it('uses stored options even when question has embedded format', () => {
      const c: RawCard = {
        id: 's2',
        question: 'Which is correct?\nA. Wrong\nB. Right\nC. Nope\nD. Maybe',
        answer: 'B. Right',
        options: ['Option1', 'Option2', 'Option3', 'Option4'],
        correctAnswerIndex: 1,
        explanation: '',
      }
      const [q] = buildQuizQuestions([c])
      expect(new Set(q!.options)).toEqual(new Set(['Option1', 'Option2', 'Option3', 'Option4']))
      expect(q!.options[q!.answerIndex]).toBe('Option2')
    })
  })

  describe('per-session shuffle (regression)', () => {
    it('reshuffles admin-set options across consecutive calls (most of the time)', () => {
      const c: RawCard = {
        id: 's1', question: 'What is 2+2?', answer: '4',
        options: ['2', '3', '4', '5'], correctAnswerIndex: 2,
        explanation: '',
      }
      const orderings = new Set<string>()
      for (let i = 0; i < 20; i++) {
        const [q] = buildQuizQuestions([c])
        orderings.add(q!.options.join('|'))
      }
      // 4! = 24 permutations; over 20 trials we should see at least 2 different orderings.
      // (Flake-resistant: probability of all-identical-orderings is 1/24^19 — vanishing.)
      expect(orderings.size).toBeGreaterThanOrEqual(2)
    })

    it('preserves correctness across shuffles (option at answerIndex always equals admin answer)', () => {
      const c: RawCard = {
        id: 's2', question: 'Q?', answer: 'X',
        options: ['A', 'B', 'C', 'X'], correctAnswerIndex: 3,
        explanation: '',
      }
      for (let i = 0; i < 10; i++) {
        const [q] = buildQuizQuestions([c])
        expect(q!.options[q!.answerIndex]).toBe('X')
        expect(q!.options).toHaveLength(4)
        expect(new Set(q!.options).size).toBe(4)  // no duplicates introduced
      }
    })

    it('reshuffles AI-cached options too (Priority 1)', () => {
      const c: RawCard = {
        id: 'ai1', question: 'Q?', answer: 'AnswerA',
        explanation: '',
        aiOptions: ['DistractorX', 'AnswerA', 'DistractorY', 'DistractorZ'],
        aiCorrectIndex: 1,
      }
      const orderings = new Set<string>()
      for (let i = 0; i < 20; i++) {
        const [q] = buildQuizQuestions([c])
        orderings.add(q!.options.join('|'))
        // Correctness invariant
        expect(q!.options[q!.answerIndex]).toBe('AnswerA')
      }
      expect(orderings.size).toBeGreaterThanOrEqual(2)
    })
  })

  describe('plain Q+A fallback', () => {
    it('includes correct answer in options at answerIndex position', () => {
      const cards: RawCard[] = [
        card({ id: '1', question: 'Q1?', answer: 'Alpha' }),
        card({ id: '2', question: 'Q2?', answer: 'Beta' }),
        card({ id: '3', question: 'Q3?', answer: 'Gamma' }),
        card({ id: '4', question: 'Q4?', answer: 'Delta' }),
      ]
      const [q] = buildQuizQuestions(cards)
      expect(q!.options).toHaveLength(4)
      expect(q!.options[q!.answerIndex]).toBe('Alpha')
    })

    it('stem is the raw question text', () => {
      const c = card({ question: 'What is the capital of France?' })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is the capital of France?')
    })

    // Regression: this codifies the bug fix where Priority 4 used to pull
    // distractors from other cards' answers in the same deck — producing
    // misleading non-sequiturs (e.g. a Biology card getting a History date
    // as a "wrong answer"). Practice screens must enhance cards via LLM
    // before reaching this fallback, but when they can't, distractors must
    // be generic placeholders, never other cards' content.
    it('does NOT use other cards\' answers as distractors (regression)', () => {
      const cards: RawCard[] = [
        card({ id: '1', question: 'Photosynthesis is what?', answer: 'Plants making food' }),
        card({ id: '2', question: 'Year of EDSA?', answer: '1986' }),
        card({ id: '3', question: 'Author of Noli?', answer: 'Jose Rizal' }),
        card({ id: '4', question: 'Capital of PH?', answer: 'Manila' }),
      ]
      const [first] = buildQuizQuestions(cards)
      const otherAnswers = ['1986', 'Jose Rizal', 'Manila']
      for (const wrong of otherAnswers) {
        expect(first!.options).not.toContain(wrong)
      }
      // The correct answer is still present at answerIndex
      expect(first!.options[first!.answerIndex]).toBe('Plants making food')
    })

    it('fills remaining slots with generic placeholder distractors only', () => {
      const c = card({ id: 'solo', question: 'What is X?', answer: 'Y' })
      const [q] = buildQuizQuestions([c])
      expect(q!.options).toHaveLength(4)
      expect(q!.options).toContain('Y')
      // Three distractors must come from the generic placeholder set
      const placeholders = q!.options.filter(o => o !== 'Y')
      expect(placeholders).toHaveLength(3)
      for (const p of placeholders) {
        expect(['Cannot be determined', 'None of the above', 'More information needed']).toContain(p)
      }
    })
  })
})
