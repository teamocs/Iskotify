// Which question-bank pool a Drive file feeds is decided by its file name, not
// guessed from its contents: the name says the exam and section, the headers
// (see dialects.ts) only say how to read the columns. A file that matches no
// rule is recorded as `needs_mapping` for an admin — never imported blind.

/** Drive file ids are URL-safe base64 — validated before they reach a query. */
export const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{1,200}$/

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
// pools the ACET/USTET/DOST blueprint sections draw from via skill_category
// (supabase/migrations/032 + 045 + 047). Mechanical-Technical feeds the DOST-SEI
// "Mechanical-Technical Ability" section, which had no pool to land in.
export const KB_EXTRA_SUBTESTS = ['General Information', 'Mental Ability', 'Mechanical-Technical'] as const

// Every pool a Drive file may feed — the closed list an AI or admin mapping picks from.
export const ALL_SUBTESTS = ['Mathematics', 'Science', 'Language Proficiency', 'Reading Comprehension', ...KB_EXTRA_SUBTESTS] as const

// exam_blueprint_sections.skill_category values (supabase/migrations/032, 045, 047).
export const SKILL_CATEGORIES = [
  'Abstract/Non-Verbal Reasoning', 'English/Language', 'General Information', 'Mathematics',
  'Mechanical-Technical', 'Reading Comprehension', 'Science', 'Verbal Reasoning',
] as const

// Number/figure sequences feed the non-verbal sections (ustet:1, acet:3
// "Logical Sequencing"); analogies, syllogisms and classification are verbal.
const mentalAbilityCategory = (topic: string) => (/sequence/i.test(topic) ? 'Abstract/Non-Verbal Reasoning' : 'Verbal Reasoning')

/**
 * The skill_category a pool's rows get when a mapping doesn't fix one. '' lets
 * importUpcatCore fall back to its UPCAT subtest default.
 */
export function defaultSkillCategory(subtest: string): (topic: string) => string {
  if (subtest === 'General Information') return () => 'General Information'
  if (subtest === 'Mental Ability') return mentalAbilityCategory
  if (subtest === 'Mechanical-Technical') return () => 'Mechanical-Technical'
  return () => ''
}

const upcat = (subtest: string): FileRule => ({ kind: 'import', subtest, mainSubject: subtest, skillCategory: () => '' })

const pshs: FileRule = {
  kind: 'skip',
  reason: 'PSHS NCE is for Grade 6 pupils entering Grade 7 — outside Iskotify’s senior-high audience.',
}

// The files the first Drive folder was built from, matched exactly as before.
const RULES: Array<[RegExp, FileRule]> = [
  [/^pshs/i, pshs],
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
    skillCategory: mentalAbilityCategory,
  }],
]

// Any other file: a section keyword anywhere in the name, whatever the exam
// prefix (UPCAT/ACET/USTET/DCAT/DOST/PUPCET… share pools via skill_category).
// Matched against the name lowercased with spaces, underscores, hyphens etc.
// removed, so "Non-Verbal", "non_verbal" and "NonVerbal" read the same (plus a
// spaced copy for the one whole-word keyword, "logic", which "biological"
// would otherwise contain). A name
// that hits two pools ("math_science") isn't guessed at — AI or an admin maps it.
const SECTIONS: Array<{ subtest: string; re: RegExp; skillCategory: (name: string) => (topic: string) => string }> = [
  { subtest: 'Mathematics', re: /math|numerical/, skillCategory: () => () => '' },
  { subtest: 'Science', re: /science/, skillCategory: () => () => '' },
  { subtest: 'Language Proficiency', re: /english|language|grammar/, skillCategory: () => () => '' },
  { subtest: 'Reading Comprehension', re: /reading/, skillCategory: () => () => '' },
  {
    subtest: 'General Information',
    re: /generalknowledge|generalinfo|currentevents/,
    skillCategory: () => () => 'General Information',
  },
  {
    // Analogies are verbal reasoning items (see mentalAbilityCategory), not
    // language proficiency. A name that says the reasoning type fixes the skill.
    subtest: 'Mental Ability',
    re: /mentalability|abstract|nonverbal|logicalreasoning|\blogic(al)?\b|verbalreasoning|analog/,
    skillCategory: name =>
      /abstract|nonverbal/.test(name) ? () => 'Abstract/Non-Verbal Reasoning'
      : /verbalreasoning|analog/.test(name) ? () => 'Verbal Reasoning'
      : mentalAbilityCategory,
  },
  // DOST-SEI Mechanical-Technical Ability (gears, pulleys, levers, tools), e.g.
  // DOST_Mechanical-Technical_300Q.csv.
  { subtest: 'Mechanical-Technical', re: /mechanical/, skillCategory: () => () => 'Mechanical-Technical' },
]

function sectionRule(fileName: string): FileRule | null {
  const spaced = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const name = `${spaced.replace(/ /g, '')} ${spaced}`
  const hits = SECTIONS.filter(s => s.re.test(name))
  if (hits.length !== 1) return null
  const [hit] = hits as [(typeof SECTIONS)[number]]
  return { kind: 'import', subtest: hit.subtest, mainSubject: hit.subtest, skillCategory: hit.skillCategory(name) }
}

export function resolveFileRule(fileName: string): FileRule | null {
  const name = fileName.trim()
  for (const [re, rule] of RULES) if (re.test(name)) return rule
  return sectionRule(name)
}

/** Stable, readable namespace for question/passage ids imported from a file. */
export function fileKeyOf(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
