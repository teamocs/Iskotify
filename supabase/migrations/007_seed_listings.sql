-- Seed Philippine College Entrance Exams and Scholarships for Iskotify
-- 11 CETs + 8 Scholarships = 19 listings
-- Idempotent: ON CONFLICT (slug) DO NOTHING

INSERT INTO listings (
  type, title, slug, provider, description,
  requirements, coverage, deadline, exam_date,
  target_courses, target_year_levels, tags,
  status, region, grant_amount, external_url, updated_at
)
VALUES

-- =========================================================
-- COLLEGE ENTRANCE TESTS (CETs)
-- =========================================================

(
  'exam',
  'UPCAT – University of the Philippines College Admission Test',
  'upcat',
  'University of the Philippines System',
  'The UPCAT is the official entrance exam for admission to all UP campuses nationwide. It covers English, Reading Comprehension, Mathematics, and Science. Administered once a year, it is one of the most competitive college entrance tests in the Philippines.',
  ARRAY[
    'Currently enrolled in Grade 12 or a recent SHS graduate',
    'No failing grade in any subject in Grades 11–12',
    'Meet UP campus-specific GWA cutoffs',
    'Register via the UP Office of Admissions website'
  ],
  '',
  NULL,
  '2026-08-01',
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['UPCAT', 'UP System', 'state university', 'college admission', 'CET'],
  'upcoming',
  'Nationwide',
  NULL,
  'https://upcat.up.edu.ph',
  now()
),

(
  'exam',
  'ACET – Ateneo College Entrance Test',
  'acet',
  'Ateneo de Manila University',
  'The ACET is the entrance exam for Ateneo de Manila University''s Loyola Schools undergraduate programs. It covers English Language Proficiency, Reading Comprehension, Mathematics, and Abstract Reasoning.',
  ARRAY[
    'Must be a current Grade 12 student or SHS graduate',
    'Have not previously taken the ACET',
    'Register online through the ADMU admissions portal'
  ],
  '',
  NULL,
  '2026-10-17',
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['ACET', 'Ateneo', 'ADMU', 'college admission', 'CET'],
  'upcoming',
  'Nationwide',
  NULL,
  'https://www.ateneo.edu/osa/acet',
  now()
),

(
  'exam',
  'DCAT – De La Salle University College Admission Test',
  'dcat-dlsu',
  'De La Salle University',
  'The DCAT is the entrance exam for De La Salle University Manila. It covers Verbal Aptitude, Quantitative Aptitude, Inductive Reasoning, and Science Proficiency. Passing the DCAT is the first step toward becoming a Green Archer.',
  ARRAY[
    'Graduating SHS student or recent SHS graduate',
    'Must not have started any college-level units',
    'Online registration through the DLSU admissions portal'
  ],
  '',
  NULL,
  '2027-01-10',
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['DCAT', 'DLSU', 'De La Salle', 'college admission', 'CET'],
  'upcoming',
  'Nationwide',
  NULL,
  'https://www.dlsu.edu.ph/offices/admissions/cet/',
  now()
),

(
  'exam',
  'USTET – University of Santo Tomas Entrance Test',
  'ustet',
  'University of Santo Tomas',
  'The USTET is the official entrance exam of the University of Santo Tomas. It covers Language Proficiency, Reading Comprehension, Science, Mathematics, and Abstract Reasoning. UST''s diverse colleges and central Manila location make it a top choice nationwide.',
  ARRAY[
    'Must be a graduating Grade 12 / SHS student',
    'Complete online application with UST Office for Admissions',
    'Comply with course-specific academic requirements'
  ],
  '',
  NULL,
  '2026-10-18',
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['USTET', 'UST', 'University of Santo Tomas', 'college admission', 'CET'],
  'upcoming',
  'Nationwide',
  NULL,
  'https://iapply.ust.edu.ph',
  now()
),

(
  'exam',
  'PUPCET – Polytechnic University of the Philippines College Entrance Test',
  'pupcet',
  'Polytechnic University of the Philippines',
  'The PUPCET is the entrance exam for PUP Manila and its satellite campuses. One of the most affordable SUCs in the country, PUP attracts thousands of applicants annually. The exam covers Verbal Ability, Math, Science, and Abstract Reasoning.',
  ARRAY[
    'Must be a Grade 12 student or SHS graduate',
    'Must not be enrolled in any college program',
    'Online registration through the PUP admissions portal'
  ],
  '',
  NULL,
  '2027-01-17',
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['PUPCET', 'PUP', 'Polytechnic University', 'state university', 'college admission', 'CET'],
  'upcoming',
  'Nationwide',
  NULL,
  'https://www.pup.edu.ph/admission/',
  now()
),

