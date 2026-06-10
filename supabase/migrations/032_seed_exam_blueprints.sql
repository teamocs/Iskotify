-- Seed the 9 PH entrance exams that administer a test, from the master DB
-- (review_items_and_mechanics). Idempotent upserts. OWWA (uses DOST scores) and
-- CHED CMSP (exempt from testing) administer no exam of their own and are not
-- seeded as blueprints — they are scholarship selection rules, not mock exams.

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

INSERT INTO exam_blueprint_sections (id,blueprint_slug,name,skill_category,item_count,time_minutes,requires_spatial_logic,display_order) VALUES
  ('upcat:1','upcat','Language Proficiency (English & Filipino)','English/Language',80,NULL,false,1),
  ('upcat:2','upcat','Science','Science',60,NULL,false,2),
  ('upcat:3','upcat','Mathematics','Mathematics',60,NULL,false,3),
  ('upcat:4','upcat','Reading Comprehension','Reading Comprehension',40,NULL,false,4),
  ('acet:1','acet','Verbal Analogy & English Proficiency','English/Language',90,90,false,1),
  ('acet:2','acet','Numerical Ability & Advanced Mathematics','Mathematics',60,75,false,2),
  ('acet:3','acet','Abstract Reasoning & Logical Sequencing','Abstract/Non-Verbal Reasoning',30,15,true,3),
  ('ustet:1','ustet','Mental Ability (Spatial, Non-Verbal)','Abstract/Non-Verbal Reasoning',60,45,true,1),
  ('ustet:2','ustet','English','English/Language',80,45,false,2),
  ('ustet:3','ustet','Mathematics','Mathematics',60,45,false,3),
  ('ustet:4','ustet','Science','Science',65,45,false,4),
  ('dcat-dlsu:1','dcat-dlsu','Mental Ability / General Intelligence','Abstract/Non-Verbal Reasoning',60,NULL,true,1),
  ('dcat-dlsu:2','dcat-dlsu','Language Usage & Composition','English/Language',60,NULL,false,2),
  ('dcat-dlsu:3','dcat-dlsu','Science','Science',60,NULL,false,3),
  ('dcat-dlsu:4','dcat-dlsu','Mathematics & Introductory Statistics','Mathematics',60,NULL,false,4),
  ('dost-sei:1','dost-sei','Verbal Reasoning','Verbal Reasoning',30,NULL,false,1),
  ('dost-sei:2','dost-sei','Non-Verbal / Abstract Reasoning','Abstract/Non-Verbal Reasoning',30,NULL,true,2),
  ('dost-sei:3','dost-sei','English / Language Proficiency','English/Language',30,NULL,false,3),
  ('dost-sei:4','dost-sei','Science','Science',40,NULL,false,4),
  ('dost-sei:5','dost-sei','Mathematics','Mathematics',40,NULL,false,5),
  ('dost-sei:6','dost-sei','Mechanical-Technical Ability','Mechanical-Technical',40,NULL,false,6),
  ('sm-foundation:1','sm-foundation','Numerical Skill (Algebra & Geometry)','Mathematics',55,NULL,false,1),
  ('sm-foundation:2','sm-foundation','Reading Comprehension & Applied Grammar','English/Language',55,NULL,false,2),
  ('msu-sase:1','msu-sase','Language Usage & Communication','English/Language',80,NULL,false,1),
  ('msu-sase:2','msu-sase','Mathematics (Algebra)','Mathematics',40,NULL,false,2),
  ('msu-sase:3','msu-sase','Science (General & Environmental)','Science',30,NULL,false,3),
  ('msu-sase:4','msu-sase','General Aptitude / Abstract Reasoning','Abstract/Non-Verbal Reasoning',30,NULL,true,4),
  ('bucet:1','bucet','English Proficiency & Reading Comprehension','English/Language',67,NULL,false,1),
  ('bucet:2','bucet','Mathematics (Algebra, Business Math, Geometry)','Mathematics',67,NULL,false,2),
  ('bucet:3','bucet','Science (Earth Sci, Physics, Biology)','Science',66,NULL,false,3),
  ('wvsu-cat:1','wvsu-cat','Abstract Reasoning Matrix','Abstract/Non-Verbal Reasoning',50,NULL,true,1),
  ('wvsu-cat:2','wvsu-cat','English Language Arts & Communications','English/Language',55,NULL,false,2),
  ('wvsu-cat:3','wvsu-cat','Integrated Science','Science',45,NULL,false,3),
  ('wvsu-cat:4','wvsu-cat','Integrated Mathematics','Mathematics',50,NULL,false,4)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name, skill_category=EXCLUDED.skill_category, item_count=EXCLUDED.item_count,
  time_minutes=EXCLUDED.time_minutes, requires_spatial_logic=EXCLUDED.requires_spatial_logic, display_order=EXCLUDED.display_order;

INSERT INTO exam_course_notes (id,blueprint_slug,course_cluster,note,min_percentile,display_order) VALUES
  ('upcat:nursing','upcat','Health Sciences','BS Nursing (UP Manila) isolates subtest percentiles — typically 90th+ plus a secondary clinical/panel review.',90,1),
  ('upcat:engineering','upcat','Engineering','College of Engineering (UP Diliman) requires high subtest percentiles (90th+).',90,2),
  ('ustet:highquota','ustet','all','Missing the baseline cut-off in even ONE subtest auto-disqualifies high-quota tracks (Engineering, BS Nursing).',NULL,1),
  ('wvsu-cat:nursing','wvsu-cat','Health Sciences','BS Nursing requires the 95th percentile or higher to reach the secondary panel interview.',95,1),
  ('dcat-dlsu:achiever','dcat-dlsu','all','Exceptional DCAT metrics pipeline candidates into the Archer Achiever Scholarship.',NULL,1)
ON CONFLICT (id) DO UPDATE SET
  course_cluster=EXCLUDED.course_cluster, note=EXCLUDED.note, min_percentile=EXCLUDED.min_percentile, display_order=EXCLUDED.display_order;
