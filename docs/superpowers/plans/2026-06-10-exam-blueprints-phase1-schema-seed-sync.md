# Exam Blueprints — Phase 1 (Schema + Seed + Sync) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the admin-controllable exam-blueprint data model in Supabase, seed the 9 testable PH entrance exams from the master DB, and sync it all to mobile SQLite so a later phase can build mocks from it.

**Architecture:** Four new Supabase tables (`exam_skill_categories`, `exam_blueprints`, `exam_blueprint_sections`, `exam_course_notes`) + a `skill_category` column on the existing `upcat_questions`. Public-read / admin-write RLS, mirroring existing reference tables. The mobile app mirrors all of it into SQLite via the existing `syncOnLaunch` pull (using the paginated helper added earlier). This phase delivers data + sync only; the mobile engine and admin UI are later phases.

**Tech Stack:** Supabase Postgres (migrations via `mcp__supabase__apply_migration`, project `dtugrsbarruizgzowgso`), Drizzle ORM over expo-sqlite (mobile), Jest + better-sqlite3 (mobile tests).

**Reference spec:** `docs/superpowers/specs/2026-06-10-exam-blueprints-design.md`

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| Supabase migration `031_exam_blueprints.sql` | 4 tables + RLS + `skill_category` column + backfill | apply via MCP |
| Supabase migration `032_seed_exam_blueprints.sql` | Idempotent seed of categories + 9 exams + sections + course notes | apply via MCP |
| `apps/mobile/db/schema.ts` | Drizzle defs for the 4 tables + `skillCategory` on `upcatQuestions` | Modify |
| `apps/mobile/db/client.ts` | `CREATE TABLE IF NOT EXISTS` + `ALTER ADD COLUMN` migrations | Modify (MIGRATIONS array) |
| `apps/mobile/services/sync.ts` | Pull the 4 tables + `skill_category`; upsert into SQLite | Modify (`syncOnLaunch`) |
| `apps/mobile/services/examBlueprints.ts` | `getExamBlueprint(db, slug)` data-access helper | Create |
| `apps/mobile/db/__tests__/examBlueprints.repro.test.ts` | Real-SQLite test: schema + helper round-trip (NOT-NULL drift guard) | Create |
| `apps/mobile/services/__tests__/examBlueprints.test.ts` | Helper unit test | Create |

**Slug note:** blueprint `slug` must equal the matching `listings.slug` where a listing exists. Verified mapping from the onboarding acronym→slug map: `upcat`, `acet`, `dcat-dlsu`, `ustet`, `msu-sase`, `bucet`. `dost-sei`, `sm-foundation`, `wvsu-cat` may not have listings yet — that is allowed (the blueprint exists standalone; the launch-from-listing link is optional).

---

### Task 1: Supabase schema migration

**Files:**
- Apply migration `031_exam_blueprints` to project `dtugrsbarruizgzowgso`.

- [ ] **Step 1: Apply the migration**

Call `mcp__supabase__apply_migration` with `name: "031_exam_blueprints"` and this SQL:

