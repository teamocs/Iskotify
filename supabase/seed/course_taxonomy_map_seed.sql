-- course_taxonomy_map seed (idempotent)
-- Maps PRC board exam tab codes → career_courses.course_id
--
-- Filename → course_tab convention (derive from TOP_SCHOOLS filename, snake_case → short code):
--   Accountancy_CPA          → CPA       (BUS-001  BS Accountancy)
--   Agriculture              → AGRI      (OTH-013  BS Agriculture)
--   Architecture             → ARCH      (ARCH-001 BS Architecture)
--   Chemical_Engineering     → ChemE     (ENG-005  BS Chemical Engineering)
--   Civil_Engineering        → CE        (ENG-006  BS Civil Engineering)
--   Criminology              → CRIM      (OTH-003  BS Criminology)
--   Dentistry                → DENT      (HLT-001  Doctor of Dental Medicine)
--   Education_LET            → LET       (TEA-003  BS Secondary Education — broadest LET match)
--   Electrical_Engineering_REE → REE     (ENG-008  BS Electrical Engineering)
--   Electronics_Engineering  → ECE       (ENG-009  BS Electronics Engineering)
--   Fisheries_Technology     → FISH      (OTH-011  BS Fisheries Technology)
--   Food_Technology          → FOODTECH  (NULL — no BS Food Technology in career_courses; closest ENG-011 is Food Engineering, different board)
--   Geodetic_Engineering     → GE        (ENG-012  BS Geodetic Engineering)
--   Geology                  → GEO       (SCI-009  BS Geology)
--   Law_Bar_Exam             → BAR       (OTH-009  Juris Doctor (JD) / Law)
--   Mechanical_Engineering   → ME        (ENG-017  BS Mechanical Engineering)
--   Medical_Technology       → MEDTECH   (HLT-003  BS Medical Technology)
--   Medicine_PLE             → PLE       (OTH-008  Doctor of Medicine)
--   Merchant_Marine_MARINA   → MARINA    (MAR-001  BS Merchant Marine Officer)
--   Metallurgical_Engineering → MetE     (ENG-020  BS Metallurgical Engineering)
--   Mining_Engineering       → MiningE   (ENG-021  BS Mining Engineering)
--   Nursing                  → NLE       (HLT-005  BS Nursing)
--   Nutrition_RND            → RND       (HLT-006  BS Nutrition and Dietetics)
--   Occupational_Therapy     → OT        (HLT-007  BS Occupational Therapy)
--   Pharmacy                 → PHARMA    (HLT-008  BS Pharmacy)
--   Physical_Therapy         → PT        (HLT-009  BS Physical Therapy)
--   Psychology_Psychologist  → PSYCHO    (SOC-005  BS Psychology)
--   Psychology_Psychometrician → PSYCHOM (SOC-005  BS Psychology — same course, different exam tier)
--   Radiologic_Technology    → RADTECH   (HLT-011  BS Radiologic Technology)
--   Veterinary_Medicine      → VETMED    (OTH-014  BS Veterinary Medicine (DVM/VMD))

INSERT INTO course_taxonomy_map (course_tab, career_course_id, label, kind)
VALUES
  ('CPA',     'BUS-001',  'Accountancy (CPA)',                        'board'),
  ('AGRI',    'OTH-013',  'Agriculture',                              'board'),
  ('ARCH',    'ARCH-001', 'Architecture',                             'board'),
  ('ChemE',   'ENG-005',  'Chemical Engineering',                     'board'),
  ('CE',      'ENG-006',  'Civil Engineering',                        'board'),
  ('CRIM',    'OTH-003',  'Criminology',                              'board'),
  ('DENT',    'HLT-001',  'Dentistry',                                'board'),
  ('LET',     'TEA-003',  'Education (LET)',                          'board'),
  ('REE',     'ENG-008',  'Electrical Engineering (REE)',             'board'),
  ('ECE',     'ENG-009',  'Electronics Engineering',                  'board'),
  ('FISH',    'OTH-011',  'Fisheries Technology',                     'board'),
  ('FOODTECH', NULL,      'Food Technology',                          'board'),
  ('GE',      'ENG-012',  'Geodetic Engineering',                     'board'),
  ('GEO',     'SCI-009',  'Geology',                                  'board'),
  ('BAR',     'OTH-009',  'Law (Bar Exam)',                           'board'),
  ('ME',      'ENG-017',  'Mechanical Engineering',                   'board'),
  ('MEDTECH', 'HLT-003',  'Medical Technology',                       'board'),
  ('PLE',     'OTH-008',  'Medicine (PLE)',                           'board'),
  ('MARINA',  'MAR-001',  'Merchant Marine (MARINA COC)',             'board'),
  ('MetE',    'ENG-020',  'Metallurgical Engineering',                'board'),
  ('MiningE', 'ENG-021',  'Mining Engineering',                       'board'),
  ('NLE',     'HLT-005',  'Nursing (NLE)',                            'board'),
  ('RND',     'HLT-006',  'Nutrition & Dietetics (RND)',              'board'),
  ('OT',      'HLT-007',  'Occupational Therapy',                     'board'),
  ('PHARMA',  'HLT-008',  'Pharmacy',                                 'board'),
  ('PT',      'HLT-009',  'Physical Therapy',                         'board'),
  ('PSYCHO',  'SOC-005',  'Psychology (Psychologist)',                'board'),
  ('PSYCHOM', 'SOC-005',  'Psychology (Psychometrician)',             'board'),
  ('RADTECH', 'HLT-011',  'Radiologic Technology',                    'board'),
  ('VETMED',  'OTH-014',  'Veterinary Medicine',                      'board')
ON CONFLICT (course_tab) DO UPDATE SET
  career_course_id = EXCLUDED.career_course_id,
  label            = EXCLUDED.label,
  kind             = EXCLUDED.kind,
  updated_at       = now();