(
  'exam',
  'MSU-SASE – Mindanao State University System Admission and Scholarship Examination',
  'msu-sase',
  'Mindanao State University',
  'The MSU-SASE covers all MSU campuses in Mindanao. It determines admission and scholarship eligibility simultaneously. High scorers may receive tuition waivers or full scholarships. The exam covers Verbal, Math, Science, and Social Studies.',
  ARRAY[
    'Must be a Grade 12 student or SHS graduate',
    'Filipino citizen',
    'Register through any MSU campus admissions office'
  ],
  'Full or partial tuition scholarship for top scorers',
  NULL,
  '2026-10-04',
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['MSU', 'Mindanao State University', 'SASE', 'college admission', 'scholarship', 'CET', 'Mindanao'],
  'upcoming',
  'Mindanao',
  NULL,
  'https://www.msusystem.edu.ph/',
  now()
),

(
  'exam',
  'BUCET – Bicol University College Entrance Test',
  'bucet',
  'Bicol University',
  'BUCET is the entrance exam for Bicol University and its network of campuses in the Bicol Region. It covers English Proficiency, Numeracy, and Critical Thinking. BU offers free tuition under the Universal Access to Quality Tertiary Education Act (RA 10931).',
  ARRAY[
    'Must be a graduating Grade 12 student or recent SHS graduate',
    'Register at the BU Office of Admissions'
  ],
  'Free tuition under RA 10931 (Universal Access to Quality Tertiary Education)',
  NULL,
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['BUCET', 'Bicol University', 'college admission', 'SUC', 'free tuition', 'CET'],
  'active',
  'Bicol Region',
  NULL,
  'https://www.bicol-u.edu.ph/admissions.php',
  now()
),

(
  'exam',
  'AdNU-CEA – Ateneo de Naga University College Entrance Admission Test',
  'adnu-cea',
  'Ateneo de Naga University',
  'The AdNU-CEA is the entrance exam for Ateneo de Naga University in Camarines Sur. Tests are held every Saturday from February to July. It covers English, Math, Science, and Abstract Reasoning and is open to SHS graduates across the Bicol Region.',
  ARRAY[
    'Must be a Grade 12 student or SHS graduate',
    'Present school ID and report card upon registration',
    'Tests held every Saturday; walk-in registration accepted'
  ],
  '',
  NULL,
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['AdNU', 'Ateneo de Naga', 'college admission', 'CET', 'Bicol'],
  'active',
  'Bicol Region',
  NULL,
  'https://www.adnu.edu.ph/admissions/',
  now()
),