```sql
-- Skill-category taxonomy (stable, admin-manageable)
CREATE TABLE IF NOT EXISTS exam_skill_categories (
  name text PRIMARY KEY,
  requires_spatial_logic boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_blueprints (
  slug text PRIMARY KEY,
  name text NOT NULL,
  acronym text NOT NULL DEFAULT '',
  total_items int NOT NULL DEFAULT 0,
  total_time_minutes int NOT NULL DEFAULT 0,
  has_guessing_penalty boolean NOT NULL DEFAULT false,
  guessing_penalty numeric NOT NULL DEFAULT 0.25,
  section_blocked boolean NOT NULL DEFAULT false,
  scoring_note text NOT NULL DEFAULT '',
  mechanics_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_blueprint_sections (
  id text PRIMARY KEY,
  blueprint_slug text NOT NULL REFERENCES exam_blueprints(slug) ON DELETE CASCADE,
  name text NOT NULL,
  skill_category text NOT NULL DEFAULT '',
  item_count int NOT NULL DEFAULT 0,
  time_minutes int,
  requires_spatial_logic boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_blueprint_sections_slug_idx ON exam_blueprint_sections (blueprint_slug);

CREATE TABLE IF NOT EXISTS exam_course_notes (
  id text PRIMARY KEY,
  blueprint_slug text NOT NULL REFERENCES exam_blueprints(slug) ON DELETE CASCADE,
  course_cluster text NOT NULL DEFAULT 'all',
  note text NOT NULL DEFAULT '',
  min_percentile int,
  display_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_course_notes_slug_idx ON exam_course_notes (blueprint_slug);

-- Tie questions to the shared taxonomy.
ALTER TABLE upcat_questions ADD COLUMN IF NOT EXISTS skill_category text;
UPDATE upcat_questions SET skill_category = CASE subtest
  WHEN 'Mathematics' THEN 'Mathematics'
  WHEN 'Science' THEN 'Science'
  WHEN 'Language Proficiency' THEN 'English/Language'
  WHEN 'Reading Comprehension' THEN 'Reading Comprehension'
  ELSE skill_category END
WHERE skill_category IS NULL;

-- updated_at triggers (reuse the project's update_updated_at function)
DROP TRIGGER IF EXISTS exam_blueprints_updated_at ON exam_blueprints;
CREATE TRIGGER exam_blueprints_updated_at BEFORE UPDATE ON exam_blueprints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS exam_blueprint_sections_updated_at ON exam_blueprint_sections;
CREATE TRIGGER exam_blueprint_sections_updated_at BEFORE UPDATE ON exam_blueprint_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS exam_course_notes_updated_at ON exam_course_notes;
CREATE TRIGGER exam_course_notes_updated_at BEFORE UPDATE ON exam_course_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS exam_skill_categories_updated_at ON exam_skill_categories;
CREATE TRIGGER exam_skill_categories_updated_at BEFORE UPDATE ON exam_skill_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: public read, admin write (mirror existing reference tables)
ALTER TABLE exam_skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_blueprint_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_course_notes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_skill_categories','exam_blueprints','exam_blueprint_sections','exam_course_notes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_read ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin ON %I', t, t);
    EXECUTE format($f$CREATE POLICY %I_admin ON %I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))$f$, t, t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Verify the tables + column exist**

Call `mcp__supabase__execute_sql` with:
```sql
SELECT count(*) FROM exam_blueprints;
SELECT count(*) FILTER (WHERE skill_category IS NOT NULL) AS tagged, count(*) AS total FROM upcat_questions;
```
Expected: `exam_blueprints` count = 0; `tagged` ≈ `total` (all current questions mapped to a category, ~1261).

- [ ] **Step 3: Verify RLS advisors are clean**

Call `mcp__supabase__get_advisors` with `type: "security"`. Expected: no new "RLS disabled" or "policy missing" findings for the four new tables.

---

### Task 2: Seed the 9 exams from the master DB

**Files:**
- Apply migration `032_seed_exam_blueprints` to project `dtugrsbarruizgzowgso`.

- [ ] **Step 1: Apply the seed migration (idempotent upserts)**

Call `mcp__supabase__apply_migration` with `name: "032_seed_exam_blueprints"` and this SQL:

```sql
-- Categories
INSERT INTO exam_skill_categories (name, requires_spatial_logic, display_order) VALUES
  ('Mathematics', false, 1),
  ('Science', false, 2),
  ('English/Language', false, 3),
  ('Reading Comprehension', false, 4),
  ('Verbal Reasoning', false, 5),
  ('Abstract/Non-Verbal Reasoning', true, 6),
  ('Mechanical-Technical', false, 7),
  ('Spatial', true, 8)
ON CONFLICT (name) DO UPDATE SET requires_spatial_logic = EXCLUDED.requires_spatial_logic, display_order = EXCLUDED.display_order;

