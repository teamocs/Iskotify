-- LGU Provincial & City Government Scholarships seed
-- Generated: 2026-06-06T13:49:34.778Z
-- Source: lgu_political_scholarships.txt (112 entries after dedup)
-- Idempotent: ON CONFLICT (slug) DO UPDATE
-- DO NOT apply manually -- controller runs this file.

-- LGU-R1-ILN-001: Sirib Provincial Learners Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r1-iln-001', 'Sirib Provincial Learners Scholarship Program', 'Provincial Government of Ilocos Norte',
  'Region I (Ilocos)', 'Ilocos Norte', NULL, 'provincial',
  'active', TRUE, 'https://www.ilocosnorte.gov.ph/scholarship',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Monthly stipend (₱5,000–₱10,000/semester reported); tuition fee coverage; transportation allowance; daily living allowance; board and lodging if necessary. Types: Sirib Academic, Sirib Young Leaders, Sirib Community Leaders. Postgraduate (JD, MD) slots available.","income_requirement_text":"Low-income/indigent families prioritized","residency_required":true,"course_restrictions":"Various categories including agriculture, fisheries, technical-vocational, arts","slots":"~1,794 total scholars (multiple levels); 773 academic slots, 400 agri/fisheries, 141 tertiary, 70 tech-voc, 150 arts, 11 JD, 17 MD","application_period":"Summer/early academic year (applications open announced on official website)","notes":"One of the most comprehensive provincial scholarship programs in Luzon. Program established by ordinance. Covers secondary through doctoral levels.","source":"https://www.ilocosnorte.gov.ph/scholarship | Provincial Ordinance No. 019-2020","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R1-ILS-001: Ilocos Sur Educational Assistance and Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r1-ils-001', 'Ilocos Sur Educational Assistance and Scholarship Program', 'Provincial Government of Ilocos Sur — Provincial Education and Scholarship Affairs Office (PESAO)',
  'Region I (Ilocos)', 'Ilocos Sur', NULL, 'provincial',
  'active', TRUE, 'https://mis.ilocossur.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Educational assistance grant; qualifying exam held at Ilocos Sur Polytechnic State College (ISPSC)","income_requirement_text":"Financial need required","residency_required":true,"application_period":"Announced via Facebook page PGIS-PESAO; qualifying exam held annually","notes":"New batch of scholars announced October 2024. Contact PESAO directly for 2026 application window.","source":"https://mis.ilocossur.gov.ph | Facebook: PGIS.PESAO","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R1-LAU-001: ELYU Iskolar — La Union Educational Assistance and Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r1-lau-001', 'ELYU Iskolar — La Union Educational Assistance and Scholarship Program', 'Provincial Government of La Union',
  'Region I (Ilocos)', 'La Union', NULL, 'provincial',
  'active', TRUE, 'https://launion.gov.ph/elyu-iskolar-la-union-educational-assistance-and-scholarship-program/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Educational assistance for indigent families; amount to be confirmed with PGLaUnion","income_requirement_text":"Indigent families targeted","residency_required":true,"notes":"Program name \"ELYU Iskolar\" confirmed on official provincial website.","source":"https://launion.gov.ph/elyu-iskolar-la-union-educational-assistance-and-scholarship-program/","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R1-PAN-001: Provincial Scholarship Program (PSP) of Pangasinan
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r1-pan-001', 'Provincial Scholarship Program (PSP) of Pangasinan', 'Provincial Government of Pangasinan',
  'Region I (Ilocos)', 'Pangasinan', NULL, 'provincial',
  'active', TRUE, 'https://www.pangasinan.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"₱10,000/year grant per scholar; covers PSU students across 9 campuses (Alaminos, Asingan, Bayambang, Binmaley, Infanta, Lingayen, San Carlos, Sta. Maria, Urdaneta); categories include academic, sports, arts, cultural minorities, agriculture/fisheries","income_requirement_text":"Poor but deserving; financial need","residency_required":true,"course_restrictions":"Priority to agriculture/fisheries; PSU students prioritized","slots":"1,227 total scholars (702 PSU scholars in 2025)","application_period":"Applications typically open mid-year; qualifying exam September","notes":"Provincial ordinance institutionalizes the program. Budget of ₱6.97M awarded to PSU students alone in 2025.","source":"https://www.pangasinan.gov.ph | Ordinance institutionalizing PSP on file","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R2-CAG-001: Provincial Scholarship Program — Province of Cagayan
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r2-cag-001', 'Provincial Scholarship Program — Province of Cagayan', 'Provincial Government of Cagayan',
  'Region II (Cagayan Valley)', 'Cagayan', NULL, 'provincial',
  'active', FALSE, 'https://cagayan.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Students should contact the Cagayan Provincial Capitol or PESO Cagayan directly.","source":"https://cagayan.gov.ph | Tuguegarao Capitol, Tuguegarao City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R2-ISA-001: Provincial Scholarship/Educational Assistance — Province of Isabela
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r2-isa-001', 'Provincial Scholarship/Educational Assistance — Province of Isabela', 'Provincial Government of Isabela',
  'Region II (Cagayan Valley)', 'Isabela', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Educational assistance for qualified students; Isabela State University (ISU) offers merit-based grants separately","residency_required":true,"notes":"No dedicated provincial scholarship page found online. Students should inquire at the Isabela Capitol.","source":"Isabela Provincial Capitol, Ilagan City, Isabela","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R2-NUV-001: Educational Assistance Program — Province of Nueva Vizcaya
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r2-nuv-001', 'Educational Assistance Program — Province of Nueva Vizcaya', 'Provincial Government of Nueva Vizcaya',
  'Region II (Cagayan Valley)', 'Nueva Vizcaya', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Provincial Capitol or PESO.","source":"Nueva Vizcaya Provincial Capitol, Bayombong","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R2-QUI-001: Educational Assistance — Province of Quirino
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r2-qui-001', 'Educational Assistance — Province of Quirino', 'Provincial Government of Quirino',
  'Region II (Cagayan Valley)', 'Quirino', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Grants for tuition and school expenses reported in general sources","residency_required":true,"notes":"General reference to educational assistance found; no dedicated program page. Contact Capitol or PESO.","source":"Quirino Provincial Capitol, Cabarroguis","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R2-BAT-001: Provincial Scholarship Program — Province of Batanes
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r2-bat-001', 'Provincial Scholarship Program — Province of Batanes', 'Provincial Government of Batanes',
  'Region II (Cagayan Valley)', 'Batanes', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"Batanes is the smallest province; no online documentation found. Contact Capitol directly.","source":"Batanes Provincial Capitol, Basco, Batanes","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-BTA-001: Iskolar ng Bataan College Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-bta-001', 'Iskolar ng Bataan College Scholarship Program', 'Provincial Government of Bataan — Office of the Provincial Governor',
  'Region III (Central Luzon)', 'Bataan', NULL, 'provincial',
  'active', TRUE, 'https://bataan.gov.ph/services/iskolar/',
  90, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial grant disbursed via Landbank ATM card; covers college education; Gurong Iskolar ng Bataan Doctoral/Masteral program in partnership with BPSU and DepEd also available","income_requirement_text":"Low-income; financial need","residency_required":true,"course_restrictions":"None specified for undergraduate; Gurong Iskolar track for teachers (Masteral/Doctoral)","application_period":"Online registration available; deadlines announced via official website","notes":"Mission: produce at least one professional per household. Online registration portal available.","source":"https://bataan.gov.ph/services/iskolar/ | https://www.iskolarngbataan.com | 4th Floor, The Bunker Building, Capitol Compound, Balanga City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-BUL-001: Tulong Pang-Edukasyon Para sa Bulakenyo
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-bul-001', 'Tulong Pang-Edukasyon Para sa Bulakenyo', 'Provincial Government of Bulacan — Provincial Administrator''s Office / Office of the Governor',
  'Region III (Central Luzon)', 'Bulacan', NULL, 'provincial',
  'active', TRUE, 'https://bulacan.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"₱3,500/semester (private college scholars); ₱3,000/semester (SUC/public SHS scholars); ₱5,000/semester (Masteral); grants disbursed directly to Landbank cards","income_requirement_text":"Financial need; barangay indigency certification","residency_required":true,"course_restrictions":"Enrolled in colleges within and outside the province; no current scholarship from other institutions","slots":"~2,646 scholars (2026 batch); over 6,500 total in peak years","application_period":"Announced via bulacan.gov.ph; typically mid-year","notes":"Also offers separate scholarship for indigenous (IP) scholars. Renewable up to 4 years.","source":"https://bulacan.gov.ph | https://www.scholarshippgbwebsite.com/","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-NUE-001: Provincial Scholarship Program — Province of Nueva Ecija
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-nue-001', 'Provincial Scholarship Program — Province of Nueva Ecija', 'Provincial Government of Nueva Ecija',
  'Region III (Central Luzon)', 'Nueva Ecija', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No specific online documentation found. Contact Provincial Capitol or PESO.","source":"Nueva Ecija Provincial Capitol, Palayan City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-PAM-001: Provincial Scholarship Program — Province of Pampanga
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-pam-001', 'Provincial Scholarship Program — Province of Pampanga', 'Provincial Government of Pampanga',
  'Region III (Central Luzon)', 'Pampanga', NULL, 'provincial',
  'active', FALSE, 'https://scholarship.pampangastateu.edu.ph/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial support to San Fernando & Pampanga LGU scholars mentioned in general sources","residency_required":true,"notes":"Pampanga State University has a separate scholarship portal. Provincial-specific program details unavailable online.","source":"https://scholarship.pampangastateu.edu.ph/ (PSU scholarship portal) | Pampanga Capitol, San Fernando","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-TAR-001: Provincial Scholarship Program — Province of Tarlac
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-tar-001', 'Provincial Scholarship Program — Province of Tarlac', 'Provincial Government of Tarlac',
  'Region III (Central Luzon)', 'Tarlac', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated scholarship page found. Contact Capitol or PESO Tarlac.","source":"Tarlac Provincial Capitol, Tarlac City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-ZAM-001: Provincial Scholarship Program — Province of Zambales
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-zam-001', 'Provincial Scholarship Program — Province of Zambales', 'Provincial Government of Zambales',
  'Region III (Central Luzon)', 'Zambales', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated scholarship page found. Contact Capitol or PESO.","source":"Zambales Provincial Capitol, Iba, Zambales","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-AUR-001: Scholarship Program — Province of Aurora
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-aur-001', 'Scholarship Program — Province of Aurora', 'Provincial Government of Aurora',
  'Region III (Central Luzon)', 'Aurora', NULL, 'provincial',
  'active', FALSE, 'https://scholarngbayanngaurora.com/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Scholarship program referenced at scholarngbayanngaurora.com","residency_required":true,"notes":"Website exists but details are minimal. Students should contact Capitol directly.","source":"https://scholarngbayanngaurora.com/ | Aurora Provincial Capitol, Baler","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4A-BTG-001: Batangas Province Educational Assistance Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4a-btg-001', 'Batangas Province Educational Assistance Program', 'Provincial Government of Batangas — Governor''s Office Scholarship Division',
  'Region IV-A (CALABARZON)', 'Batangas', NULL, 'provincial',
  'active', TRUE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Educational assistance grant; amount to be confirmed with Scholarship Division","income_requirement_text":"Financial need","residency_required":true,"course_restrictions":"College students enrolled in duly authorized public institutions in Batangas","notes":"Batangas City also has a separate EBD Scholarship administered by the Mayor''s Office.","source":"Governor''s Office Scholarship Division, Batangas Capitol, Batangas City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4A-CAV-001: Iskolar ng Lalawigan ng Cavite
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4a-cav-001', 'Iskolar ng Lalawigan ng Cavite', 'Provincial Government of Cavite',
  'Region IV-A (CALABARZON)', 'Cavite', NULL, 'provincial',
  'active', TRUE, 'https://cavite.gov.ph/home/tag/provincial-scholarship-program/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Direct educational financial assistance to Caviteño students; disbursed Nov–Dec 2025 to 13,470 students","income_requirement_text":"Financial need","residency_required":true,"slots":"13,470 in latest distribution","application_period":"Announced via cavite.gov.ph","notes":"Individual municipalities (e.g., Cavite City) also have separate \"Iskolar ng Bayan\" programs.","source":"https://cavite.gov.ph/home/tag/provincial-scholarship-program/","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4A-LAG-001: Provincial Scholarship Program — Province of Laguna
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4a-lag-001', 'Provincial Scholarship Program — Province of Laguna', 'Provincial Government of Laguna',
  'Region IV-A (CALABARZON)', 'Laguna', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"UPLB (in Laguna) has its own Iskolar ng Bayan program; that is a national CHED program. Provincial LGU scholarship details not found online.","source":"Laguna Provincial Capitol, Santa Cruz, Laguna","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4A-QUE-001: One Poor Family, One College Graduate Full Scholarship Program; Priority Courses Scholarship and Return Service Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4a-que-001', 'One Poor Family, One College Graduate Full Scholarship Program; Priority Courses Scholarship and Return Service Program', 'Provincial Government of Quezon',
  'Region IV-A (CALABARZON)', 'Quezon', NULL, 'provincial',
  'active', TRUE, 'https://quezon.gov.ph',
  85, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Full scholarship coverage; programs targeting indigent families; Priority Courses track for public service courses","income_requirement_text":"Indigent/low-income; priority for geographically isolated and disadvantaged areas (GIDA)","residency_required":true,"course_restrictions":"Priority Courses track focuses on public service and community development fields; must enroll in partner SUC/LUC/PHEI","application_period":"Applications open March 2026 per latest announcement; submit at Provincial Government Satellite Offices or Scholarship Office, 2nd Floor PGO Annex Bldg., Quezon Capitol Compound, Brgy. 10, Lucena City","notes":"Two separate scholarship tracks. Must not be receiving other government scholarships.","source":"https://quezon.gov.ph | https://philscholar.com/one-poor-family-one-college-graduate-full-scholarship/","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4A-RIZ-001: Iskolar ni Gob Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4a-riz-001', 'Iskolar ni Gob Program', 'Provincial Government of Rizal',
  'Region IV-A (CALABARZON)', 'Rizal', NULL, 'provincial',
  'active', TRUE, 'https://www.rizalprovince.ph/pages/iskolarnigob.html',
  85, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial assistance for college; disbursed to qualified scholars","income_requirement_text":"Annual family income not higher than ₱350,000","residency_required":true,"slots":"Limited; qualifying exam required","application_period":"Applications open January 2 annually; Jan 10 deadline (2025 cycle); qualifying exam March 22","notes":"Test permits collected March 13–14; qualifying exam March 22. PSA birth certificate, proof of income, and 2x2 photos required.","source":"https://www.rizalprovince.ph/pages/iskolarnigob.html | 2nd Floor, Rizal Capitol Annex Building, Ynares Center Complex, Antipolo City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4B-MAR-001: Provincial Scholarship Program — Province of Marinduque
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4b-mar-001', 'Provincial Scholarship Program — Province of Marinduque', 'Provincial Government of Marinduque',
  'Region IV-B (MIMAROPA)', 'Marinduque', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Provincial Capitol or PESO.","source":"Marinduque Provincial Capitol, Boac, Marinduque","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4B-OCM-001: Provincial Scholarship Program — Province of Occidental Mindoro
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4b-ocm-001', 'Provincial Scholarship Program — Province of Occidental Mindoro', 'Provincial Government of Occidental Mindoro',
  'Region IV-B (MIMAROPA)', 'Occidental Mindoro', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Occidental Mindoro Provincial Capitol, Mamburao","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4B-ORM-001: Provincial Scholarship Program — Province of Oriental Mindoro
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4b-orm-001', 'Provincial Scholarship Program — Province of Oriental Mindoro', 'Provincial Government of Oriental Mindoro',
  'Region IV-B (MIMAROPA)', 'Oriental Mindoro', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Oriental Mindoro Provincial Capitol, Calapan City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4B-PAL-001: Provincial Scholarship Program / Programang Pang-Edukasyong Medikal para sa Palaweño
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4b-pal-001', 'Provincial Scholarship Program / Programang Pang-Edukasyong Medikal para sa Palaweño', 'Provincial Government of Palawan',
  'Region IV-B (MIMAROPA)', 'Palawan', NULL, 'provincial',
  'active', TRUE, 'https://www.facebook.com/palawandaily/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Medical scholarship for Doctor of Medicine (Provincial Ordinance No. 3224); general scholarship for college also referenced","residency_required":true,"course_restrictions":"Special track for Doctor of Medicine; technical-vocational also offered","application_period":"Facebook announcements via Palawan Daily page","notes":"PALECO (Palawan Electric Cooperative) also runs a separate scholarship program for dependents of MCOs (deadline June 2025, exam July 15). Provincial Ordinance No. 3224 for medical scholarship.","source":"https://www.facebook.com/palawandaily/ | Palawan Provincial Capitol, Puerto Princesa","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4B-ROM-001: Provincial Scholarship Program — Province of Romblon
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4b-rom-001', 'Provincial Scholarship Program — Province of Romblon', 'Provincial Government of Romblon',
  'Region IV-B (MIMAROPA)', 'Romblon', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Romblon Provincial Capitol, Romblon town","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R5-ALB-001: Provincial Scholarship Program — Province of Albay
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r5-alb-001', 'Provincial Scholarship Program — Province of Albay', 'Provincial Government of Albay',
  'Region V (Bicol)', 'Albay', NULL, 'provincial',
  'active', FALSE, 'https://albay.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated scholarship page found on albay.gov.ph. Contact Capitol or PESO Albay.","source":"https://albay.gov.ph | Albay Provincial Capitol, Legazpi City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R5-CNO-001: Provincial Scholarship Program — Province of Camarines Norte
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r5-cno-001', 'Provincial Scholarship Program — Province of Camarines Norte', 'Provincial Government of Camarines Norte',
  'Region V (Bicol)', 'Camarines Norte', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"CNSC (Camarines Norte State College) has its own SFAU. Contact Capitol for provincial grants.","source":"Camarines Norte Provincial Capitol, Daet","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R5-CSU-001: Provincial Scholarship Program — Province of Camarines Sur
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r5-csu-001', 'Provincial Scholarship Program — Province of Camarines Sur', 'Provincial Government of Camarines Sur',
  'Region V (Bicol)', 'Camarines Sur', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated online program found. Contact Capitol or PESO CamSur.","source":"Camarines Sur Provincial Capitol, Pili","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R5-CAT-001: Provincial Scholarship Program — Province of Catanduanes
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r5-cat-001', 'Provincial Scholarship Program — Province of Catanduanes', 'Provincial Government of Catanduanes',
  'Region V (Bicol)', 'Catanduanes', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Catanduanes Provincial Capitol, Virac","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R5-MAS-001: Provincial Scholarship Program — Province of Masbate
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r5-mas-001', 'Provincial Scholarship Program — Province of Masbate', 'Provincial Government of Masbate',
  'Region V (Bicol)', 'Masbate', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Masbate Provincial Capitol, Masbate City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R5-SOR-001: Provincial Scholarship Program — Province of Sorsogon
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r5-sor-001', 'Provincial Scholarship Program — Province of Sorsogon', 'Provincial Government of Sorsogon',
  'Region V (Bicol)', 'Sorsogon', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Sorsogon.","source":"Sorsogon Provincial Capitol, Sorsogon City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R6-AKL-001: Provincial Government College Scholarship Program (PGCSP) — Aklan
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r6-akl-001', 'Provincial Government College Scholarship Program (PGCSP) — Aklan', 'Provincial Government of Aklan — College Scholarship Services, Capitol Site, Kalibo',
  'Region VI (Western Visayas)', 'Aklan', NULL, 'provincial',
  'active', TRUE, 'https://www.facebook.com/AklanScholarshipServices/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial assistance for college students; scholarship services administered from Capitol Site","income_requirement_text":"Financial need","residency_required":true,"course_restrictions":"Partner institutions include Aklan Polytechnic Institute","application_period":"Announced via Facebook page (Aklan Scholarship Services) and IMAD page","notes":"Active Facebook page confirmed. Details require direct contact with the scholarship office.","source":"https://www.facebook.com/AklanScholarshipServices/ | Capitol Site, Kalibo, Aklan","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R6-ANT-001: Provincial Scholarship Program — Province of Antique
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r6-ant-001', 'Provincial Scholarship Program — Province of Antique', 'Provincial Government of Antique',
  'Region VI (Western Visayas)', 'Antique', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Antique.","source":"Antique Provincial Capitol, San Jose de Buenavista","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R6-CAP-001: Comprehensive Assistance Program for Identified Scholars (CAPIS)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r6-cap-001', 'Comprehensive Assistance Program for Identified Scholars (CAPIS)', 'Provincial Government of Capiz — Provincial Scholarship Secretariat Office',
  'Region VI (Western Visayas)', 'Capiz', NULL, 'provincial',
  'active', TRUE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Long-term scholarship for college students pursuing degrees in Region 6 institutions; continuous and efficient delivery of assistance","income_requirement_text":"Low-income/poor but deserving","residency_required":true,"course_restrictions":"Must enroll in partner institutions in Region 6","application_period":"July 21–August 1, 2025 for AY 2025–2026","notes":"Aims to broaden scholarship categories to accommodate more students and ensure completion of higher education.","source":"3rd Floor, Capiz Provincial Capitol, Roxas City; announced via Panay News","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R6-GUI-001: Provincial Scholarship Program — Province of Guimaras
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r6-gui-001', 'Provincial Scholarship Program — Province of Guimaras', 'Provincial Government of Guimaras',
  'Region VI (Western Visayas)', 'Guimaras', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Guimaras Provincial Capitol, Jordan, Guimaras","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R6-ILO-001: Iskolar Sang Iloilo Program (ISIP)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r6-ilo-001', 'Iskolar Sang Iloilo Program (ISIP)', 'Provincial Government of Iloilo',
  'Region VI (Western Visayas)', 'Iloilo', NULL, 'provincial',
  'active', TRUE, 'https://iloilo.gov.ph/en/taxonomy/term/137',
  90, 3500, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"₱3,500/month stipend; ₱3,000/semester learning resource assistance; ₱5,000 thesis/research allowance (graduating students); OJT allowance; Latin honor incentives; food and fare allowance","income_requirement_text":"Annual family income not more than ₱180,000","residency_required":true,"course_restrictions":"Must enroll in SUC within Iloilo: UP Visayas, WVSU, NISU, ISAT-U, ISUFST, or Passi City College","slots":"125 scholars/year; 25 slots per district (5 districts)","application_period":"Batch 31 open for AY 2026–2027; applications open summer semester","notes":"One of the most well-documented provincial scholarship programs in the Philippines. 4–5 year program. Students must come from low-income families.","source":"https://iloilo.gov.ph/en/taxonomy/term/137 | https://iloilotoday.com/applications-for-iskolar-sang-iloilo-program/","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R6-NOC-001: Negros Occidental Scholarship Program (NOSP)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r6-noc-001', 'Negros Occidental Scholarship Program (NOSP)', 'Provincial Government of Negros Occidental',
  'Region VI (Western Visayas)', 'Negros Occidental', NULL, 'provincial',
  'active', TRUE, 'https://www.negros-occ.gov.ph/scholarship/',
  80, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Free tuition and miscellaneous fees; book and uniform allowance; monthly stipend; thesis/research allowance; board exam subsidy; transportation allowance for out-of-province scholars","income_requirement_text":"Low-income/indigent families; various income-based categories","residency_required":true,"course_restrictions":"11 categories including Pagkaon Scholarship, District Educational Scholarship, Degree Completion, IP Scholarship, Medical and Nursing, Midwifery, OFW-related, Solo Parent children, PWD scholars","slots":"~1,350 total scholars (835 existing + 515 new in latest batch); ₱72.3M budget","application_period":"Applications close November 30, 2025 for next batch","notes":"IMPORTANT: Bacolod City residents are NOT eligible for NOSP — Bacolod has its own city scholarship. NOSP covers 19 municipalities/cities of the province.","source":"https://www.negros-occ.gov.ph/scholarship/ | https://philscholar.com/negros-occidental-scholarship-program/","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R7-BOH-001: Provincial Scholarship Program — Province of Bohol
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r7-boh-001', 'Provincial Scholarship Program — Province of Bohol', 'Provincial Government of Bohol',
  'Region VII (Central Visayas)', 'Bohol', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"University of Bohol has its own institutional scholarship. No distinct provincial LGU scholarship found online. Contact Capitol or PESO Bohol.","source":"Bohol Provincial Capitol, Tagbilaran City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R7-CEB-001: College Placement — Government Internship for Tertiary Scholars (CP-GIFTS)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r7-ceb-001', 'College Placement — Government Internship for Tertiary Scholars (CP-GIFTS)', 'Provincial Government of Cebu',
  'Region VII (Central Visayas)', 'Cebu', NULL, 'provincial',
  'active', TRUE, 'https://www.sunstar.com.ph/cebu/5300-scholarship-slots-open-for-cebu-students',
  85, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"₱10,000/semester per scholar; 5,300 slots for AY 2026; total allocation ₱150M for 2026","income_requirement_text":"Combined parental income not exceeding ₱200,000/year","residency_required":true,"course_restrictions":"Must enroll in a State College or University; not enrolled in medical or graduate course; not receiving other scholarships","slots":"5,300 (2026 batch); expanded from previous years via Cebu Provincial Board approval","application_period":"Deadline November 27, 2025 for AY 2026","notes":"IMPORTANT: Cebu City residents are NOT eligible — Cebu City is a HUC with its own program. Expanded CP-GIFTS approved by Provincial Board.","source":"https://www.sunstar.com.ph/cebu/5300-scholarship-slots-open-for-cebu-students | Asturias Cebu LGU page | Cebu Provincial Capitol","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R7-NOR-001: Provincial Scholarship Program — Province of Negros Oriental
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r7-nor-001', 'Provincial Scholarship Program — Province of Negros Oriental', 'Provincial Government of Negros Oriental',
  'Region VII (Central Visayas)', 'Negros Oriental', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"CSOs in Negros Oriental offer livelihood and scholarship assistance separately. No provincial LGU scholarship documentation found. Contact Capitol or PESO.","source":"Negros Oriental Provincial Capitol, Dumaguete City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R7-SIQ-001: Provincial Scholarship Program — Province of Siquijor
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r7-siq-001', 'Provincial Scholarship Program — Province of Siquijor', 'Provincial Government of Siquijor',
  'Region VII (Central Visayas)', 'Siquijor', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"Smallest province in Central Visayas; no online scholarship documentation found. Contact Capitol or PESO.","source":"Siquijor Provincial Capitol, Siquijor town","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R8-BIL-001: Provincial Scholarship Program — Province of Biliran
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r8-bil-001', 'Provincial Scholarship Program — Province of Biliran', 'Provincial Government of Biliran',
  'Region VIII (Eastern Visayas)', 'Biliran', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Biliran.","source":"Biliran Provincial Capitol, Naval, Biliran","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R8-EAS-001: Provincial Scholarship Program — Province of Eastern Samar
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r8-eas-001', 'Provincial Scholarship Program — Province of Eastern Samar', 'Provincial Government of Eastern Samar',
  'Region VIII (Eastern Visayas)', 'Eastern Samar', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Eastern Samar Provincial Capitol, Borongan City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R8-LEY-001: Provincial Scholarship Program — Province of Leyte
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r8-ley-001', 'Provincial Scholarship Program — Province of Leyte', 'Provincial Government of Leyte',
  'Region VIII (Eastern Visayas)', 'Leyte', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; TESDA scholarship programs available separately in Leyte","residency_required":true,"notes":"TESDA Leyte has provincial scholarship programs for tech-voc. Provincial college scholarship contact: PESO Leyte.","source":"Leyte Provincial Capitol, Tacloban City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R8-NOS-001: Provincial Scholarship Program — Province of Northern Samar
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r8-nos-001', 'Provincial Scholarship Program — Province of Northern Samar', 'Provincial Government of Northern Samar',
  'Region VIII (Eastern Visayas)', 'Northern Samar', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Northern Samar Provincial Capitol, Catarman","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R8-SAM-001: Provincial Scholarship Program — Province of Samar (Western Samar)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r8-sam-001', 'Provincial Scholarship Program — Province of Samar (Western Samar)', 'Provincial Government of Samar',
  'Region VIII (Eastern Visayas)', 'Samar', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Samar.","source":"Samar Provincial Capitol, Catbalogan City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R8-SOL-001: Provincial Scholarship Program — Province of Southern Leyte
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r8-sol-001', 'Provincial Scholarship Program — Province of Southern Leyte', 'Provincial Government of Southern Leyte',
  'Region VIII (Eastern Visayas)', 'Southern Leyte', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Southern Leyte.","source":"Southern Leyte Provincial Capitol, Maasin City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R9-ZDN-001: Provincial Scholarship Program — Province of Zamboanga del Norte
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r9-zdn-001', 'Provincial Scholarship Program — Province of Zamboanga del Norte', 'Provincial Government of Zamboanga del Norte',
  'Region IX (Zamboanga Peninsula)', 'Zamboanga del Norte', NULL, 'provincial',
  'active', TRUE, 'https://zamboangadelnorte.gov.ph/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown amount; educational assistance for incoming college students","residency_required":true,"application_period":"Applications for SY 2025–2026 were open (announced via Governor''s Facebook page)","notes":"Governor Darel Uy announced scholarship call on Facebook. Contact Provincial Capitol, Dipolog City, for 2026–2027 application details.","source":"https://zamboangadelnorte.gov.ph/ | Facebook: GovDarelUy","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R9-ZDS-001: Provincial Scholarship Program — Province of Zamboanga del Sur
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r9-zds-001', 'Provincial Scholarship Program — Province of Zamboanga del Sur', 'Provincial Government of Zamboanga del Sur',
  'Region IX (Zamboanga Peninsula)', 'Zamboanga del Sur', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated online documentation found. Contact Capitol or PESO.","source":"Zamboanga del Sur Provincial Capitol, Pagadian City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R9-ZSI-001: Zamboanga Sibugay Provincial Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r9-zsi-001', 'Zamboanga Sibugay Provincial Scholarship Program', 'Provincial Government of Zamboanga Sibugay',
  'Region IX (Zamboanga Peninsula)', 'Zamboanga Sibugay', NULL, 'provincial',
  'active', TRUE, 'https://www.scribd.com/document/900435422/A-Resolution-Establishing-a-Zamboanga-Sibugay-Provincial-Scholarship-Program',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown amount; financial assistance for deserving students","residency_required":true,"notes":"A Resolution establishing the scholarship program was found (Scribd). Program legally institutionalized. Contact Capitol for application details.","source":"https://www.scribd.com/document/900435422/A-Resolution-Establishing-a-Zamboanga-Sibugay-Provincial-Scholarship-Program | Zamboanga Sibugay Provincial Capitol, Ipil","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R10-BUK-001: Provincial Scholarship Program — Province of Bukidnon
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r10-buk-001', 'Provincial Scholarship Program — Province of Bukidnon', 'Provincial Government of Bukidnon',
  'Region X (Northern Mindanao)', 'Bukidnon', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Bukidnon.","source":"Bukidnon Provincial Capitol, Malaybalay City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R10-CAM-001: Provincial Scholarship Program — Province of Camiguin
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r10-cam-001', 'Provincial Scholarship Program — Province of Camiguin', 'Provincial Government of Camiguin',
  'Region X (Northern Mindanao)', 'Camiguin', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"Small island province; no online documentation found. Contact Capitol or PESO.","source":"Camiguin Provincial Capitol, Mambajao","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R10-LDN-001: Provincial Scholarship Program — Province of Lanao del Norte
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r10-ldn-001', 'Provincial Scholarship Program — Province of Lanao del Norte', 'Provincial Government of Lanao del Norte',
  'Region X (Northern Mindanao)', 'Lanao del Norte', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Lanao del Norte Provincial Capitol, Tubod","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R10-MOC-001: Provincial Scholarship Program — Province of Misamis Occidental
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r10-moc-001', 'Provincial Scholarship Program — Province of Misamis Occidental', 'Provincial Government of Misamis Occidental',
  'Region X (Northern Mindanao)', 'Misamis Occidental', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Misamis Occidental Provincial Capitol, Oroquieta City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R10-MOR-001: Provincial Scholarship Program — Province of Misamis Oriental
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r10-mor-001', 'Provincial Scholarship Program — Province of Misamis Oriental', 'Provincial Government of Misamis Oriental',
  'Region X (Northern Mindanao)', 'Misamis Oriental', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO MisOr.","source":"Misamis Oriental Provincial Capitol, Cagayan de Oro City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R11-DDO-001: Provincial Scholarship Program — Province of Davao de Oro (Compostela Valley)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r11-ddo-001', 'Provincial Scholarship Program — Province of Davao de Oro (Compostela Valley)', 'Provincial Government of Davao de Oro',
  'Region XI (Davao)', 'Davao de Oro', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Davao de Oro.","source":"Davao de Oro Provincial Capitol, Nabunturan","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R11-DDN-001: Provincial Scholarship Program — Province of Davao del Norte
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r11-ddn-001', 'Provincial Scholarship Program — Province of Davao del Norte', 'Provincial Government of Davao del Norte',
  'Region XI (Davao)', 'Davao del Norte', NULL, 'provincial',
  'active', TRUE, 'http://davaodelnorte.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"₱6.9M total budget for scholarship and youth programs; amount per scholar unknown","residency_required":true,"notes":"Budget allocation confirmed in government reports. Contact Capitol for application process.","source":"http://davaodelnorte.gov.ph | Davao del Norte Provincial Capitol, Tagum City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R11-DDS-001: Provincial Scholarship Program — Province of Davao del Sur
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r11-dds-001', 'Provincial Scholarship Program — Province of Davao del Sur', 'Provincial Government of Davao del Sur / Congresswoman Didi Cagas (CHED-linked)',
  'Region XI (Davao)', 'Davao del Sur', NULL, 'provincial',
  'active', TRUE, 'https://davaodelsur.gov.ph/scholarship-program/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"₱6,000 per qualified student (CHED-linked scholarship via Congresswoman); TESDA short-term training also available","income_requirement_text":"Low-income; barangay certificate of indigency/ITR or BIR exemption required","residency_required":true,"application_period":"Submit at Room 6, Provincial Capitol, Matti, Digos City","notes":"Partnership with CHED via district representative. Also has TESDA-linked vocational scholarship.","source":"https://davaodelsur.gov.ph/scholarship-program/","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R11-DOC-001: Provincial Scholarship Program — Province of Davao Occidental
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r11-doc-001', 'Provincial Scholarship Program — Province of Davao Occidental', 'Provincial Government of Davao Occidental',
  'Region XI (Davao)', 'Davao Occidental', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"New province (created 2013); no online documentation found. Contact Capitol or PESO.","source":"Davao Occidental Provincial Capitol, Malita","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R11-DOR-001: Provincial Scholarship Program — Province of Davao Oriental
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r11-dor-001', 'Provincial Scholarship Program — Province of Davao Oriental', 'Provincial Government of Davao Oriental',
  'Region XI (Davao)', 'Davao Oriental', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Davao Oriental.","source":"Davao Oriental Provincial Capitol, Mati City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R12-COT-001: Cotabato Provincial College Scholarship Program (Iskolar ng Cotabato)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r12-cot-001', 'Cotabato Provincial College Scholarship Program (Iskolar ng Cotabato)', 'Provincial Government of Cotabato (North Cotabato)',
  'Region XII (SOCCSKSARGEN)', 'Cotabato', NULL, 'provincial',
  'active', TRUE, 'https://philscholar.com/cotabato-provincial-college-scholarship-program/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial support for higher education; amount to be confirmed","income_requirement_text":"Barangay Certificate of Indigency or low-income proof required","residency_required":true,"course_restrictions":"Must enroll in HEI within Cotabato Province; not a recipient of other scholarships","application_period":"January 8–March 12, 2025 (AY 2025–2026); January–March 31 (AY 2026–2027); 8AM–5PM; submit at Agricenter, back of Provincial Engineering Office, Capitol Compound, Amas, Kidapawan City","notes":"Application letter addressed to Provincial Governor required. Late/incomplete applications not accepted. Grade 12 and up to 3rd-year college students eligible.","source":"https://philscholar.com/cotabato-provincial-college-scholarship-program/ | https://iskolarships.com/provincial-scholarship/","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R12-SAR-001: Provincial Scholarship Program — Province of Sarangani
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r12-sar-001', 'Provincial Scholarship Program — Province of Sarangani', 'Provincial Government of Sarangani',
  'Region XII (SOCCSKSARGEN)', 'Sarangani', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Sarangani.","source":"Sarangani Provincial Capitol, Alabel","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R12-SCO-001: Kabugwason Paglaum Scholarship and Grant-In-Aid Program (KPSGIAP)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r12-sco-001', 'Kabugwason Paglaum Scholarship and Grant-In-Aid Program (KPSGIAP)', 'Provincial Government of South Cotabato — Governor Reynaldo S. Tamayo Jr.',
  'Region XII (SOCCSKSARGEN)', 'South Cotabato', NULL, 'provincial',
  'active', TRUE, 'https://southcotabato.gov.ph/kabugwason-paglaum-scholarship-program-opens-applications-for-college-and-postgraduate-students-in-south-cotabato/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Monthly stipend; semestral tuition support; book allowance; board exam assistance for graduates; postgraduate (JD, MD, Masters, Doctoral) support","income_requirement_text":"Certificate of indigency or proof of income; financially disadvantaged","residency_required":true,"course_restrictions":"Must enroll in South Cotabato schools/colleges; expanded to include JD and postgraduate programs","slots":"120 slots (latest batch); recently expanded","application_period":"Applications open annually; announced via southcotabato.gov.ph","notes":"Vision: \"Free Education for All.\" One of the most active provincial scholarship programs in Mindanao. Board exam subsidy is a unique benefit.","source":"https://southcotabato.gov.ph/kabugwason-paglaum-scholarship-program-opens-applications-for-college-and-postgraduate-students-in-south-cotabato/ | https://sites.google.com/view/kabugwason-paglaum-scholarship/home","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R12-SKU-001: Provincial Scholarship Program — Province of Sultan Kudarat
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r12-sku-001', 'Provincial Scholarship Program — Province of Sultan Kudarat', 'Provincial Government of Sultan Kudarat',
  'Region XII (SOCCSKSARGEN)', 'Sultan Kudarat', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"Sultan Kudarat State University (SKSU) has institutional scholarships. No provincial LGU scholarship documentation found. Contact Capitol or PESO.","source":"Sultan Kudarat Provincial Capitol, Isulan","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R13-ADN-001: Provincial Scholarship Program — Province of Agusan del Norte
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r13-adn-001', 'Provincial Scholarship Program — Province of Agusan del Norte', 'Provincial Government of Agusan del Norte',
  'Region XIII (Caraga)', 'Agusan del Norte', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Agusan del Norte.","source":"Agusan del Norte Provincial Capitol, Butuan City area","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R13-ADS-001: Provincial Scholarship Program — Province of Agusan del Sur
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r13-ads-001', 'Provincial Scholarship Program — Province of Agusan del Sur', 'Provincial Government of Agusan del Sur',
  'Region XIII (Caraga)', 'Agusan del Sur', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO.","source":"Agusan del Sur Provincial Capitol, Prosperidad","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R13-DIN-001: Provincial Scholarship Program — Province of Dinagat Islands
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r13-din-001', 'Provincial Scholarship Program — Province of Dinagat Islands', 'Provincial Government of Dinagat Islands',
  'Region XIII (Caraga)', 'Dinagat Islands', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"Newest province (created 2006); no online documentation found. Contact Capitol or PESO.","source":"Dinagat Islands Provincial Capitol, San Jose, Dinagat Islands","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R13-SDN-001: Provincial Scholarship Program — Province of Surigao del Norte
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r13-sdn-001', 'Provincial Scholarship Program — Province of Surigao del Norte', 'Provincial Government of Surigao del Norte',
  'Region XIII (Caraga)', 'Surigao del Norte', NULL, 'provincial',
  'active', FALSE, 'https://surigaodelnorte.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; TESDA Surigao del Norte has scholarship programs for tech-voc","residency_required":true,"notes":"TESDA Surigao del Norte has an active scholarship page. Provincial LGU college scholarship details not found. Contact Capitol, Surigao City.","source":"https://surigaodelnorte.gov.ph | TESDA SdN: sites.google.com/a/tesda.gov.ph/surigao-del-norte","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R13-SDS-001: Scholarship Program — Province of Surigao del Sur
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r13-sds-001', 'Scholarship Program — Province of Surigao del Sur', 'Provincial Government of Surigao del Sur',
  'Region XIII (Caraga)', 'Surigao del Sur', NULL, 'provincial',
  'active', TRUE, 'https://bislig.gov.ph/scholarship-program-shs-college/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"College scholarship referenced at bislig.gov.ph","residency_required":true,"notes":"Bislig City (component city of Surigao del Sur) has an LGU scholarship program for SHS and college. Provincial-level program details require confirmation.","source":"https://bislig.gov.ph/scholarship-program-shs-college/ | Surigao del Sur Provincial Capitol, Tandag City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-CAR-ABR-001: Provincial Scholarship Program — Province of Abra
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-car-abr-001', 'Provincial Scholarship Program — Province of Abra', 'Provincial Government of Abra',
  'CAR', 'Abra', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Abra.","source":"Abra Provincial Capitol, Bangued","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-CAR-APA-001: Provincial Scholarship Program — Province of Apayao
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-car-apa-001', 'Provincial Scholarship Program — Province of Apayao', 'Provincial Government of Apayao',
  'CAR', 'Apayao', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Apayao.","source":"Apayao Provincial Capitol, Luna, Apayao","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-CAR-BEN-001: Provincial Scholarship Program — Province of Benguet
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-car-ben-001', 'Provincial Scholarship Program — Province of Benguet', 'Provincial Government of Benguet',
  'CAR', 'Benguet', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"DOST-CAR scholars from Benguet are the largest group in CAR (58 scholars in recent batch). No provincial college scholarship documentation found. Contact Capitol or PESO.","source":"Benguet Provincial Capitol, La Trinidad","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-CAR-IFU-001: Provincial Scholarship Program — Province of Ifugao
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-car-ifu-001', 'Provincial Scholarship Program — Province of Ifugao', 'Provincial Government of Ifugao',
  'CAR', 'Ifugao', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Ifugao.","source":"Ifugao Provincial Capitol, Lagawe","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-CAR-KAL-001: Provincial Scholarship Program — Province of Kalinga
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-car-kal-001', 'Provincial Scholarship Program — Province of Kalinga', 'Provincial Government of Kalinga',
  'CAR', 'Kalinga', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Kalinga.","source":"Kalinga Provincial Capitol, Tabuk City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-CAR-MTP-001: Provincial Scholarship Program — Province of Mountain Province
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-car-mtp-001', 'Provincial Scholarship Program — Province of Mountain Province', 'Provincial Government of Mountain Province',
  'CAR', 'Mountain Province', NULL, 'provincial',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No online documentation found. Contact Capitol or PESO Mountain Province.","source":"Mountain Province Capitol, Bontoc","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-BARMM-BAS-001: Provincial Scholarship Program — Province of Basilan / BARMM Scholarship Programs
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-barmm-bas-001', 'Provincial Scholarship Program — Province of Basilan / BARMM Scholarship Programs', 'Provincial Government of Basilan / MBHTE-BARMM',
  'BARMM', 'Basilan', NULL, 'provincial',
  'active', TRUE, 'https://bangsamoro.gov.ph',
  NULL, 8000, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"BARMM AHME-SP: ₱30,000/semester (₱60,000/year); BARMM BASE Program: ₱8,000/month; BASE-Merit: ₱20,000/month; 50 slots per BARMM province per batch","income_requirement_text":"Financial need","residency_required":true,"course_restrictions":"Science and technology priority courses for BASE; various for AHME","slots":"50 slots per province (25 BASE + 25 BASE-Merit) per batch","application_period":"Announced via MOST-BARMM and bangsamoro.gov.ph","notes":"Provincial-level LGU scholarships for Basilan are not separately documented. BARMM regional programs cover all 6 provinces. Students should also check with Basilan Provincial Capitol, Isabela City.","source":"https://bangsamoro.gov.ph | https://most.bangsamoro.gov.ph","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-BARMM-LDS-001: Provincial Scholarship Program — Province of Lanao del Sur / BARMM Programs
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-barmm-lds-001', 'Provincial Scholarship Program — Province of Lanao del Sur / BARMM Programs', 'Provincial Government of Lanao del Sur / MBHTE-BARMM',
  'BARMM', 'Lanao del Sur', NULL, 'provincial',
  'active', TRUE, 'https://bangsamoro.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Same as BARMM regional programs (AHME-SP, BASE, BASE-Merit)","income_requirement_text":"Financial need","residency_required":true,"course_restrictions":"Various","slots":"Regional allocation; 50 slots per province for BASE","application_period":"Announced via bangsamoro.gov.ph","notes":"Marawi City (within Lanao del Sur) may have additional city-level programs. Contact Capitol.","source":"https://bangsamoro.gov.ph | Lanao del Sur Provincial Capitol, Marawi City","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-BARMM-MGN-001: Provincial Scholarship Program — Province of Maguindanao del Norte / BARMM Programs
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-barmm-mgn-001', 'Provincial Scholarship Program — Province of Maguindanao del Norte / BARMM Programs', 'Provincial Government of Maguindanao del Norte / MBHTE-BARMM',
  'BARMM', 'Maguindanao del Norte', NULL, 'provincial',
  'active', TRUE, 'https://bangsamoro.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Same BARMM regional benefits","income_requirement_text":"Financial need","residency_required":true,"course_restrictions":"Various","slots":"Regional allocation","application_period":"Announced via MOST-BARMM","notes":"Maguindanao was split into del Norte and del Sur in 2022.","source":"https://bangsamoro.gov.ph | Maguindanao del Norte Capitol, Buluan","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-BARMM-MGS-001: Provincial Scholarship Program — Province of Maguindanao del Sur / BARMM Programs
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-barmm-mgs-001', 'Provincial Scholarship Program — Province of Maguindanao del Sur / BARMM Programs', 'Provincial Government of Maguindanao del Sur / MBHTE-BARMM',
  'BARMM', 'Maguindanao del Sur', NULL, 'provincial',
  'active', TRUE, 'https://bangsamoro.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Same BARMM regional benefits","income_requirement_text":"Financial need","residency_required":true,"course_restrictions":"Various","slots":"Regional allocation","application_period":"Announced via MOST-BARMM","notes":"Cotabato City is NOT part of BARMM (it is a special chartered city). Cotabato City has its own programs.","source":"https://bangsamoro.gov.ph | Maguindanao del Sur Capitol, Datu Odin Sinsuat","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-BARMM-SUL-001: Provincial Scholarship Program — Province of Sulu / BARMM Programs
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-barmm-sul-001', 'Provincial Scholarship Program — Province of Sulu / BARMM Programs', 'Provincial Government of Sulu / MBHTE-BARMM',
  'BARMM', 'Sulu', NULL, 'provincial',
  'active', TRUE, 'https://bangsamoro.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Same BARMM regional benefits","income_requirement_text":"Financial need","residency_required":true,"course_restrictions":"Various","slots":"Regional allocation","application_period":"Announced via bangsamoro.gov.ph","notes":"Security concerns in the area may affect application processes. Contact BARMM MBHTE directly.","source":"https://bangsamoro.gov.ph | Sulu Provincial Capitol, Jolo","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-BARMM-TAW-001: Provincial Scholarship Program — Province of Tawi-Tawi / BARMM Programs
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-barmm-taw-001', 'Provincial Scholarship Program — Province of Tawi-Tawi / BARMM Programs', 'Provincial Government of Tawi-Tawi / MBHTE-BARMM',
  'BARMM', 'Tawi-Tawi', NULL, 'provincial',
  'active', TRUE, 'https://bangsamoro.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Same BARMM regional benefits","income_requirement_text":"Financial need","residency_required":true,"course_restrictions":"Various","slots":"Regional allocation","application_period":"Announced via bangsamoro.gov.ph","notes":"Southernmost province of the Philippines. Contact BARMM MBHTE or Provincial Capitol.","source":"https://bangsamoro.gov.ph | Tawi-Tawi Provincial Capitol, Bongao","huc_excluded":true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-QC-001: Quezon City Scholarship Program (QCSP)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-qc-001', 'Quezon City Scholarship Program (QCSP)', 'Quezon City Government — QC Youth Development Office (QCYDO)',
  'NCR', NULL, 'Quezon City', 'city',
  'active', TRUE, 'https://quezoncity.gov.ph/program/qc-scholarship-program/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial assistance covering tuition; monthly stipend; mentorship programs; community engagement activities; SHS, College, Postgraduate, and Vocational tracks. Postgraduate: ₱20,000 base + ₱30,000 thesis/dissertation grant. New QC Excel Scholarship for priority courses (incoming freshmen)","income_requirement_text":"Low-income/underprivileged","residency_required":true,"course_restrictions":"Priority courses eligible for QC Excel track; must enroll in CHED/DepEd-recognized institution","slots":"18,000 scholars across SHS and college (AY 2026–2027)","application_period":"Applications open May–June annually (June 2–13, 2025 for AY 2025–2026; applications open May 2026 for AY 2026–2027)","notes":"Must not be receiving other LGU scholarships. Online application via QC eServices. One of the largest city scholarship programs in the Philippines.","source":"https://quezoncity.gov.ph/program/qc-scholarship-program/ | https://quezoncity.gov.ph/qcitizen-guides/qc-scholars-guide/"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-MNL-001: Manila City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-mnl-001', 'Manila City Scholarship Program', 'City Government of Manila',
  'NCR', NULL, 'Manila', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; Manila has historically provided educational assistance","residency_required":true,"notes":"No dedicated scholarship page found for Manila city government. Students should contact Manila City Hall directly or the city''s Social Services and Development Department.","source":"Manila City Hall, Padre Burgos Ave., Ermita, Manila | Check the Manila PESO and Social Services Office"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-CAL-001: Caloocan City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-cal-001', 'Caloocan City Scholarship Program', 'City Government of Caloocan',
  'NCR', NULL, 'Caloocan', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"University of Caloocan City (UCC) is an LUC with separate institutional scholarships. Contact City Hall for LGU scholarship program.","source":"Caloocan City Hall | University of Caloocan City has CHED-linked scholarships"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-PSG-001: PAG-ASA Scholarship Program (Pasig Assistance for Graduates Aiming for Success through Academics)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-psg-001', 'PAG-ASA Scholarship Program (Pasig Assistance for Graduates Aiming for Success through Academics)', 'City Government of Pasig — City Scholarship Office',
  'NCR', NULL, 'Pasig City', 'city',
  'active', TRUE, 'https://pasigcity.gov.ph/news-and-releases/pag-asa-scholarship-program-317',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Up to ₱35,000/semester until completion for qualifying students at partner private HEIs/TVIs in Pasig City","income_requirement_text":"Must be in Listahanan (NHTS-PR) OR monthly household income not exceeding ₱30,000","residency_required":true,"course_restrictions":"Priority undergraduate programs in participating private institutions in Pasig City","slots":"Multiple batches; Batch 3 open for new scholars, Batches 1–2 open for retention","application_period":"June 16–July 4, 2025 (AY 2025–2026); announced via pasigcity.gov.ph","notes":"Income requirement: Listahanan OR ₱30,000/month household ceiling.","source":"https://pasigcity.gov.ph/news-and-releases/pag-asa-scholarship-program-317 | 3/F Temporary Pasig City Hall, Eulogio Amang Rodriguez Ave., Brgy Rosario | scholarshipoffice@pasigcity.gov.ph"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-TAG-001: L.A.N.I. Scholarship Program (Lifeline Assistance for Neighbors In-need)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-tag-001', 'L.A.N.I. Scholarship Program (Lifeline Assistance for Neighbors In-need)', 'City Government of Taguig',
  'NCR', NULL, 'Taguig City', 'city',
  'active', TRUE, 'https://taguig.gov.ph/education/scholarship/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial support for education; tuition and allowance coverage","income_requirement_text":"Low-income; indigent families","residency_required":true,"course_restrictions":"Must be enrolled in recognized institution","application_period":"August 20–September 19, 2025 (AY 2025–2026); online application available","notes":"Taguig Scholarship Management System has an online portal. \"Embo\" barangays refer to the Rizal/Fort Bonifacio area previously disputed between Taguig and Makati.","source":"https://taguig.gov.ph/education/scholarship/ | https://scholar.taguig.gov.ph/ | City Ordinance No. 9, Series of 2011"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-VAL-001: Dr. Pio Valenzuela Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-val-001', 'Dr. Pio Valenzuela Scholarship Program', 'City Government of Valenzuela',
  'NCR', NULL, 'Valenzuela City', 'city',
  'active', TRUE, 'https://valenzuela.gov.ph/drpioscholarship/',
  85, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial assistance for college education; tuition support","income_requirement_text":"Annual gross income not more than ₱120,000; ITR 2316 with latest 1-month payslip required","residency_required":true,"application_period":"Announced via valenzuela.gov.ph","notes":"Strict income ceiling of ₱120,000/year. Both Grade 11 and Grade 12 transcripts required.","source":"https://valenzuela.gov.ph/drpioscholarship/"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-MAK-001: Makati City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-mak-001', 'Makati City Scholarship Program', 'City Government of Makati',
  'NCR', NULL, 'Makati City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; Makati is among the wealthiest LGUs and historically provides extensive educational assistance","residency_required":true,"notes":"Makati City has various social services programs. Students should contact the Makati City Scholarship Office at the City Hall.","source":"Makati City Hall, JP Rizal Ave., Makati | Makati PESO and Social Services"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-LPV-001: Las Piñas City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-lpv-001', 'Las Piñas City Scholarship Program', 'City Government of Las Piñas',
  'NCR', NULL, 'Las Piñas City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated scholarship page found. Contact City Hall or PESO Las Piñas.","source":"Las Piñas City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-MUN-001: Muntinlupa City Scholarship Program (Iskolar ng Bayan)
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-mun-001', 'Muntinlupa City Scholarship Program (Iskolar ng Bayan)', 'City Government of Muntinlupa — Muntinlupa Scholarship Division (MSD)',
  'NCR', NULL, 'Muntinlupa City', 'city',
  'active', TRUE, 'https://msd.muntinlupacity.gov.ph/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"₱5,000/semester per scholar (college); ₱5,000 one-time initial assistance for enrollment; Priority Scholarship (50 slots, DOST-SEI priority schools); Excellence Scholarship (50 slots, CHED Centers of Excellence); barangay-level allocation of 40 students per barangay","income_requirement_text":"Per barangay ordinance requirements","residency_required":true,"course_restrictions":"Priority Scholarship: enroll in DOST-SEI priority schools and programs in Luzon; Excellence: CHED Centers of Excellence; not a recipient of other government scholarships","slots":"~12,000+ college scholars; 94,000+ total scholars across all levels; 110,000 in peak support","application_period":"Announced via msd.muntinlupacity.gov.ph","notes":"One of the highest-volume city scholarship programs in Metro Manila. ₱2.4M+ in allowances distributed to college scholars. Ordinance No. 17-107 governs the program.","source":"https://msd.muntinlupacity.gov.ph/ | 2nd Floor, Plaza Central Building, Poblacion, Muntinlupa City"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-MRK-001: Marikina City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-mrk-001', 'Marikina City Scholarship Program', 'City Government of Marikina — City Scholarship Office under Office of the Mayor',
  'NCR', NULL, 'Marikina City', 'city',
  'active', TRUE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Comprehensive financial support for college education; tuition and allowances","income_requirement_text":"Financially challenged","residency_required":true,"application_period":"Announced via marikina.gov.ph","notes":"Program confirmed active via chedscholar.org guide. Contact Marikina City Hall for specific application periods.","source":"Marikina City Hall | City Scholarship Office under the Mayor''s Office"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-NCR-PAR-001: Parañaque City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-ncr-par-001', 'Parañaque City Scholarship Program', 'City Government of Parañaque',
  'NCR', NULL, 'Parañaque City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated scholarship page found. Contact City Hall or PESO Parañaque.","source":"Parañaque City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4A-ANT-001: Antipolo City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4a-ant-001', 'Antipolo City Scholarship Program', 'City Government of Antipolo',
  'Region IV-A (CALABARZON)', 'Rizal', 'Antipolo City', 'city',
  'active', TRUE, 'https://antipolo.ph/',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Financial assistance for college students","residency_required":true,"notes":"Antipolo is the capital and HUC of Rizal province. Separate from the Rizal Provincial (Iskolar ni Gob) program. Contact City Hall for details.","source":"https://antipolo.ph/ | Antipolo City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R7-CEBC-001: Cebu City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r7-cebc-001', 'Cebu City Scholarship Program', 'City Government of Cebu',
  'Region VII (Central Visayas)', NULL, 'Cebu City', 'city',
  'active', TRUE, 'https://www.philstar.com/the-freeman/cebu-news/2025/11/20/2488593/city-unlocks-2624-fully-funded-scholarship-slots',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"2,624 fully funded scholarship slots confirmed (Nov 2025); application form available; financial assistance for college","residency_required":true,"slots":"2,624 fully funded slots (AY 2025–2026)","application_period":"Applications open; announced via cebu.gov.ph and local media","notes":"Cebu City is a HUC and has its own program separate from the Cebu Province CP-GIFTS. Note: some sources show different program name (city hall scholarship registration form confirmed online).","source":"https://www.philstar.com/the-freeman/cebu-news/2025/11/20/2488593/city-unlocks-2624-fully-funded-scholarship-slots | Cebu City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R6-ILOC-001: Iloilo City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r6-iloc-001', 'Iloilo City Scholarship Program', 'City Government of Iloilo',
  'Region VI (Western Visayas)', NULL, 'Iloilo City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; Iloilo City has historically provided educational assistance","residency_required":true,"notes":"Iloilo City is a HUC separate from Iloilo Province (which has ISIP). Contact City Hall or check their Facebook page for scholarship announcements.","source":"Iloilo City Hall, Iloilo City"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R6-BACC-001: Bacolod City PESO Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r6-bacc-001', 'Bacolod City PESO Scholarship Program', 'City Government of Bacolod — Public Employment Service Office (PESO)',
  'Region VI (Western Visayas)', NULL, 'Bacolod City', 'city',
  'active', TRUE, 'https://bacolodcity.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"₱3,000/semester per scholar (starting AY 2025–2026); tuition subsidy to partner schools; ₱2.4M+ in allowances distributed","residency_required":true,"course_restrictions":"Must be enrolled in partner private colleges and universities in Bacolod City","application_period":"Announced via City Hall","notes":"Bacolod City is a HUC and NOT eligible for NOSP (Negros Occidental provincial program). Bacolod City College is an LUC with CHED-linked scholars. PESO scholarship provides ₱3,000 supplemental allowance.","source":"https://bacolodcity.gov.ph | PESO Bacolod City"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R8-TAC-001: Tacloban City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r8-tac-001', 'Tacloban City Scholarship Program', 'City Government of Tacloban',
  'Region VIII (Eastern Visayas)', NULL, 'Tacloban City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"UP Tacloban College has separate institutional scholarships. Contact City Hall for LGU scholarship program.","source":"Tacloban City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-CAR-BAG-001: Baguio City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-car-bag-001', 'Baguio City Scholarship Program', 'City Government of Baguio — City Social Welfare and Development Office (CSWDO) / City Scholarship Board',
  'CAR', NULL, 'Baguio City', 'city',
  'active', TRUE, 'https://new.baguio.gov.ph/news/scholarships-for-deserving-students-proposed',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Tuition, allowances, and other educational expenses covered; need-based and academic tracks available","income_requirement_text":"Financial need; low-income families prioritized","residency_required":true,"course_restrictions":"Priority courses include education, nursing, tourism, IT, engineering, environmental science","slots":"Limited (academic excellence slots); need-based more accessible","application_period":"Announced via baguio.gov.ph","notes":"Baguio City is the capital of Benguet but functions as an independent city. Contact CSWDO or Mayor''s Office.","source":"https://new.baguio.gov.ph/news/scholarships-for-deserving-students-proposed | Baguio City Hall / Education Committee"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R11-DAV-001: Educational Benefit System Unit (EBSU) Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r11-dav-001', 'Educational Benefit System Unit (EBSU) Scholarship Program', 'City Government of Davao — Educational Benefit System Unit (EBSU)',
  'Region XI (Davao)', NULL, 'Davao City', 'city',
  'active', TRUE, 'https://ebsu-escholar.davaocity.gov.ph/',
  85, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Part A: ₱50,000/semester; Part B: ₱40,000/semester; Part C: ₱15,000/semester (tuition and school fees); Law: Full scholar ₱50,000 tuition + ₱8,000 book/semester; Half scholar ₱25,000 + ₱4,000 book/semester","income_requirement_text":"Indigent or below average income (pre-determined by CSWDO)","residency_required":true,"course_restrictions":"Priority courses AY 2025–2026: Teacher Education (Science/Math secondary), IT courses (CS, Cybersecurity, IS, Multimedia), Health courses (Nursing, MedTech, Pharmacy, Physical Therapy, Allied Health); 453 scholars accepted for SY 2025–2026","slots":"453 scholars (AY 2025–2026); 424 scholars (AY 2025–2026 earlier batch)","application_period":"Online application at https://ebsu-escholar.davaocity.gov.ph/; 2026 applications open","notes":"Tiered benefit system (A/B/C) based on financial need level. Law scholarships available. eScholar app for application. One of the best-documented city scholarship programs in Mindanao.","source":"https://ebsu-escholar.davaocity.gov.ph/ | https://davaocity.gov.ph/education/"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R9-ZAM-001: Zamboanga City Educational Assistance Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r9-zam-001', 'Zamboanga City Educational Assistance Program', 'City Government of Zamboanga — City Ordinance 908',
  'Region IX (Zamboanga Peninsula)', NULL, 'Zamboanga City', 'city',
  'active', TRUE, 'https://zamboangacity.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Transportation allowance ₱750/semester for college students in public schools/SUCs; Agriculture/Fisheries scholarship: ₱40,000/year; Hawak Kamay scholarship exam for incoming freshmen (SWU-PHINMA partnership)","income_requirement_text":"Low-income","residency_required":true,"course_restrictions":"General track: public schools/SUCs; Agriculture/Fisheries track: specific qualifying courses","application_period":"Hawak Kamay exam for SY 2026–2027; City Ordinance 908 launched March 2026","notes":"Agriculture/Fisheries scholarship provides ₱40,000/year. City ordinance recently (March 2026) launched comprehensive educational aid program for kinder to college.","source":"https://zamboangacity.gov.ph | (062) 992-0420 or 991-4525"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R10-CDO-001: Cagayan de Oro City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r10-cdo-001', 'Cagayan de Oro City Scholarship Program', 'City Government of Cagayan de Oro — City Scholarships Office',
  'Region X (Northern Mindanao)', NULL, 'Cagayan de Oro City', 'city',
  'active', TRUE, 'https://www.cagayandeoro.gov.ph/index.php/news/the-city-hall/the-departments-and-offices/115-city-scholarships-office.html',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Full tuition, matriculation, and other fees; monthly stipend; holistic formation programs","income_requirement_text":"Gross total annual family income not exceeding ₱300,000","residency_required":true,"course_restrictions":"Type 1: any course at partner school including board and medical courses (Nursing, MedTech, Pharmacy, etc.); Type 2: non-board/non-medical courses at approved schools; must not have a sibling/family member who is a current city scholar","application_period":"Online application deadline March 15, 2026 (AY 2026–2027); Results May 30, 2026","notes":"Two scholarship types: full-course partner schools vs. non-board courses. Income ceiling ₱300,000/year. Good documentation.","source":"https://www.cagayandeoro.gov.ph/index.php/news/the-city-hall/the-departments-and-offices/115-city-scholarships-office.html | Facebook: CDOCityScholarshipsOffice"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R12-GEN-001: General Santos City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r12-gen-001', 'General Santos City Scholarship Program', 'City Government of General Santos',
  'Region XII (SOCCSKSARGEN)', NULL, 'General Santos City', 'city',
  'active', TRUE, 'https://www.gensantos.gov.ph',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Educational assistance for financially challenged GenSan residents; tuition support","income_requirement_text":"Financially challenged","residency_required":true,"application_period":"Announced via gensantos.gov.ph","notes":"GSCWD (General Santos City Water District) also runs a separate scholarship with income ceiling ₱250,000 for GSCWD priority courses. Contact City Hall.","source":"https://www.gensantos.gov.ph | General Santos City Hall, National Highway, Lagao"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R10-ILI-001: Iligan City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r10-ili-001', 'Iligan City Scholarship Program', 'City Government of Iligan',
  'Region X (Northern Mindanao)', NULL, 'Iligan City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; Iligan is an independent component city","residency_required":true,"notes":"No dedicated scholarship page found. Contact City Hall or PESO Iligan.","source":"Iligan City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R13-BUT-001: Butuan City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r13-but-001', 'Butuan City Scholarship Program', 'City Government of Butuan',
  'Region XIII (Caraga)', NULL, 'Butuan City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated scholarship page found. Contact City Hall or PESO Butuan.","source":"Butuan City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4B-PPT-001: Puerto Princesa City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4b-ppt-001', 'Puerto Princesa City Scholarship Program', 'City Government of Puerto Princesa',
  'Region IV-B (MIMAROPA)', NULL, 'Puerto Princesa City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; PALECO scholarship (for cooperative member dependents) is a separate program","residency_required":true,"notes":"Puerto Princesa is a HUC and capital of Palawan, administered separately. Contact City Hall for city-level scholarship.","source":"Puerto Princesa City Hall | PSU School of Medicine has its own scholarship"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R12-COT-001: Cotabato City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r12-cot-001c', 'Cotabato City Scholarship Program', 'City Government of Cotabato',
  'Region XII (SOCCSKSARGEN)', NULL, 'Cotabato City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"Cotabato City is a special chartered city not part of BARMM. Not eligible for BARMM regional programs. Contact City Hall for LGU scholarship.","source":"Cotabato City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R5-LEG-001: Legazpi City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r5-leg-001', 'Legazpi City Scholarship Program', 'City Government of Legazpi',
  'Region V (Bicol)', 'Albay', 'Legazpi City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated scholarship page found. Contact City Hall or PESO Legazpi.","source":"Legazpi City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R4A-LUC-001: Lucena City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r4a-luc-001', 'Lucena City Scholarship Program', 'City Government of Lucena',
  'Region IV-A (CALABARZON)', 'Quezon', 'Lucena City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"Lucena is the capital and highly urbanized city of Quezon Province. NOT eligible for Quezon Province LGU scholarship.","source":"Lucena City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-CAB-001: Cabanatuan City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-cab-001', 'Cabanatuan City Scholarship Program', 'City Government of Cabanatuan',
  'Region III (Central Luzon)', 'Nueva Ecija', 'Cabanatuan City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"residency_required":true,"notes":"No dedicated scholarship page found. Contact City Hall or PESO Cabanatuan.","source":"Cabanatuan City Hall"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-SJDM-001: San Jose del Monte City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-sjdm-001', 'San Jose del Monte City Scholarship Program', 'City Government of San Jose del Monte',
  'Region III (Central Luzon)', 'Bulacan', 'San Jose del Monte City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; City College of SJDM has CHED-linked scholarships (TES, TDP)","residency_required":true,"notes":"City College of SJDM offers TES and TDP (national CHED programs). Contact City Hall for city-specific LGU scholarship.","source":"SJDM City Hall | City College of SJDM: ccsjdm.com"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;

