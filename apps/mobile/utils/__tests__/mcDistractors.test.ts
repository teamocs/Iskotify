import { buildQuizQuestions, RawCard } from '../mcDistractors'

const card = (overrides: Partial<RawCard> = {}): RawCard => ({
  id: '1', question: 'Q?', answer: 'A', explanation: '', difficulty: 1, ...overrides,
})

describe('buildQuizQuestions', () => {
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

    it('handles answer A correctly (answerIndex = 0)', () => {
      const c = card({
        question: 'First letter?\nA. Alpha\nB. Beta\nC. Gamma\nD. Delta',
        answer: 'A. Alpha',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.answerIndex).toBe(0)
      expect(q!.options[0]).toBe('Alpha')
    })

    it('handles answer D correctly (answerIndex = 3)', () => {
      const c = card({
        question: 'Last option?\nA. One\nB. Two\nC. Three\nD. Four',
        answer: 'D. Four',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.answerIndex).toBe(3)
      expect(q!.options[3]).toBe('Four')
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
    it('uses stored options and answerIndex directly without modification', () => {
      const c: RawCard = {
        id: 's1', question: 'What is 2+2?', answer: '4',
        options: ['2', '3', '4', '5'], correctAnswerIndex: 2,
        explanation: '', difficulty: 1,
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is 2+2?')
      expect(q!.options).toEqual(['2', '3', '4', '5'])
      expect(q!.answerIndex).toBe(2)
    })

    it('uses stored options even when question has embedded format', () => {
      const c: RawCard = {
        id: 's2',
        question: 'Which is correct?\nA. Wrong\nB. Right\nC. Nope\nD. Maybe',
        answer: 'B. Right',
        options: ['Option1', 'Option2', 'Option3', 'Option4'],
        correctAnswerIndex: 1,
        explanation: '', difficulty: 1,
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.options).toEqual(['Option1', 'Option2', 'Option3', 'Option4'])
      expect(q!.answerIndex).toBe(1)
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
  })
})