-- Blueprints (status published; non-UPCAT exam-unique sections will be empty until authored)
INSERT INTO exam_blueprints (slug,name,acronym,total_items,total_time_minutes,has_guessing_penalty,guessing_penalty,section_blocked,scoring_note,mechanics_note,status,display_order) VALUES
  ('upcat','University of the Philippines College Admission Test','UPCAT',240,300,true,0.25,false,
   'UPG = 0.60×UPCAT raw score + 0.40×HS GWA ± equity weights.',
   'Right-minus-quarter-wrong: a wrong answer deducts 0.25; a blank is 0.0. Calculator prohibited.','published',1),
  ('acet','Ateneo College Entrance Test','ACET',245,270,false,0.25,true,
   'Section percentile ranks; unfinished blocks degrade raw percentiles.',
   'Extreme time pressure — sections are intentionally under-timed and lock on expiry. Calculator prohibited. Includes a mandatory on-site essay, timed separately.','published',2),
  ('ustet','University of Santo Tomas Entrance Test','USTET',265,210,false,0.25,true,
   'Per-subtest baseline cut-offs; missing the cut-off in any single subtest disqualifies high-quota tracks.',
   'Four 45-minute subtests; no carryover of leftover time between sections.','published',3),
  ('dcat-dlsu','De La Salle University College Admission Test','DCAT',240,210,false,0.25,false,
   'No penalty for wrong answers — guessing is statistically advantageous on unfinished sections. Top metrics pipeline into the Archer Achiever Scholarship.',
   'Includes a psychological/personality profiling index (not a scored academic subtest).','published',4),
  ('dost-sei','DOST-SEI Undergraduate Scholarship Qualifying Exam','DOST-SEI',170,190,false,0.25,false,
   'No guessing penalty; raw scores normalized on exam-set variance. National ranking; top qualifiers funded. Requires return of service in PH.',
   'Calculator strictly prohibited (wooden pencil + scratch paper only).','published',5),
  ('sm-foundation','SM Foundation College Scholarship Test','SM',110,90,false,0.25,false,
   'High-velocity speed test; clearing the written cut-off triggers a multi-stage panel interview and home verification.',
   'Speed-focused; numerical + reading/grammar.','published',6),
  ('msu-sase','MSU System Admission and Scholarship Exam','MSU-SASE',180,180,false,0.25,false,
   'High scores activate the MSU Board of Regents (BOR) Scholarship (full tuition + stipend).','','published',7),
  ('bucet','Bicol University College Entrance Test','BUCET',200,180,false,0.25,false,
   'Admission = 60% BUCET entrance score + 40% HS GWA.','','published',8),
  ('wvsu-cat','West Visayas State University College Admission Test','WVSU-CAT',200,120,false,0.25,false,
   'Ultra high-speed pace. BS Nursing requires the 95th percentile or higher to reach the secondary panel.','','published',9)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, acronym=EXCLUDED.acronym, total_items=EXCLUDED.total_items,
  total_time_minutes=EXCLUDED.total_time_minutes, has_guessing_penalty=EXCLUDED.has_guessing_penalty,
  section_blocked=EXCLUDED.section_blocked, scoring_note=EXCLUDED.scoring_note,
  mechanics_note=EXCLUDED.mechanics_note, status=EXCLUDED.status, display_order=EXCLUDED.display_order;

-- Sections. id = '<slug>:<n>' so re-seeding is idempotent.
INSERT INTO exam_blueprint_sections (id,blueprint_slug,name,skill_category,item_count,time_minutes,requires_spatial_logic,display_order) VALUES
  -- UPCAT
  ('upcat:1','upcat','Language Proficiency (English & Filipino)','English/Language',80,NULL,false,1),
  ('upcat:2','upcat','Science','Science',60,NULL,false,2),
  ('upcat:3','upcat','Mathematics','Mathematics',60,NULL,false,3),
  ('upcat:4','upcat','Reading Comprehension','Reading Comprehension',40,NULL,false,4),
  -- ACET (section-blocked → per-section time)
  ('acet:1','acet','Verbal Analogy & English Proficiency','English/Language',90,90,false,1),
  ('acet:2','acet','Numerical Ability & Advanced Mathematics','Mathematics',60,75,false,2),
  ('acet:3','acet','Abstract Reasoning & Logical Sequencing','Abstract/Non-Verbal Reasoning',30,15,true,3),
  -- USTET (45 min each)
  ('ustet:1','ustet','Mental Ability (Spatial, Non-Verbal)','Abstract/Non-Verbal Reasoning',60,45,true,1),
  ('ustet:2','ustet','English','English/Language',80,45,false,2),
  ('ustet:3','ustet','Mathematics','Mathematics',60,45,false,3),
  ('ustet:4','ustet','Science','Science',65,45,false,4),
  -- DCAT
  ('dcat-dlsu:1','dcat-dlsu','Mental Ability / General Intelligence','Abstract/Non-Verbal Reasoning',60,NULL,true,1),
  ('dcat-dlsu:2','dcat-dlsu','Language Usage & Composition','English/Language',60,NULL,false,2),
  ('dcat-dlsu:3','dcat-dlsu','Science','Science',60,NULL,false,3),
  ('dcat-dlsu:4','dcat-dlsu','Mathematics & Introductory Statistics','Mathematics',60,NULL,false,4),
  -- DOST-SEI
  ('dost-sei:1','dost-sei','Verbal Reasoning','Verbal Reasoning',30,NULL,false,1),
  ('dost-sei:2','dost-sei','Non-Verbal / Abstract Reasoning','Abstract/Non-Verbal Reasoning',30,NULL,true,2),
  ('dost-sei:3','dost-sei','English / Language Proficiency','English/Language',30,NULL,false,3),
  ('dost-sei:4','dost-sei','Science','Science',40,NULL,false,4),
  ('dost-sei:5','dost-sei','Mathematics','Mathematics',40,NULL,false,5),
  ('dost-sei:6','dost-sei','Mechanical-Technical Ability','Mechanical-Technical',40,NULL,false,6),
  -- SM Foundation
  ('sm-foundation:1','sm-foundation','Numerical Skill (Algebra & Geometry)','Mathematics',55,NULL,false,1),
  ('sm-foundation:2','sm-foundation','Reading Comprehension & Applied Grammar','English/Language',55,NULL,false,2),
  -- MSU-SASE
  ('msu-sase:1','msu-sase','Language Usage & Communication','English/Language',80,NULL,false,1),
  ('msu-sase:2','msu-sase','Mathematics (Algebra)','Mathematics',40,NULL,false,2),
  ('msu-sase:3','msu-sase','Science (General & Environmental)','Science',30,NULL,false,3),
  ('msu-sase:4','msu-sase','General Aptitude / Abstract Reasoning','Abstract/Non-Verbal Reasoning',30,NULL,true,4),
  -- BUCET
  ('bucet:1','bucet','English Proficiency & Reading Comprehension','English/Language',67,NULL,false,1),
  ('bucet:2','bucet','Mathematics (Algebra, Business Math, Geometry)','Mathematics',67,NULL,false,2),
  ('bucet:3','bucet','Science (Earth Sci, Physics, Biology)','Science',66,NULL,false,3),
  -- WVSU-CAT
  ('wvsu-cat:1','wvsu-cat','Abstract Reasoning Matrix','Abstract/Non-Verbal Reasoning',50,NULL,true,1),
  ('wvsu-cat:2','wvsu-cat','English Language Arts & Communications','English/Language',55,NULL,false,2),
  ('wvsu-cat:3','wvsu-cat','Integrated Science','Science',45,NULL,false,3),
  ('wvsu-cat:4','wvsu-cat','Integrated Mathematics','Mathematics',50,NULL,false,4)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name, skill_category=EXCLUDED.skill_category, item_count=EXCLUDED.item_count,
  time_minutes=EXCLUDED.time_minutes, requires_spatial_logic=EXCLUDED.requires_spatial_logic, display_order=EXCLUDED.display_order;