-- LGU-R3-MAL-001: Malolos City Scholarship Program
INSERT INTO listings (
  type, slug, title, provider,
  region, province, city, scope,
  status, is_verified, external_url,
  gwa_requirement, monthly_stipend, income_ceiling,
  service_obligation_years,
  requirements, target_year_levels,
  scholarship_meta
) VALUES (
  'scholarship', 'lgu-r3-mal-001', 'Malolos City Scholarship Program', 'City Government of Malolos',
  'Region III (Central Luzon)', NULL, 'Malolos City', 'city',
  'active', FALSE, '',
  NULL, NULL, NULL,
  NULL,
  ARRAY[]::text[], ARRAY[]::text[],
  '{"benefits_text":"Unknown; Bulacan Polytechnic College (BPC) in Malolos has PGB scholarship","residency_required":true,"notes":"Malolos residents may also qualify for the Provincial Government of Bulacan''s \"Tulong Pang-Edukasyon\" scholarship. Contact City Hall for city-specific program.","source":"Malolos City Hall | BPC: bulpolycol.bulacan.gov.ph/scholarship.php"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title                    = EXCLUDED.title,
  provider                 = EXCLUDED.provider,
  region                   = EXCLUDED.region,
  province                 = EXCLUDED.province,
  city                     = EXCLUDED.city,
  scope                    = EXCLUDED.scope,
  status                   = EXCLUDED.status,
  is_verified              = EXCLUDED.is_verified,
  external_url             = EXCLUDED.external_url,
  gwa_requirement          = EXCLUDED.gwa_requirement,
  monthly_stipend          = EXCLUDED.monthly_stipend,
  income_ceiling           = EXCLUDED.income_ceiling,
  service_obligation_years = EXCLUDED.service_obligation_years,
  requirements             = EXCLUDED.requirements,
  target_year_levels       = EXCLUDED.target_year_levels,
  scholarship_meta         = EXCLUDED.scholarship_meta;
