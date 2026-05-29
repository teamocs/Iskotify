import { groupTopicsBySubject } from '../groupTopicsBySubject'

interface T {
  id: string
  name: string
  subjectId: string
  accuracy?: number | null
}

const subjects = [
  { id: 'sci', name: 'Science' },
  { id: 'math', name: 'Mathematics' },
  { id: 'fil', name: 'Filipino' },
]

const topics: T[] = [
  { id: 't1', name: 'Algebra',       subjectId: 'math', accuracy: 32 },
  { id: 't2', name: 'Geometry',      subjectId: 'math', accuracy: 82 },
  { id: 't3', name: 'Statistics',    subjectId: 'math', accuracy: null },
  { id: 't4', name: 'Photosynthesis', subjectId: 'sci', accuracy: 51 },
  { id: 't5', name: 'Genetics',       subjectId: 'sci', accuracy: null },
  // No Filipino topics — should be dropped from result
]

describe('groupTopicsBySubject', () => {
  describe('basic grouping', () => {
    it('returns empty array when given no topics', () => {
      const out = groupTopicsBySubject<T, T>({ topics: [], subjects }, t => t)
      expect(out).toEqual([])
    })

    it('groups topics by subjectId and drops subjects with no topics', () => {
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t)
      expect(out).toHaveLength(2) // Filipino dropped (no topics)
      const ids = out.map(g => g.subjectId).sort()
      expect(ids).toEqual(['math', 'sci'])
    })

    it('preserves subject name from the subjects array', () => {
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t)
      const math = out.find(g => g.subjectId === 'math')!
      expect(math.subjectName).toBe('Mathematics')
    })

    it('falls back to subjectId as name when subject not in subjects array', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics: [{ id: 't1', name: 'Stray', subjectId: 'unknown' }], subjects },
        t => t,
      )
      expect(out[0]!.subjectName).toBe('unknown')
    })
  })

  describe('focus list filter', () => {
    const topicIdsByListingSlug = {
      upcat:    ['t1', 't4'],          // Algebra, Photosynthesis
      'dost-sei': ['t2'],              // Geometry
      ched:     ['t99'],               // unknown topic id — should be ignored
    }

    it('does not filter when focusListingSlugs is empty', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: [], topicIdsByListingSlug },
        t => t,
      )
      // All 5 topics survive; 2 subjects (math, sci) remain
      expect(out).toHaveLength(2)
      const allTopics = out.flatMap(g => g.rows)
      expect(allTopics).toHaveLength(5)
    })

    it('does not filter when topicIdsByListingSlug is missing even if slugs provided', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: ['upcat'] },
        t => t,
      )
      expect(out.flatMap(g => g.rows)).toHaveLength(5)
    })

    it('filters to union of allowed topic IDs across focus slugs', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: ['upcat', 'dost-sei'], topicIdsByListingSlug },
        t => t,
      )
      // Allowed: t1, t2, t4 → math has [t1, t2], sci has [t4]
      const math = out.find(g => g.subjectId === 'math')!
      const sci  = out.find(g => g.subjectId === 'sci')!
      expect(math.rows.map(r => r.id).sort()).toEqual(['t1', 't2'])
      expect(sci.rows.map(r => r.id)).toEqual(['t4'])
    })

    it('drops subjects whose only topics were filtered out', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: ['upcat'], topicIdsByListingSlug },
        t => t,
      )
      // Allowed: t1 (math), t4 (sci) → both subjects present
      expect(out).toHaveLength(2)
    })

    it('returns empty when focus slugs match no known topic ids', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: ['ched'], topicIdsByListingSlug },
        t => t,
      )
      expect(out).toEqual([])
    })
  })

  describe('sorting', () => {
    it("'alpha' (default) sorts subjects A→Z and topics A→Z within", () => {
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t)
      expect(out.map(g => g.subjectName)).toEqual(['Mathematics', 'Science'])
      const math = out[0]!
      expect(math.rows.map(r => r.name)).toEqual(['Algebra', 'Geometry', 'Statistics'])
    })

    it("'accuracy-asc' sorts subjects by ascending avg accuracy; null treated as 0 (top)", () => {
      // math avg = (32 + 82 + 0[null→0]) / 3 = 38
      // sci  avg = (51 + 0[null→0]) / 2 = 25.5
      // → sci first, math second
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t, undefined, 'accuracy-asc')
      expect(out.map(g => g.subjectId)).toEqual(['sci', 'math'])
      // Within math: null (Statistics, treated as 0) → Algebra 32 → Geometry 82
      const math = out[1]!
      expect(math.rows.map(r => r.name)).toEqual(['Statistics', 'Algebra', 'Geometry'])
    })

    it("'accuracy-desc' sorts subjects by descending avg accuracy; null treated as -1 (bottom)", () => {
      // math practiced avg = (32 + 82) / 2 = 57 (null ignored — treated as -1, sorts last)
      // sci  practiced avg = 51 / 1 = 51 (null ignored)
      // → math first, sci second
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t, undefined, 'accuracy-desc')
      expect(out.map(g => g.subjectId)).toEqual(['math', 'sci'])
      // Within math: Geometry 82 → Algebra 32 → Statistics null (last)
      const math = out[0]!
      expect(math.rows.map(r => r.name)).toEqual(['Geometry', 'Algebra', 'Statistics'])
    })
  })

  describe('mapping + summary', () => {
    it('applies rowFor to each topic', () => {
      const out = groupTopicsBySubject<T, { id: string; tagged: boolean }>(
        { topics, subjects },
        t => ({ id: t.id, tagged: true }),
      )
      const allRows = out.flatMap(g => g.rows)
      expect(allRows.every(r => r.tagged === true)).toBe(true)
    })

    it('invokes summaryFor with mapped rows and raw topics', () => {
      let captured: { rows: unknown[]; raws: unknown[] } | null = null
      groupTopicsBySubject<T, { id: string }>(
        { topics, subjects },
        t => ({ id: t.id }),
        (rows, raws) => { captured = { rows, raws }; return `${rows.length} topics` },
      )
      expect(captured).not.toBeNull()
      expect(captured!.rows.length).toBeGreaterThan(0)
      expect(captured!.raws.length).toBeGreaterThan(0)
    })

    it('stores the returned summary on the group', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects },
        t => t,
        (rows) => `${rows.length} topics`,
      )
      expect(out[0]!.summary).toMatch(/^\d+ topics$/)
    })

    it('summary is undefined when summaryFor not provided', () => {
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t)
      expect(out[0]!.summary).toBeUndefined()
    })
  })
})