-- Course notes (light course connection). id = '<slug>:<cluster>'.
INSERT INTO exam_course_notes (id,blueprint_slug,course_cluster,note,min_percentile,display_order) VALUES
  ('upcat:nursing','upcat','Health Sciences','BS Nursing (UP Manila) isolates subtest percentiles — typically 90th+ plus a secondary clinical/panel review.',90,1),
  ('upcat:engineering','upcat','Engineering','College of Engineering (UP Diliman) requires high subtest percentiles (90th+).',90,2),
  ('ustet:highquota','ustet','all','Missing the baseline cut-off in even ONE subtest auto-disqualifies high-quota tracks (Engineering, BS Nursing).',NULL,1),
  ('wvsu-cat:nursing','wvsu-cat','Health Sciences','BS Nursing requires the 95th percentile or higher to reach the secondary panel interview.',95,1),
  ('dcat-dlsu:achiever','dcat-dlsu','all','Exceptional DCAT metrics pipeline candidates into the Archer Achiever Scholarship.',NULL,1)
ON CONFLICT (id) DO UPDATE SET
  course_cluster=EXCLUDED.course_cluster, note=EXCLUDED.note, min_percentile=EXCLUDED.min_percentile, display_order=EXCLUDED.display_order;
```

- [ ] **Step 2: Verify the seed**

Call `mcp__supabase__execute_sql`:
```sql
SELECT (SELECT count(*) FROM exam_blueprints) blueprints,
       (SELECT count(*) FROM exam_blueprint_sections) sections,
       (SELECT count(*) FROM exam_course_notes) notes,
       (SELECT count(*) FROM exam_skill_categories) categories;
