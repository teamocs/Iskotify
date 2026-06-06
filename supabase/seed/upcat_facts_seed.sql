-- upcat_facts seed (Epic A / Kuya Baw RAG) — source: kuya_baw_upcat_context.txt (Jun 2026)
-- Re-running this file is idempotent: ON CONFLICT (id) DO UPDATE

-- ============================================================
-- OVERVIEW (Parts 1, 6, 15)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('overview-01', 'Overview', 'What is UPCAT?', 'UPCAT stands for the University of the Philippines College Admission Test. It is the qualifying exam required for anyone who wants to study at the University of the Philippines — the #1 university in the Philippines and home of the Iskolar ng Bayan.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('overview-02', 'Overview', 'How competitive is the UPCAT?', 'Only about 12–15% of applicants pass the UPCAT each year, making it one of the most competitive college entrance exams in the Philippines. The UP system has around 15,000 freshman slots per year while 100,000–150,000 students take the exam.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('overview-03', 'Overview', 'What was the UPCAT passing rate for AY 2026–2027?', 'For AY 2026–2027, 18,350 students passed out of 147,437 applicants — a passing rate of 12.45%.', 'UP Office of Admissions', 2026)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('overview-04', 'Overview', 'What share of UPCAT passers come from public schools?', 'More than 57% of UPCAT passers come from public schools each year.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('overview-05', 'Overview', 'When is the UPCAT held and when are results released?', 'UPCAT is held once a year, usually in August (over 2 days). Results are released around January of the following year.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('overview-06', 'Overview', 'Why is the UPCAT so difficult to pass?', 'Limited slots across the UP system, a growing applicant pool, and an exam that compresses 5 years of high school subjects into 4 hours all make UPCAT highly competitive. Strategy, time management, and mental preparation matter as much as raw academics.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('overview-07', 'Overview', 'Where can I find the official UPCAT website?', 'The official UPCAT website is https://upcat.up.edu.ph. Always check it for the current cycle''s application link, deadlines, and results — details change every year.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- ELIGIBILITY (Part 2)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('eligibility-01', 'Eligibility', 'Sino ang pwedeng kumuha ng UPCAT?', 'Pwedeng mag-UPCAT ang isang estudyante na may final grades para sa Grade 8, 9, 10, at Grade 11, at hindi pa nakapagtake ng UPCAT noon, hindi pa nakapagsagawa ng any college subject, at hindi pa naka-complete ng UP College Application (UPCA) sa nakaraang taon. UPCAT is for incoming freshmen only.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('eligibility-02', 'Eligibility', 'Ilang beses pwedeng mag-take ng UPCAT?', 'Isang beses lang. Hindi pwedeng mag-retake ng UPCAT — one shot, one chance lang.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('eligibility-03', 'Eligibility', 'Can a student who has already taken college subjects take the UPCAT?', 'No. If you have already taken any college subject before the opening of the school year you are applying for, you are not eligible to take the UPCAT.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('eligibility-04', 'Eligibility', 'What grades does UP require during UPCAT application?', 'Applicants must submit their final grades for Grade 8, 9, 10, and Grade 11. These grades form part of the UPG calculation — specifically, the weighted average in Science, Math, and English from Grades 9–11 for K-12 students.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- APPLICATION (Parts 3, 15)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('application-01', 'Application', 'How do I apply for UPCAT?', 'Go to the official UPCAT online application portal (check upcat.up.edu.ph for the current year''s link), fill out all required information (name, birthday, school, grades, province, campus choices, course choices), and have your school confirm your application via the Form 2A portal.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('application-02', 'Application', 'What documents do I need to submit after the UPCAT exam?', 'After the exam, submit your Form 2B (grades) and a certified true copy of your SF-10 (Student Permanent Record) to the UP Office of Admissions in UP Diliman, QC. Failure to submit these can result in a "Pending" result.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('application-03', 'Application', 'Is UPCAT application first-come, first-serve?', 'No, UPCAT application is NOT first-come, first-serve. However, you must still complete your application before the deadline. Missing the deadline means missing the cycle entirely.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('application-04', 'Application', 'What campus and course choices do I make during the UPCAT application?', 'During application you choose your 1st and 2nd campus choices and your degree program choices. These choices heavily affect your chances because ranking, cutoffs, pabigat penalties, and the Geographic Equity Round all depend on your campus selection.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- TIMELINE (Part 3)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('timeline-01', 'Timeline', 'What is the typical UPCAT application timeline?', 'Typical cycle (specific dates change yearly): Online application opens ~February–March; school officials confirm via Form 2A ~March–April; test permits released ~July; UPCAT exam ~August (2 days); Form 2B grade submission ~August after exam; SF-10 hard copy submission ~August–September; results released ~January of the following year. Always verify at upcat.up.edu.ph.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('timeline-02', 'Timeline', 'When is the UPCAT test permit released?', 'Test permits are typically released around July, about a month before the exam. Check your UPCAT application account and the official site at upcat.up.edu.ph for the exact date each year.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('timeline-03', 'Timeline', 'When are UPCAT results released?', 'UPCAT results are typically released around January of the year following the exam (e.g., results for the August 2026 exam would come out around January 2027). Check upcat.up.edu.ph for the official release date.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- SUBTESTS (Part 4)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-01', 'Subtests', 'What are the four subtests of the UPCAT?', 'The UPCAT has four subtests: Language Proficiency (English + Filipino, ~140 items), Reading Comprehension (English + Filipino, part of the LP section), Science (60 items, ~40 mins), and Mathematics (60 items, ~60 mins). The total exam is approximately 4 hours.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-math-01', 'Subtests', 'What topics are covered in the UPCAT Math subtest?', 'The Math subtest covers: Basic Algebra (algebraic expressions, imaginary numbers, rational expressions), Advanced Algebra (functions, domain/range, asymptotes, sequences), Pre-Calculus/Statistics (limits, differentiation, central tendency, probability), Geometry (planes, triangles, circles, solid geometry), and Trigonometry (trig functions, identities, equations, word problems).', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-science-01', 'Subtests', 'What topics are covered in the UPCAT Science subtest?', 'The Science subtest covers: General Science (minerals, planets, rocks, geological stress, Earth''s history), Biology (body systems, ecology, genetics, macromolecules, plant anatomy), Chemistry (matter, periodic table, SI measurement, chemical reactions), and Physics (motion/forces, optics, electromagnetism, waves, radiation).', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-lp-01', 'Subtests', 'What topics are covered in the UPCAT Language Proficiency subtest?', 'Language Proficiency covers grammar and structure (find the error, complete the sentence, sentence rearrangement), vocabulary (synonyms, antonyms, word meanings), and analogy questions.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-rc-01', 'Subtests', 'What does the UPCAT Reading Comprehension subtest cover?', 'Reading Comprehension includes reading passages in both English and Filipino, plus analogy questions. It is combined with Language Proficiency in the same time block (~60 mins).', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-scoring-01', 'Subtests', 'How is the UPCAT scored? Is there a penalty for wrong answers?', 'Correct answers earn +1 point. Wrong answers incur a -¼ (0.25) penalty. Blank/skipped answers score 0. This is called correct-minus-wrong scoring.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-scoring-02', 'Subtests', 'Okay lang bang mag-guess sa UPCAT?', 'Yes, mathematically better pa ang mag-guess kaysa mag-iwan ng blank. With 4 choices and a ¼ penalty, random guessing 100 items statistically yields about +6.25 net points. Kung ma-eliminate mo pa kahit 1 maling pagpipilian, mas maganda pa ang odds mo. Educated guessing is always better than leaving items blank.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-rules-01', 'Subtests', 'What are the rules during the UPCAT exam proper?', 'There are no official breaks — the exam is 4 straight hours (you can self-break but the timer keeps running). You may go to the restroom one at a time, leaving all papers behind. Scratch paper is provided; ask for more if needed. You and your seatmate likely have different test sets so copying is pointless.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- ALGORITHM / UPG (Parts 5, 8)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-upg-01', 'Algorithm/UPG', 'What is the UPG?', 'The UPG (University Predicted Grade) is your overall admission score for UP. It was first developed in 1976 by UP Professor Dr. Romeo Manlapaz Jr. as a tool to predict how well an applicant will perform if admitted to UP. A lower UPG is better — 1.0 is the best possible, similar to UP''s GWA system.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-upg-02', 'Algorithm/UPG', 'How is the UPG computed in simple terms?', 'In simple terms: UPG = 60% UPCAT score + 40% high school grades. The high school grades component uses your weighted average in Science, Math, and English from Grades 9–11 for K-12 students.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-upg-03', 'Algorithm/UPG', 'What is the technical UPG formula?', 'UPG = 2.8101 − 0.047147(ZMA) − 0.046402(ZRC) − 0.1381(ZLP) − 0.15531(ZHSWA) − 0.025178(ZSC × ZLP × ZHSWA), where ZMA = standardized Math score, ZRC = standardized Reading Comprehension score, ZLP = standardized Language Proficiency score, ZSC = standardized Science score, and ZHSWA = standardized High School Weighted Average.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-upg-04', 'Algorithm/UPG', 'Bakit hindi ko ma-compute ang sarili ko''ng UPG?', 'Hindi mo makukuha ang exact UPG mo kasi nag-aaply muna ang UP ng standardization at transmutation sa iyong grades bago gamitin. Nag-iingat ang UP ng records para sa 160+ grading systems ng mga paaralan sa buong bansa at ina-adjust nila para sa grade inflation at iba''t ibang school standards.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-upg-05', 'Algorithm/UPG', 'How does UP handle grade inflation from different schools?', 'UP maintains a database of 160+ school grading systems nationwide. They transmute and standardize your grades based on historical data from your specific school. A 98% from a school with grade inflation is treated differently from a 98% at a school with strict standards. For newly established schools, UP clusters them by type, size, and location to approximate the adjustment.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-upg-06', 'Algorithm/UPG', 'Saan ko makikita ang aking UPG?', 'Kung FAILED ka: makikita mo ang iyong UPG sa iyong UPCAT application account — inilalabas ito ng UP para makapag-file ka ng reconsideration/appeal. Kung PASSED ka: hindi agad makita ang UPG mo; maaari mo itong hilingin sa UP Office of the University Registrar (OUR) kapag naka-enroll ka na.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-eeas-01', 'Algorithm/UPG', 'What is the EEAS (Excellence-Equity Admissions System)?', 'The Excellence-Equity Admissions System (EEAS) was introduced in 1996. After computing the base UPG, UP applies adjustments called palugit (bonus) and pabigat (penalty) to produce the EPG (Effective Predicted Grade) used for final ranking.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-palugit-01', 'Algorithm/UPG', 'What is the palugit and who gets it?', 'The palugit is a bonus of about 0.05 applied to your UPG (lowering it / making it better) — per the original EEAS committee figure (Lontoc 2011); some secondary sources cite 0.5, which is incorrect. You receive it if you attended a public general, public vocational, or public barangay national high school, or belong to a cultural minority group. Public science high schools, SUC-administered high schools, and private schools do NOT receive the palugit.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-pabigat-01', 'Algorithm/UPG', 'What is the pabigat and when does it apply?', 'The pabigat is a −0.5 penalty applied to your UPG (making it higher/worse). It is applied when you choose a UP campus that is geographically far from where you live — for example, a Metro Manila student choosing UP Visayas or UP Mindanao, or a Bicol student choosing UP Visayas. The exception is if the campus offers a unique program not available elsewhere.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-pabigat-02', 'Algorithm/UPG', 'Why does UP apply a pabigat for choosing a far-away campus?', 'Regional UP campuses are meant to serve students from their own region. The pabigat discourages students from using provincial campuses as a backdoor to eventually transfer to UP Diliman, which would undermine UP''s goal of geographic equity.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-quota-01', 'Algorithm/UPG', 'How does the 70% quota round work?', '70% of each campus''s freshman slots go to the top-ranked EPG scorers who chose that campus as their 1st or 2nd choice. For example, if UP Manila has ~1,120 slots, about 784 (70%) go to the top 784 applicants who chose UP Manila. The more applicants competing for a campus, the higher the cutoff.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-ger-01', 'Algorithm/UPG', 'What is the Geographic Equity Round (GER)?', 'The Geographic Equity Round (GER) distributes the remaining 30% of each campus''s slots. UP identifies underrepresented provinces where few students have historically gotten in, and gives priority to students from those areas whose scores narrowly missed the top 70% cutoff. This ensures national representation.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-ger-02', 'Algorithm/UPG', 'Bakit may mas mababa ang score na pumasa kaysa sa akin?', 'Dalawang pangunahing dahilan: (1) Palugit — public high school students get a +0.5 UPG bonus na hindi nakukuha ng private school students. (2) Geographic Equity Round — students from underrepresented provinces get priority in the 30% equity slots, even if their UPG is slightly higher (worse) than yours.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-courses-01', 'Algorithm/UPG', 'How does course admission work for quota courses?', 'After passing a campus, UP checks your subtest scores for high-demand (quota) courses: Engineering/Math courses require a high Math subtest score; Biology/Chemistry/Physics require a high Science subtest score; Social Sciences/Humanities require balanced LP and RC scores. You must pass the campus first before course eligibility is evaluated.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-courses-02', 'Algorithm/UPG', 'Mas madaling pumasa kung mag-choose ako ng non-quota course?', 'Partly true, partly misleading. You still need to pass the CAMPUS first — the campus cutoff is the same regardless of your course choice. But once you pass the campus, less in-demand courses are indeed easier to get into. The smarter strategy: focus on choosing the right CAMPUS, then choose your preferred course.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- RESULTS (Part 6)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('results-01', 'Results', 'What are the possible UPCAT results?', 'There are four possible results: (1) Passed — admitted to a specific campus and degree program; (2) DPWAS — passed the campus but not your chosen courses, must pick from available slots; (3) Pending — result is conditional due to missing documents like SF-10; (4) Failed — did not qualify this cycle.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('results-02', 'Results', 'What is DPWAS?', 'DPWAS stands for Degree Program With Available Slot. It means you passed the UP campus but were not admitted to any of your chosen degree programs. You are still a UP passer — you just need to choose from whatever degree programs in that campus still have open slots.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('results-03', 'Results', 'What does a "Pending" UPCAT result mean?', 'A Pending result means your application has a conditional hold — usually because you have missing documents such as the hard copy of your SF-10. You must submit the required documents to the UP Office of Admissions as soon as possible to finalize your result.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('results-04', 'Results', 'Pwede bang mag-appeal kung hindi pumasa sa UPCAT?', 'Yes. UP has an appeals/reconsideration process after results are released. Check the official UPCAT website (upcat.up.edu.ph) for appeal procedures and deadlines — they vary per cycle.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- CAMPUSES (Parts 7, 11)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('campuses-01', 'Campuses', 'What are the UP campuses that accept freshmen through UPCAT?', 'The eight UP campuses that accept freshmen are: UP Diliman, UP Manila, UP Los Baños, UP Baguio, UP Cebu, UP Visayas, UP Mindanao, and UP Open University. Each has its own cutoff, quota, and regional considerations.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('campuses-02', 'Campuses', 'What were the approximate UPG cutoffs per campus based on the 2019 UPCAT?', 'Approximate cutoffs from 2019 (reference only — cutoffs change every year): UP Diliman ~2.174, UP Baguio ~2.421, UP Manila ~2.580, UP Cebu ~2.700, UP Los Baños ~2.800, UP Mindanao ~2.800, UP Open University ~2.800, UP Visayas ~2.800. Lower UPG = better. Always check the latest official data at upcat.up.edu.ph.', 'RMB/Iskotify UPCAT context (Jun 2026)', 2019)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('campuses-03', 'Campuses', 'Which UP campus is the hardest to get into?', 'UP Diliman consistently has the lowest UPG cutoff (i.e., hardest to get into), followed by UP Manila. They attract the highest number of applicants, which drives up competition. UP regional campuses generally have higher (more accessible) cutoffs.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('campuses-04', 'Campuses', 'How many freshman slots does UP Manila have approximately?', 'UP Manila has approximately 1,120 freshman slots per year. About 70% (~784 slots) go to the top-ranked applicants who chose UP Manila in the regular quota round, with the remaining 30% reserved for the Geographic Equity Round.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- STRATEGY / CAMPUS CHOICE (Parts 8, 9, 11)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-campus-01', 'Strategy', 'What is the best campus choice strategy for less confident applicants?', 'Pair one more competitive campus (e.g., UP Diliman, UP Manila) as your 1st choice with a more accessible campus (e.g., UP Mindanao, UP Cebu) as your 2nd — BUT watch out for the pabigat penalty if your 2nd choice is geographically far from your region. One competitive + one accessible is a smarter strategy than picking both hardest campuses.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-campus-02', 'Strategy', 'What campus choices are safe for Bicol or Luzon students to avoid pabigat?', 'For Bicol/Luzon students, good accessible campuses without a pabigat penalty are UP Baguio, UP Los Baños, and UP Diliman — all in Luzon. Choosing UP Visayas or UP Mindanao as a Luzon student will incur a pabigat.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-campus-03', 'Strategy', 'What campus strategy works best for Visayas students?', 'For Visayas students, UP Visayas is the natural campus choice with no pabigat. A common balanced strategy is choosing UP Diliman as 1st choice and UP Visayas as 2nd choice.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-campus-04', 'Strategy', 'What campus strategy works best for Mindanao students?', 'For Mindanao students, UP Mindanao is the natural campus with no pabigat. Some unique programs exclusive to UP Mindanao make it worth considering as a 1st choice. Choosing a Luzon or Visayas campus as a Mindanao student may attract a pabigat.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-time-01', 'Strategy', 'What is the best time-management strategy for UPCAT?', 'Skim and skip: quickly scan each subtest, skip hard items, and answer easy ones first (every question is worth the same 1 point). Budget roughly 1 minute per item. Work backwards on Math/Science by plugging in answer choices instead of solving from scratch. Educated guessing beats leaving items blank.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-time-02', 'Strategy', 'Is there a shortcut strategy for Math and Science computation problems in UPCAT?', 'Yes — for computation problems, try plugging in the answer choices instead of solving from scratch. It is often faster than deriving the solution. Also, identifying the correct order of magnitude can quickly eliminate wrong choices.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-review-01', 'Strategy', 'Is UPCAT review necessary?', 'Yes — especially in today''s competitive environment. A good review program identifies the most testable topics so you study smart. Exposure to mock exams builds mental stamina, reduces exam-day panic, and trains time management skills that cannot come from book knowledge alone.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-review-02', 'Strategy', 'What subjects does the RMB/Iskotify UPCAT review cover?', 'The RMB/Iskotify review covers: Math (Basic Algebra, Advanced Algebra, Pre-Calc/Statistics, Geometry, Trigonometry), Science (General Science, Biology, Chemistry, Physics), and English (Language Proficiency, Reading Comprehension, Grammar, Vocabulary, Analogy).', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-valedictorian-01', 'Strategy', 'Why do some valedictorians fail UPCAT while students with lower grades pass?', 'Several reasons: (1) Grade standardization — UP corrects for grade inflation, so a valedictorian from an easy-grading school may have their grades adjusted downward. (2) Campus choice — choosing only UP Diliman and UP Manila (the two hardest) without reaching either cutoff means failing. (3) Geographic Equity — students from underrepresented provinces may get GER slots. (4) No palugit for private school or science HS students. (5) Exam strategy and time-pressure performance.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- UPCAT DAY TIPS (Part 10)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-examday-01', 'Strategy', 'What should I bring on UPCAT exam day?', 'Bring: test permit, valid ID, 2+ pencils (bring extras), an analog wristwatch (no smartwatches allowed on your desk), a jacket AND a fan/pamaypay (room temperature is unpredictable), and light snacks (avoid heavy food that causes drowsiness).', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-examday-02', 'Strategy', 'What should I do the day before the UPCAT exam?', 'Scout the testing venue 1–2 days before to find your building and room. Rest the day before — do NOT cram the night before. Get at least 7–8 hours of sleep. Consider staying at a hotel near the testing center if you live far away. Don''t bring your reviewers to the exam.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-examday-03', 'Strategy', 'What are the most common shading mistakes to avoid during UPCAT?', 'Shade very carefully — wrong shading is a common mistake that costs points. Make sure you are shading the correct item number (it is easy to get off by one). Write your name on everything. Ask for extra scratch paper if you need it — do not be shy.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-mindset-01', 'Strategy', 'How should I handle nerves and mindset on UPCAT day?', 'Stay away from anxious or pessimistic people right before/during the exam — stress is contagious. Try a power pose (stand in a confident pose for 2 minutes before entering). Remember: being nervous is normal, and being prepared means you can still perform even when nervous.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- SCHOLARSHIPS / ISKOLAR NG BAYAN (Parts 1, 12)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('scholarships-01', 'Scholarships', 'What does "Iskolar ng Bayan" mean?', '"Iskolar ng Bayan" (Scholar of the Nation) is the term for UP students. It reflects UP''s mission as a state university: to provide world-class education to deserving Filipino students, particularly those from public schools and underserved communities, funded by public taxes.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('scholarships-02', 'Scholarships', 'Is UP free for admitted students?', 'UP has a socialized tuition system. The University Affordable Education Act (Republic Act 10931) provides free tuition for students who qualify. Combined with various scholarships and financial assistance programs, UP is accessible even to students with limited financial means. Check upcat.up.edu.ph and the specific campus for current policies.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- CUTOFFS (Part 7)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('cutoffs-01', 'Cutoffs', 'What does the UPG cutoff mean?', 'The UPG cutoff is the highest (worst) UPG score that still qualified for admission at a given campus in a given year. Since lower UPG = better, the cutoff represents the boundary: applicants with a UPG at or below the cutoff pass; those above it do not. Cutoffs change every year based on the applicant pool.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('cutoffs-02', 'Cutoffs', 'Can you guarantee what UPG score I need to pass UPCAT?', 'No. Cutoffs change every year depending on the size and strength of the applicant pool. Historical reference values exist (e.g., from 2019), but they are not guarantees for future cycles. For the most accurate and current information, always check upcat.up.edu.ph.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('cutoffs-03', 'Cutoffs', 'Is it true that regional campuses have lower (easier) cutoffs than UP Diliman?', 'Generally yes — regional UP campuses tend to have higher UPG cutoffs (meaning lower competition) compared to UP Diliman and UP Manila. However, choosing a regional campus far from your home region will attract a pabigat penalty, which may offset any cutoff advantage.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- ALTERNATIVE PATHWAYS (Part 12)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('results-alt-01', 'Results', 'What can I do if I don''t pass UPCAT?', 'Not passing UPCAT is not the end of your UP dream. Other pathways include: lateral transfer to UP after completing 1–2 years at another university; a Second Bachelor''s Degree program if you already have a degree; graduate school at UP; or enrolling at another excellent Philippine university (Ateneo, DLSU, UST, etc.) and pursuing your goals from there. Many successful Filipino professionals did not attend UP.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('results-alt-02', 'Results', 'Can I get into UP through lateral transfer?', 'Yes. Each UP campus has its own lateral transfer system that allows students who have completed 1–2 years at another university to apply for admission. This is a separate process from UPCAT — check the specific campus''s admissions office for requirements and deadlines.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

-- ============================================================
-- ADDITIONAL FAQ FACTS (Part 14)
-- ============================================================
INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-upg-07', 'Algorithm/UPG', 'May chance pa ba ang isang valedictorian na hindi pa nag-aral ng UPCAT?', 'Yes, may chance — pero hindi guaranteed. High school grades count for 40% of the UPG, but the UPCAT exam score accounts for 60%. Campus choice can also make or break your application regardless of grades. Preparing for the exam''s unique format and coverage is still essential.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('campuses-05', 'Campuses', 'Is it a good idea for a Metro Manila student to choose a provincial UP campus to get an easier cutoff?', 'Depende. If you actually live near that regional campus (same region), yes — the cutoff is lower AND no pabigat applies. But if you live far (e.g., Metro Manila student choosing UP Mindanao), you''ll receive a −0.5 pabigat penalty which can hurt more than the lower cutoff helps.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('overview-08', 'Overview', 'Who is Kuya Baw?', 'Kuya Baw is the friendly AI coach of the Iskotify app, built by the team behind Review Masters Bicol (RMB). His job is to help Filipino students understand everything about UPCAT — how to apply, how the algorithm works, and how to maximize their chances of becoming an Iskolar ng Bayan.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('application-05', 'Application', 'What is Form 2A in the UPCAT process?', 'Form 2A is the school confirmation form. After a student submits their online UPCAT application, the school official must confirm the student''s application through the Form 2A portal, typically done around March–April of the application year.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('application-06', 'Application', 'What is Form 2B in the UPCAT process?', 'Form 2B is the grade submission form submitted after the UPCAT exam (around August), where the student''s final grades are recorded. It is submitted to the UP Office of Admissions along with a certified true copy of the SF-10 (Student Permanent Record).', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('subtest-rules-02', 'Subtests', 'What happens if a UPCAT question appears to have no correct answer?', 'If a question seems wrong or has no correct answer, the proctor will say "use your best judgment." Do not waste time arguing or questioning the proctor — make your best guess and move on to avoid losing time.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('algorithm-upg-08', 'Algorithm/UPG', 'Who developed the UPG formula?', 'The UPG formula was first developed in 1976 by UP Professor Dr. Romeo Manlapaz Jr. as a predictive tool to estimate how well an applicant would perform academically if admitted to UP.', 'UP Office of Admissions', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;

INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year) VALUES
('strategy-review-03', 'Strategy', 'Why does exam format familiarity matter for UPCAT?', 'UPCAT has a unique question format, strict time pressure, and a correct-minus-wrong scoring system. The more you practice with UPCAT-style questions, the faster and more accurate you become. Many academically excellent students fail because they have never experienced the pressure of a timed, penalized exam before.', 'RMB/Iskotify UPCAT context (Jun 2026)', NULL)
ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, question=EXCLUDED.question, answer=EXCLUDED.answer, source=EXCLUDED.source, valid_year=EXCLUDED.valid_year;