(
  'exam',
  'BEE – Benilde Entrance Examination',
  'bee-benilde',
  'De La Salle-College of Saint Benilde',
  'The BEE is the entrance exam for De La Salle-College of Saint Benilde, a premier arts, design, and technology school in Manila. It covers Language Proficiency and Quantitative Reasoning; some programs require a portfolio review.',
  ARRAY[
    'Must be a Grade 12 student or recent SHS graduate',
    'Online application and registration required',
    'Portfolio may be required for specific programs (e.g., Industrial Design)'
  ],
  '',
  NULL,
  '2026-10-10',
  ARRAY['Arts and Design', 'Technology', 'Business', 'Hospitality Management'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['BEE', 'Benilde', 'CSB', 'college admission', 'arts', 'design', 'CET'],
  'upcoming',
  'Metro Manila',
  NULL,
  'https://www.benilde.edu.ph/admissions/',
  now()
),

(
  'exam',
  'FEUCAT – Far Eastern University College Admission Test',
  'feucat',
  'Far Eastern University',
  'FEUCAT is the entrance exam for FEU and its affiliate schools (FEU Tech, FEU Diliman, FEU Cavite). Administered year-round on multiple dates, it covers English, Math, and Science. FEU is known for its Accountancy, Nursing, and Law programs.',
  ARRAY[
    'Must be a Grade 12 student or SHS graduate',
    'Online pre-registration through the FEU admissions website',
    'Bring original and photocopy of report card and school ID on test day'
  ],
  '',
  NULL,
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['FEUCAT', 'FEU', 'Far Eastern University', 'college admission', 'rolling', 'CET'],
  'active',
  'Metro Manila',
  NULL,
  'https://www.feu.edu.ph/admissions/',
  now()
),

(
  'exam',
  'MPASS – Mapua University Admission and Scholarship System',
  'mpass-mapua',
  'Mapua University',
  'MPASS is the combined admission and scholarship exam of Mapua University, the Philippines'' top engineering and technology university. Top scorers receive partial to full tuition scholarships. The exam covers Math, Science, English, and Critical Thinking.',
  ARRAY[
    'Must be a Grade 12 student or SHS graduate',
    'Online application via the Mapua admissions portal',
    'Must declare program of choice during registration'
  ],
  'Partial to full tuition scholarships for top scorers',
  NULL,
  NULL,
  ARRAY['Engineering', 'Technology', 'Architecture', 'Information Technology'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['MPASS', 'Mapua', 'engineering', 'college admission', 'scholarship', 'rolling', 'CET'],
  'active',
  'Nationwide',
  NULL,
  'https://admissions.mapua.edu.ph/',
  now()
),

-- =========================================================
-- SCHOLARSHIPS
-- =========================================================

(
  'scholarship',
  'DOST-SEI Merit Scholarship',
  'dost-sei',
  'Department of Science and Technology – Science Education Institute',
  'One of the most prestigious undergraduate scholarships in the Philippines, exclusively for STEM students at accredited HEIs. Scholars receive a monthly stipend, full tuition, and book allowance throughout their degree in a DOST-identified priority course.',
  ARRAY[
    'Must be a Grade 12 STEM student or recent SHS graduate',
    'General Weighted Average (GWA) of at least 90% or equivalent',
    'Must enroll in a DOST-identified priority course (Engineering, Computer Science, Natural Sciences, Mathematics, Agriculture)',
    'Must be a Filipino citizen',
    'Must not be a recipient of any other government scholarship'
  ],
  'Full tuition + P7,000/month stipend + P10,000 book allowance per year',
  '2026-12-31',
  '2027-02-21',
  ARRAY['Engineering', 'Computer Science', 'Natural Sciences', 'Mathematics', 'Agriculture'],
  ARRAY['Grade 12 STEM', 'SHS Graduate'],
  ARRAY['DOST', 'SEI', 'STEM', 'science scholarship', 'government scholarship', 'engineering', 'merit'],
  'upcoming',
  'Nationwide',
  7000,
  'https://www.sei.dost.gov.ph/index.php/programs/scholarships/s-and-t-scholarship',
  now()
),

(
  'scholarship',
  'CHED Merit Scholarship Program',
  'ched-scholarship',
  'Commission on Higher Education',
  'CHED administers scholarship programs for academically excellent students including the Merit Scholarship Program and the Scholarship for Excellence, Leadership, and Distinction (SELD). Awards are based on academic records and financial need — no entrance exam required.',
  ARRAY[
    'Must be enrolled or accepted in a CHED-recognized HEI',
    'GWA of at least 90% (or equivalent 1.75) in SHS',
    'Combined annual family income within CHED-prescribed threshold',
    'Must be a Filipino citizen'
  ],
  'P4,000/semester stipend + tuition subsidy',
  NULL,
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate', 'College Student'],
  ARRAY['CHED', 'scholarship', 'government', 'merit', 'financial aid', 'tertiary education'],
  'active',
  'Nationwide',
  4000,
  'https://www.ched.gov.ph/scholarships-grants-and-financial-assistance/',
  now()
),

(
  'scholarship',
  'TES – Tertiary Education Subsidy',
  'tes-unifast',
  'UniFAST – Unified Financial Assistance System for Tertiary Education',
  'The Tertiary Education Subsidy (TES) is a government grant under RA 10931 providing financial assistance to socioeconomically disadvantaged Filipino students at SUCs, LUCs, and CHED-supervised institutions. Eligibility is determined through PSA and DSWD records — no entrance exam required.',
  ARRAY[
    'Must be enrolled in a SUC, LUC, or CHED-supervised private HEI',
    'Must be a 4Ps beneficiary or belong to the bottom 50% of income distribution',
    'Must be a Filipino citizen',
    'Verified through the Listahanan / NHTS database'
  ],
  'P5,000–P60,000 per year depending on institution type',
  NULL,
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate', 'College Student'],
  ARRAY['TES', 'UniFAST', 'RA 10931', 'free tuition', 'government scholarship', 'financial aid', 'SUC'],
  'active',
  'Nationwide',
  60000,
  'https://unifast.gov.ph/tes',
  now()
),

(
  'scholarship',
  'SM Foundation College Scholarship Program',
  'sm-foundation',
  'SM Foundation Inc.',
  'The SM College Scholarship Program supports academically excellent students from low-income families with full tuition coverage and a monthly allowance. SM Foundation has been one of the most active private scholarship providers in the Philippines for decades.',
  ARRAY[
    'Must be a graduating Grade 12 student or recent SHS graduate',
    'GWA of at least 90% or its equivalent',
    'Combined annual family income must not exceed P200,000',
    'Must be enrolled or accepted in a college or university',
    'Must be a Filipino citizen'
  ],
  'Full tuition + P5,000–P6,000/month allowance',
  '2026-06-30',
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['SM Foundation', 'scholarship', 'private scholarship', 'merit', 'financial need', 'tuition'],
  'active',
  'Nationwide',
  6000,
  'https://www.smfoundation.org.ph/programs/education',
  now()
),

(
  'scholarship',
  'Ayala Foundation U-GO Scholarship',
  'ayala-u-go',
  'Ayala Foundation Inc.',
  'The Ayala Foundation U-GO (Undergraduate Scholarship and Graduate Opportunities) program supports students from underprivileged communities who demonstrate academic promise. Selection includes an interview and community involvement assessment — no entrance exam. Scholars join a leadership development program.',
  ARRAY[
    'Must be a graduating SHS student or recent SHS graduate',
    'Must demonstrate financial need',
    'Strong academic record and proven community involvement',
    'Must be accepted into a recognized college or university'
  ],
  'Tuition subsidy + living allowance + leadership development program',
  '2026-06-30',
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['Ayala Foundation', 'U-GO', 'scholarship', 'leadership', 'private scholarship', 'financial need'],
  'active',
  'Nationwide',
  NULL,
  'https://www.ayalafoundation.org/education/',
  now()
),

(
  'scholarship',
  'GSIS Educational Scholarship for Dependents',
  'gsis-scholarship',
  'Government Service Insurance System',
  'GSIS grants scholarships to qualified children and dependents of GSIS members and pensioners. Both a Grant Scholarship (merit-based) and a Study Grant (need-based) are available. Awardees must maintain a minimum GPA. Document-based — no entrance exam required.',
  ARRAY[
    'Must be a child or legal dependent of an active GSIS member or pensioner',
    'Must be a graduating Grade 12 student or incoming college freshman',
    'GWA of at least 85% in Grade 11',
    'Must be accepted into an accredited college or university',
    'Must not be a recipient of another GSIS scholarship or any government scholarship'
  ],
  'Tuition, miscellaneous fees, and monthly allowance',
  NULL,
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate'],
  ARRAY['GSIS', 'government scholarship', 'dependent scholarship', 'merit', 'financial assistance'],
  'active',
  'Nationwide',
  NULL,
  'https://www.gsis.gov.ph/members/benefits/scholarship/',
  now()
),

(
  'scholarship',
  'GSIS GSSP – Group Scholarship and Study Program',
  'gsis-gssp',
  'Government Service Insurance System',
  'The GSIS GSSP is a group-based scholarship program funding graduate and select undergraduate studies for GSIS members and qualified dependents. The 2026 batch is expected to open on June 30, 2026. Check the official GSIS website for announcements.',
  ARRAY[
    'Must be a GSIS member in good standing or a qualified dependent',
    'Must meet academic and financial eligibility criteria set by GSIS for the cycle',
    'Required documents: birth certificate, transcript of records, letter of intent'
  ],
  'Tuition, fees, and monthly stipend depending on program and institution',
  '2026-09-30',
  NULL,
  ARRAY['all'],
  ARRAY['SHS Graduate', 'College Student', 'Graduate Student'],
  ARRAY['GSIS', 'GSSP', 'government scholarship', 'group scholarship', 'study program'],
  'upcoming',
  'Nationwide',
  NULL,
  'https://www.gsis.gov.ph/',
  now()
),

(
  'scholarship',
  'Metrobank Foundation ACCESS II Scholarship',
  'metrobank-access',
  'Metrobank Foundation Inc.',
  'The Metrobank Foundation ACCESS (Assistance for College and Career Education Support for Scholars) II Scholarship is awarded to outstanding students in partner SUCs. Scholars are nominated by their institution based on academic performance and financial need.',
  ARRAY[
    'Must be enrolled in a partner State University or College (SUC)',
    'Must be nominated by the institution''s scholarship office',
    'GWA of at least 90% in SHS and in current college year',
    'Demonstrated financial need',
    'Must be a Filipino citizen'
  ],
  'Full tuition + P3,000–P5,000/month stipend',
  NULL,
  NULL,
  ARRAY['all'],
  ARRAY['Grade 12', 'SHS Graduate', 'College Student'],
  ARRAY['Metrobank', 'ACCESS', 'scholarship', 'SUC', 'private scholarship', 'merit'],
  'active',
  'Nationwide',
  5000,
  'https://www.metrobankfoundation.org/scholarship/',
  now()
)

ON CONFLICT (slug) DO NOTHING;