```
Expected: `blueprints=9, sections=33, notes=5, categories=8`.

- [ ] **Step 3: Commit a record of the migrations to the repo**

Create `supabase/migrations/031_exam_blueprints.sql` and `supabase/migrations/032_seed_exam_blueprints.sql` containing the exact SQL above (the repo keeps migrations under version control even though they were applied via MCP).

```bash
git add supabase/migrations/031_exam_blueprints.sql supabase/migrations/032_seed_exam_blueprints.sql
git commit -m "feat(db): exam_blueprints schema + seed 9 exams from master DB"
```

---

### Task 3: Mobile Drizzle schema

**Files:**
- Modify: `apps/mobile/db/schema.ts`

- [ ] **Step 1: Add the `skillCategory` column to `upcatQuestions` and the four new tables**

In `apps/mobile/db/schema.ts`, add `skillCategory: text('skill_category')` to the `upcatQuestions` table definition (after `status`), and append these table definitions near the other Epic C/D tables:

```ts
export const examSkillCategories = sqliteTable('exam_skill_categories', {
  name: text('name').primaryKey(),
  requiresSpatialLogic: integer('requires_spatial_logic', { mode: 'boolean' }).notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const examBlueprints = sqliteTable('exam_blueprints', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull().default(''),
  acronym: text('acronym').notNull().default(''),
  totalItems: integer('total_items').notNull().default(0),
  totalTimeMinutes: integer('total_time_minutes').notNull().default(0),
  hasGuessingPenalty: integer('has_guessing_penalty', { mode: 'boolean' }).notNull().default(false),
  guessingPenalty: real('guessing_penalty').notNull().default(0.25),
  sectionBlocked: integer('section_blocked', { mode: 'boolean' }).notNull().default(false),
  scoringNote: text('scoring_note').notNull().default(''),
  mechanicsNote: text('mechanics_note').notNull().default(''),
  status: text('status').notNull().default('draft'),
  displayOrder: integer('display_order').notNull().default(0),
  remoteUpdatedAt: integer('remote_updated_at'),
})

export const examBlueprintSections = sqliteTable('exam_blueprint_sections', {
  id: text('id').primaryKey(),
  blueprintSlug: text('blueprint_slug').notNull(),
  name: text('name').notNull().default(''),
  skillCategory: text('skill_category').notNull().default(''),
  itemCount: integer('item_count').notNull().default(0),
  timeMinutes: integer('time_minutes'),
  requiresSpatialLogic: integer('requires_spatial_logic', { mode: 'boolean' }).notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [index('exam_blueprint_sections_slug_idx').on(t.blueprintSlug)])

export const examCourseNotes = sqliteTable('exam_course_notes', {
  id: text('id').primaryKey(),
  blueprintSlug: text('blueprint_slug').notNull(),
  courseCluster: text('course_cluster').notNull().default('all'),
  note: text('note').notNull().default(''),
  minPercentile: integer('min_percentile'),
  displayOrder: integer('display_order').notNull().default(0),
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [index('exam_course_notes_slug_idx').on(t.blueprintSlug)])
```

> **Critical:** every NOT NULL column above has `.notNull().default(...)`. Omitting the default reintroduces the `is_indigenous` class of bug (see `project_schema_migration_notnull_drift`). The Task 6 repro test guards this.

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -v __tests__ | grep -E "schema|\\.tsx?\\("`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/db/schema.ts
git commit -m "feat(mobile): drizzle schema for exam_blueprints + skill_category"
```

---

### Task 4: Mobile SQLite migrations

**Files:**
- Modify: `apps/mobile/db/client.ts` (append to the `MIGRATIONS` array, before the closing `]`)

- [ ] **Step 1: Append the create/alter migrations**

Add these entries at the END of the `MIGRATIONS` array in `apps/mobile/db/client.ts`:

```ts
  // ── Exam Blueprints (data-driven exam mechanics) ───────────────────────────
  `ALTER TABLE upcat_questions ADD COLUMN skill_category TEXT`,
  `CREATE TABLE IF NOT EXISTS exam_skill_categories (
    name TEXT PRIMARY KEY NOT NULL,
    requires_spatial_logic INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS exam_blueprints (
    slug TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    acronym TEXT NOT NULL DEFAULT '',
    total_items INTEGER NOT NULL DEFAULT 0,
    total_time_minutes INTEGER NOT NULL DEFAULT 0,
    has_guessing_penalty INTEGER NOT NULL DEFAULT 0,
    guessing_penalty REAL NOT NULL DEFAULT 0.25,
    section_blocked INTEGER NOT NULL DEFAULT 0,
    scoring_note TEXT NOT NULL DEFAULT '',
    mechanics_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    display_order INTEGER NOT NULL DEFAULT 0,
    remote_updated_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS exam_blueprint_sections (
    id TEXT PRIMARY KEY NOT NULL,
    blueprint_slug TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    skill_category TEXT NOT NULL DEFAULT '',
    item_count INTEGER NOT NULL DEFAULT 0,
    time_minutes INTEGER,
    requires_spatial_logic INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    remote_updated_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS exam_blueprint_sections_slug_idx ON exam_blueprint_sections (blueprint_slug)`,
  `CREATE TABLE IF NOT EXISTS exam_course_notes (
    id TEXT PRIMARY KEY NOT NULL,
    blueprint_slug TEXT NOT NULL,
    course_cluster TEXT NOT NULL DEFAULT 'all',
    note TEXT NOT NULL DEFAULT '',
    min_percentile INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    remote_updated_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS exam_course_notes_slug_idx ON exam_course_notes (blueprint_slug)`,
```

- [ ] **Step 2: Type-check + run existing useDb test (verifies migrations apply cleanly)**

Run: `cd apps/mobile && npx jest useDb --silent`
Expected: PASS (the DB opens + migrates without error).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/db/client.ts
git commit -m "feat(mobile): SQLite migrations for exam_blueprints tables"
```

---

### Task 5: Sync the new tables to mobile

**Files:**
- Modify: `apps/mobile/services/sync.ts` (inside `syncOnLaunch`)

- [ ] **Step 1: Add the imports + fetch the four tables**

In `apps/mobile/services/sync.ts`, add the four tables to the schema import at the top:
```ts
  admissionsUpdates,
  examSkillCategories, examBlueprints, examBlueprintSections, examCourseNotes,
} from '../db/schema'
```

After the Epic C `Promise.all` block (the one ending with `courseTaxonomyMapRes`), add a new fetch block:
```ts
    // ── Exam Blueprints (full pull — small reference tables) ──────────────────
    const [skillCatRes, blueprintsRes, sectionsRes, courseNotesRes] = await Promise.all([
      supabase.from('exam_skill_categories').select('name,requires_spatial_logic,display_order,updated_at'),
      supabase.from('exam_blueprints').select('slug,name,acronym,total_items,total_time_minutes,has_guessing_penalty,guessing_penalty,section_blocked,scoring_note,mechanics_note,status,display_order,updated_at').eq('status', 'published'),
      supabase.from('exam_blueprint_sections').select('id,blueprint_slug,name,skill_category,item_count,time_minutes,requires_spatial_logic,display_order,updated_at'),
      supabase.from('exam_course_notes').select('id,blueprint_slug,course_cluster,note,min_percentile,display_order,updated_at'),
    ])
```

- [ ] **Step 2: Upsert them inside the existing transaction**

Inside the big `await db.transaction((tx) => { ... })` block in `syncOnLaunch`, add (after the `course_taxonomy_map` loop):
```ts
      for (const row of (skillCatRes.data ?? [])) {
        const vals = { name: row.name, requiresSpatialLogic: !!row.requires_spatial_logic, displayOrder: row.display_order ?? 0, remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null }
        tx.insert(examSkillCategories).values(vals).onConflictDoUpdate({ target: examSkillCategories.name, set: vals }).run()
      }
      for (const row of (blueprintsRes.data ?? [])) {
        const vals = {
          slug: row.slug, name: row.name, acronym: row.acronym ?? '',
          totalItems: row.total_items ?? 0, totalTimeMinutes: row.total_time_minutes ?? 0,
          hasGuessingPenalty: !!row.has_guessing_penalty, guessingPenalty: row.guessing_penalty ?? 0.25,
          sectionBlocked: !!row.section_blocked, scoringNote: row.scoring_note ?? '', mechanicsNote: row.mechanics_note ?? '',
          status: row.status ?? 'draft', displayOrder: row.display_order ?? 0,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(examBlueprints).values(vals).onConflictDoUpdate({ target: examBlueprints.slug, set: vals }).run()
      }
      for (const row of (sectionsRes.data ?? [])) {
        const vals = {
          id: row.id, blueprintSlug: row.blueprint_slug, name: row.name, skillCategory: row.skill_category ?? '',
          itemCount: row.item_count ?? 0, timeMinutes: row.time_minutes ?? null,
          requiresSpatialLogic: !!row.requires_spatial_logic, displayOrder: row.display_order ?? 0,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(examBlueprintSections).values(vals).onConflictDoUpdate({ target: examBlueprintSections.id, set: vals }).run()
      }
      for (const row of (courseNotesRes.data ?? [])) {
        const vals = {
          id: row.id, blueprintSlug: row.blueprint_slug, courseCluster: row.course_cluster ?? 'all',
          note: row.note ?? '', minPercentile: row.min_percentile ?? null, displayOrder: row.display_order ?? 0,
          remoteUpdatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
        }
        tx.insert(examCourseNotes).values(vals).onConflictDoUpdate({ target: examCourseNotes.id, set: vals }).run()
      }
```

- [ ] **Step 3: Add `skill_category` to the upcat_questions sync select + insert**

In the existing `upcat_questions` paginated fetch select string, append `,skill_category`. In the existing upcat_questions upsert `vals`, add `skillCategory: row.skill_category ?? null,`.

- [ ] **Step 4: Update the sync test mock + run it**

In `apps/mobile/services/__tests__/sync.test.ts`, the builders that fall through to `emptyChain` already support `.select().eq().then()`, so the four new `.select()` calls resolve to `{ data: [] }` by default — no change needed for existing tests. Run:
`cd apps/mobile && npx jest sync.test --silent`
Expected: PASS (29 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/sync.ts
git commit -m "feat(mobile): sync exam_blueprints tables + skill_category into SQLite"
```

---

### Task 6: Real-SQLite repro test (schema + sync drift guard)

**Files:**
- Create: `apps/mobile/db/__tests__/examBlueprints.repro.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { examBlueprints, examBlueprintSections } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column */ } }
  return drizzle(raw, { schema })
}

