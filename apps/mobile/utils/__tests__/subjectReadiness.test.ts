import { topicReadiness, subjectReadinessPct, READINESS_WINDOW, READINESS_MIN_ANSWERED } from '../subjectReadiness'

describe('readiness constants', () => {
  it('looks at the most recent 60 answers and needs at least 10 for a number', () => {
    expect(READINESS_WINDOW).toBe(60)
    expect(READINESS_MIN_ANSWERED).toBe(10)
  })
})

describe('topicReadiness', () => {
  it('is the topic own recent accuracy, never lifted by the subject', () => {
    expect(topicReadiness(40)).toBe(40)
  })

  it('is null when the topic has too little practice', () => {
    expect(topicReadiness(null)).toBeNull()
    expect(topicReadiness(undefined)).toBeNull()
  })

  it('treats 0 as a real value', () => {
    expect(topicReadiness(0)).toBe(0)
  })
})

describe('subjectReadinessPct', () => {
  it('looks the subject up by name and rounds/clamps', () => {
    const m = new Map([['Mathematics', 66.6], ['Science', 140]])
    expect(subjectReadinessPct('Mathematics', m)).toBe(67)
    expect(subjectReadinessPct('Science', m)).toBe(100)
  })

  it('is null for a subject with no evidence', () => {
    expect(subjectReadinessPct('Reading Comprehension', new Map())).toBeNull()
  })

  it('treats 0 as a real value', () => {
    expect(subjectReadinessPct('Mathematics', new Map([['Mathematics', 0]]))).toBe(0)
  })
})
