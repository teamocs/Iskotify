import { buildExam, scoreExam, SUBTESTS, type RawUpcatQuestion, type RawUpcatPassage } from '../upcatExam'

function q(p: Partial<RawUpcatQuestion>): RawUpcatQuestion {
  return {
    questionId: 'M001', subtest: 'Mathematics', questionText: 'Q?', options: ['a','b','c','d'],
    correctIndex: 2, explanation: 'x', setId: null, setPosition: null, ...p,
  }
}

describe('SUBTESTS', () => {
  it('lists the 4 official subtests', () => {
    expect(SUBTESTS).toEqual(['Mathematics','Science','Language Proficiency','Reading Comprehension'])
  })
})

describe('buildExam', () => {
  it('full mode returns all questions for the subtest', () => {
    const qs = [q({questionId:'M001'}), q({questionId:'M002'}), q({questionId:'S001', subtest:'Science'})]
    const out = buildExam(qs, [], { subtest: 'Mathematics', mode: 'full' })
    expect(out.map(x => x.questionId)).toEqual(['M001','M002'])
  })

  it('attaches passage_text to questions via set_id', () => {
    const qs = [q({questionId:'R001', subtest:'Reading Comprehension', setId:'PASS-001', setPosition:1})]
    const passages: RawUpcatPassage[] = [{ setId:'PASS-001', subtest:'Reading Comprehension', passageText:'The passage' }]
    const out = buildExam(qs, passages, { subtest: 'Reading Comprehension', mode: 'full' })
    expect(out[0]!.passageText).toBe('The passage')
  })

  it('quick mode samples but never splits a passage set', () => {
    const setQs = Array.from({length:5}, (_,i) => q({questionId:`R${i}`, subtest:'Reading Comprehension', setId:'PASS-001', setPosition:i+1}))
    const standalone = Array.from({length:20}, (_,i) => q({questionId:`L${i}`, subtest:'Reading Comprehension'}))
    const passages: RawUpcatPassage[] = [{ setId:'PASS-001', subtest:'Reading Comprehension', passageText:'P' }]
    const out = buildExam([...setQs, ...standalone], passages, { subtest: 'Reading Comprehension', mode: 'quick' })
    const setMembers = out.filter(x => x.setId === 'PASS-001')
    expect(setMembers.length === 0 || setMembers.length === 5).toBe(true)
    if (setMembers.length === 5) {
      const idxs = out.map((x,i)=>x.setId==='PASS-001'?i:-1).filter(i=>i>=0)
      expect(idxs).toEqual([idxs[0], idxs[0]!+1, idxs[0]!+2, idxs[0]!+3, idxs[0]!+4])
      expect(setMembers.map(x=>x.setPosition)).toEqual([1,2,3,4,5])
    }
  })

  it('quick mode caps roughly at the target size', () => {
    const standalone = Array.from({length:100}, (_,i) => q({questionId:`M${i}`}))
    const out = buildExam(standalone, [], { subtest: 'Mathematics', mode: 'quick' })
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.length).toBeGreaterThan(0)
  })

  it('full mode preserves authored (interleaved) order: standalone, set, standalone', () => {
    // Input order: L0 (standalone), R0 (set PASS-1, pos 1), R1 (set PASS-1, pos 2), L1 (standalone)
    const qs = [
      q({ questionId: 'L0', subtest: 'Reading Comprehension', setId: null, setPosition: null }),
      q({ questionId: 'R0', subtest: 'Reading Comprehension', setId: 'PASS-1', setPosition: 1 }),
      q({ questionId: 'R1', subtest: 'Reading Comprehension', setId: 'PASS-1', setPosition: 2 }),
      q({ questionId: 'L1', subtest: 'Reading Comprehension', setId: null, setPosition: null }),
    ]
    const passages: RawUpcatPassage[] = [{ setId: 'PASS-1', subtest: 'Reading Comprehension', passageText: 'Passage' }]
    const out = buildExam(qs, passages, { subtest: 'Reading Comprehension', mode: 'full' })
    expect(out.map(x => x.questionId)).toEqual(['L0', 'R0', 'R1', 'L1'])
  })
})

describe('scoreExam', () => {
  it('computes overall + per-subtest correct/total', () => {
    const answers = [
      { subtest: 'Mathematics', correct: true },
      { subtest: 'Mathematics', correct: false },
      { subtest: 'Science', correct: true },
    ]
    const res = scoreExam(answers)
    expect(res.overall).toEqual({ correct: 2, total: 3 })
    expect(res.bySubtest['Mathematics']).toEqual({ correct: 1, total: 2 })
    expect(res.bySubtest['Science']).toEqual({ correct: 1, total: 1 })
  })
})