describe('exam_blueprints — real CREATE_SQL + MIGRATIONS', () => {
  it('inserts a blueprint + section without NOT NULL violations (drift guard)', async () => {
    const db = makeDb()
    await db.insert(examBlueprints).values({ slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', totalItems: 240, totalTimeMinutes: 300, hasGuessingPenalty: true })
    await db.insert(examBlueprintSections).values({ id: 'upcat:1', blueprintSlug: 'upcat', name: 'Mathematics', skillCategory: 'Mathematics', itemCount: 60 })
    const bp = await db.select().from(examBlueprints).where(eq(examBlueprints.slug, 'upcat')).limit(1)
    expect(bp[0]?.hasGuessingPenalty).toBe(true)
    expect(bp[0]?.guessingPenalty).toBe(0.25)
    const sec = await db.select().from(examBlueprintSections).where(eq(examBlueprintSections.blueprintSlug, 'upcat'))
    expect(sec[0]?.itemCount).toBe(60)
    expect(sec[0]?.timeMinutes).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd apps/mobile && npx jest examBlueprints.repro --silent`
Expected: PASS (if it FAILS with a NOT NULL violation, a schema column is missing `.notNull().default()` — fix the schema, do not change the test).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/db/__tests__/examBlueprints.repro.test.ts
git commit -m "test(mobile): real-SQLite drift guard for exam_blueprints"
```

---

### Task 7: `getExamBlueprint` data-access helper

**Files:**
- Create: `apps/mobile/services/examBlueprints.ts`
- Test: `apps/mobile/services/__tests__/examBlueprints.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { examBlueprints, examBlueprintSections, examCourseNotes } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import { getExamBlueprint, listPublishedBlueprintSlugs } from '../examBlueprints'

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch {} }
  return drizzle(raw, { schema }) as any
}

describe('getExamBlueprint', () => {
  it('returns the blueprint with its sections (ordered) and course notes', async () => {
    const db = makeDb()
    await db.insert(examBlueprints).values({ slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', status: 'published', totalTimeMinutes: 300 })
    await db.insert(examBlueprintSections).values([
      { id: 'upcat:2', blueprintSlug: 'upcat', name: 'Science', skillCategory: 'Science', itemCount: 60, displayOrder: 2 },
      { id: 'upcat:1', blueprintSlug: 'upcat', name: 'Math', skillCategory: 'Mathematics', itemCount: 60, displayOrder: 1 },
    ])
    await db.insert(examCourseNotes).values({ id: 'upcat:nursing', blueprintSlug: 'upcat', courseCluster: 'Health Sciences', note: '90th+' })
    const bp = await getExamBlueprint(db, 'upcat')
    expect(bp?.name).toBe('UPCAT')
    expect(bp?.sections.map((s: any) => s.name)).toEqual(['Math', 'Science'])
    expect(bp?.courseNotes[0]?.note).toBe('90th+')
  })

  it('returns null for an unknown or unpublished slug', async () => {
    const db = makeDb()
    expect(await getExamBlueprint(db, 'nope')).toBeNull()
  })

  it('lists only published blueprint slugs', async () => {
    const db = makeDb()
    await db.insert(examBlueprints).values([
      { slug: 'upcat', name: 'UPCAT', status: 'published', displayOrder: 1 },
      { slug: 'acet', name: 'ACET', status: 'draft', displayOrder: 2 },
    ])
    expect(await listPublishedBlueprintSlugs(db)).toEqual(['upcat'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest "services/__tests__/examBlueprints" --silent`
Expected: FAIL ("getExamBlueprint is not a function").

- [ ] **Step 3: Implement the helper**

Create `apps/mobile/services/examBlueprints.ts`:
```ts
import { eq, asc } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { examBlueprints, examBlueprintSections, examCourseNotes } from '../db/schema'

export interface BlueprintSection {
  id: string; name: string; skillCategory: string; itemCount: number
  timeMinutes: number | null; requiresSpatialLogic: boolean; displayOrder: number
}
export interface ExamBlueprint {
  slug: string; name: string; acronym: string; totalItems: number; totalTimeMinutes: number
  hasGuessingPenalty: boolean; guessingPenalty: number; sectionBlocked: boolean
  scoringNote: string; mechanicsNote: string
  sections: BlueprintSection[]
  courseNotes: { courseCluster: string; note: string; minPercentile: number | null }[]
}

/** Load a single PUBLISHED blueprint + its ordered sections + course notes, or null. */
export async function getExamBlueprint(db: DrizzleClient, slug: string): Promise<ExamBlueprint | null> {
  const rows = await db.select().from(examBlueprints).where(eq(examBlueprints.slug, slug)).limit(1)
  const bp = rows[0]
  if (!bp || bp.status !== 'published') return null
  const sections = await db.select().from(examBlueprintSections)
    .where(eq(examBlueprintSections.blueprintSlug, slug)).orderBy(asc(examBlueprintSections.displayOrder))
  const notes = await db.select().from(examCourseNotes)
    .where(eq(examCourseNotes.blueprintSlug, slug)).orderBy(asc(examCourseNotes.displayOrder))
  return {
    slug: bp.slug, name: bp.name, acronym: bp.acronym, totalItems: bp.totalItems, totalTimeMinutes: bp.totalTimeMinutes,
    hasGuessingPenalty: !!bp.hasGuessingPenalty, guessingPenalty: bp.guessingPenalty, sectionBlocked: !!bp.sectionBlocked,
    scoringNote: bp.scoringNote, mechanicsNote: bp.mechanicsNote,
    sections: sections.map(s => ({
      id: s.id, name: s.name, skillCategory: s.skillCategory, itemCount: s.itemCount,
      timeMinutes: s.timeMinutes ?? null, requiresSpatialLogic: !!s.requiresSpatialLogic, displayOrder: s.displayOrder,
    })),
    courseNotes: notes.map(n => ({ courseCluster: n.courseCluster, note: n.note, minPercentile: n.minPercentile ?? null })),
  }
}

/** Published blueprint slugs, in display order — drives which listings can launch a mock. */
export async function listPublishedBlueprintSlugs(db: DrizzleClient): Promise<string[]> {
  const rows = await db.select({ slug: examBlueprints.slug, status: examBlueprints.status, order: examBlueprints.displayOrder })
    .from(examBlueprints).orderBy(asc(examBlueprints.displayOrder))
  return rows.filter(r => r.status === 'published').map(r => r.slug)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mobile && npx jest "services/__tests__/examBlueprints" --silent`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/examBlueprints.ts apps/mobile/services/__tests__/examBlueprints.test.ts
git commit -m "feat(mobile): getExamBlueprint + listPublishedBlueprintSlugs helpers"
```

---

### Task 8: Full verification + OTA

- [ ] **Step 1: Full mobile suite + tsc**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -v __tests__ | grep -E "\\.tsx?\\(" ; npx jest --silent 2>&1 | tail -4`
Expected: app source type-clean; all suites pass (665+ tests).

- [ ] **Step 2: Publish OTA (data + sync are JS/DB-only, OTA-deliverable)**

```bash
cd apps/mobile && npx eas-cli@latest update --branch production --message "feat: exam blueprints data + sync (phase 1)" --non-interactive
```

- [ ] **Step 3: Push**

```bash
git push origin master
```

---

## Self-Review

**Spec coverage:**
- Data model (4 tables + `skill_category`) → Tasks 1, 3, 4. ✓
- Seed 9 exams + sections + course notes → Task 2. ✓
- Sync to mobile (paginated for upcat_questions already; new tables small, full-pull) → Task 5. ✓
- Category backfill from subtest → Task 1 Step 1. ✓
- NOT-NULL drift guard (the named risk) → Task 6 real-SQLite test + the `.notNull().default()` discipline in Task 3. ✓
- `getExamBlueprint` for Phase 2 → Task 7. ✓
- RLS public-read/admin-write → Task 1 Step 1 + advisor check Step 3. ✓
- OWWA/CHED have no blueprint (note-only) → not seeded as blueprints (correct per spec). ✓

**Out of scope here (later phases):** mobile generic engine (Phase 2), admin CRUD UI + question category picker (Phase 3), launch points (Phase 4). Not in this plan.

**Type consistency:** `examBlueprints`/`examBlueprintSections`/`examCourseNotes`/`examSkillCategories` names match across schema (Task 3), sync (Task 5), and helper (Task 7). Column `skillCategory`↔`skill_category`, `blueprintSlug`↔`blueprint_slug` consistent. `getExamBlueprint` + `listPublishedBlueprintSlugs` signatures match between test (Task 7 Step 1) and impl (Step 3).

**Placeholder scan:** none — all SQL/TS/commands are complete.
