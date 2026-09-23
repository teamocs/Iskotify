// Which question-bank pool a Drive file feeds is decided by its file name, not
// guessed from its contents: the name says the exam and section, the headers
// (see dialects.ts) only say how to read the columns. A file that matches no
// rule is recorded as `needs_mapping` for an admin — never imported blind.

export type FileRule =
  | {
      kind: 'import'
      // upcat_questions.subtest — also the flashcard subject the projection creates.
      subtest: string
      mainSubject: string
      // Per-row blueprint skill_category from the row's topic/category. '' lets
      // importUpcatCore fall back to its UPCAT subtest default.
      skillCategory: (topic: string) => string
    }
  | { kind: 'skip'; reason: string }

// Subtests beyond the UPCAT four that the Drive sync may write. They are the
// pools the ACET/USTET blueprint sections draw from via skill_category
// (supabase/migrations/032 + 045 + 047).
export const KB_EXTRA_SUBTESTS = ['General Information', 'Mental Ability'] as const

const upcat = (subtest: string): FileRule => ({ kind: 'import', subtest, mainSubject: subtest, skillCategory: () => '' })

const RULES: Array<[RegExp, FileRule]> = [
  [/^upcat[-_ ]math/i, upcat('Mathematics')],
  [/^upcat[-_ ]science/i, upcat('Science')],
  [/^upcat[-_ ]language/i, upcat('Language Proficiency')],
  [/^upcat[-_ ]reading/i, upcat('Reading Comprehension')],
  [/^acet[-_ ]general[-_ ]knowledge/i, {
    kind: 'import', subtest: 'General Information', mainSubject: 'General Information',
    skillCategory: () => 'General Information',
  }],
  [/^ustet[-_ ]mental[-_ ]ability/i, {
    kind: 'import', subtest: 'Mental Ability', mainSubject: 'Mental Ability',
    // Number/figure sequences feed the non-verbal sections (ustet:1, acet:3
    // "Logical Sequencing"); analogies, syllogisms and classification are verbal.
    skillCategory: (topic) => (/sequence/i.test(topic) ? 'Abstract/Non-Verbal Reasoning' : 'Verbal Reasoning'),
  }],
  [/^pshs/i, {
    kind: 'skip',
    reason: 'PSHS NCE is for Grade 6 pupils entering Grade 7 — outside Iskotify’s senior-high audience.',
  }],
]

export function resolveFileRule(fileName: string): FileRule | null {
  for (const [re, rule] of RULES) if (re.test(fileName.trim())) return rule
  return null
}

/** Stable, readable namespace for question/passage ids imported from a file. */
export function fileKeyOf(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
