-- admissions_updates seed — June 3, 2026 weekly digest
-- 20 rows: urgent(1) + important(4) + info(6) + no_change(7) + unable_to_verify(2)
-- Idempotent: ON CONFLICT (id) DO UPDATE

INSERT INTO admissions_updates (
  id, report_date, severity,
  school_slug, school_name,
  title, body,
  action_required, event_date, event_type,
  sources, verified
) VALUES

-- =========================================================
-- URGENT / ISKOTIFY ACTION REQUIRED
-- =========================================================

(
  '2026-06-03-upcat-2027-exam',
  '2026-06-03',
  'urgent',
  'upcat',
  'University of the Philippines — UPCAT 2027',
  'UPCAT 2027 Portal is LIVE — Exam August 1–2, 2026',
  'The UPCAT 2027 portal is confirmed active. Application period (March 3–30, 2026) and school confirmation (Form 2A, until April 10) are both closed. Exam is on August 1–2, 2026 — approximately 59 days away. Grade submission (Form 2B) opens August 3–24 after the exam; results expected first half of 2027.',
  'Surface UPCAT countdown timer and UPG calculator prominently in the app. Trigger push notification: "UPCAT 2027 is in 59 days." to users with UP campuses bookmarked.',
  '2026-08-01',
  'exam',
  '[{"label":"UP opens online applications for UPCAT 2027; exam set on August 1–2, 2026 — Inquirer","url":""},{"label":"UPCAT 2027 Portal — UP Office of Admissions","url":"https://upcat2027online.up.edu.ph"},{"label":"UPCAT 2027 Important Dates — UP Tacloban","url":""}]'::jsonb,
  true
),

-- =========================================================
-- NEW ANNOUNCEMENTS (important)
-- =========================================================

(
  '2026-06-03-feucat-app-open',
  '2026-06-03',
  'important',
  'feu',
  'Far Eastern University — FEUCAT SY 2026–2027',
  'FEUCAT SY 2026–2027 — Application Open, New Regional Centers Added',
  'FEU opened SY 2026-2027 admissions. FEUCAT runs every Saturday at 8AM and 1PM. New testing centers added this cycle: Leyte, Occidental Mindoro, and Palawan. Exam fee is PHP 500.',
  'Update FEU university card in app — add new testing center regions (Leyte, Occidental Mindoro, Palawan). May affect Iskotify users from those provinces.',
  NULL,
  'app_open',
  '[{"label":"More regional testing centers open — FEU News","url":""},{"label":"FEU Application for SY 2026-2027 is open — Facebook","url":""},{"label":"FEU Admissions Portal","url":"https://admission.feu.edu.ph/"}]'::jsonb,
  true
),

(
  '2026-06-03-pupcet-app-open',
  '2026-06-03',
  'important',
  'pup',
  'Polytechnic University of the Philippines — PUPCET SY 2026–2027',
  'PUPCET SY 2026–2027 — Application Open via iApply',
  'PUP College Entrance Test application for AY 2026-2027 is open through the iApply portal at pup.edu.ph/iapply/pupcet. Deadline has not yet been confirmed.',
  'Confirm deadline on PUP website. Update PUPCET schedule card in app.',
  NULL,
  'app_open',
  '[{"label":"PUPCET Application for AY 2026-2027 — Facebook (PUP Calaunan)","url":""},{"label":"PUP iApply Portal","url":"https://www.pup.edu.ph/iapply/pupcet"}]'::jsonb,
  true
),

(
  '2026-06-03-xu-regular-exam-open',
  '2026-06-03',
  'important',
  'xu',
  'Xavier University — AY 2026–2027',
  'Xavier University AY 2026–2027 — Regular Exam Window Still Open',
  'XU masterlist of accepted AY 2026-2027 freshmen has been released with over 2,516 external applicants accepted. Students who missed November 2025 testing can still apply via regular exam schedules starting March 2026. Apply at xu.edu.ph/apply.',
  NULL,
  NULL,
  NULL,
  '[{"label":"MASTERLIST: Accepted Incoming College Freshmen AY 2026-2027 — xu.edu.ph","url":"https://www.xu.edu.ph/apply"}]'::jsonb,
  true
),

-- =========================================================
-- INFO UPDATES
-- =========================================================

(
  '2026-06-03-acet-results-released',
  '2026-06-03',
  'info',
  'acet',
  'Ateneo de Manila University — ACET AY 2026–2027',
  'ACET AY 2026–2027 — Results Released April 8, 2026',
  'ACET results for the current cycle were sent via email (accepted, waitlisted, or not accepted). AY 2027-2028 cycle is expected to open July–September 2026 based on prior years.',
  'Watch for ACET 2027-2028 opening announcement in July 2026. Pre-schedule notification in app.',
  '2026-04-08',
  'results',
  '[{"label":"Ateneo releases ACET Results for AY 2026-2027 — The Summit Express","url":""},{"label":"Admissions Calendar — ateneo.edu","url":""}]'::jsonb,
  true
),

(
  '2026-06-03-dcat-results-released',
  '2026-06-03',
  'info',
  'dlsu',
  'De La Salle University — DCAT AY 2026–2027',
  'DCAT AY 2026–2027 — Results Released; Financial Aid Window Open',
  'DLSU DCAT results are out. Financial assistance (St. La Salle Grant) application window for DCAT applicants runs April 17–May 17, 2026; for Special DCAT applicants, the window is May 26–June 1, 2026.',
  'Update DLSU financial aid timeline in app scholarships section.',
  '2026-04-17',
  'results',
  '[{"label":"DLSU releases DCAT Results for AY 2026-2027 — The Summit Express","url":""}]'::jsonb,
  true
),

(
  '2026-06-03-ustet-results-released',
  '2026-06-03',
  'info',
  'ust',
  'University of Santo Tomas — USTET AY 2026–2027',
  'USTET AY 2026–2027 — Results Released ~April 28, 2026',
  'USTET testing ran October 19, 2025 – February 1, 2026, with some provincial exams rescheduled into February. Results were expected to be released around April 28, 2026.',
  NULL,
  '2026-04-28',
  'results',
  '[{"label":"USTET results for AY 2026-2027 expected on April 28 — The Summit Express","url":""},{"label":"USTET 2026 Testing Dates for AY 2026-2027 — UST OFAD","url":""}]'::jsonb,
  true
),

(
  '2026-06-03-wvsu-results-releasing',
  '2026-06-03',
  'info',
  'wvsu',
  'West Visayas State University — WVSU AE AY 2026–2027',
  'WVSU AY 2026–2027 — Exam Done (March 8), Results Releasing from April 14',
  'Approximately 15,000 applicants took the WVSU Admission Exam on March 8, 2026. Results are being released alphabetically starting April 14, 2026.',
  NULL,
  '2026-04-14',
  'results',
  '[{"label":"WVSU prepares for March 8 admission exam — wvsu.edu.ph","url":""}]'::jsonb,
  true
),

(
  '2026-06-03-msu-sase-results-released',
  '2026-06-03',
  'info',
  'msu',
  'Mindanao State University — MSU-SASE AY 2026–2027',
  'MSU-SASE AY 2026–2027 — Exam Held October 5, 2025; Results Released',
  'MSU SASE for AY 2026-2027 was completed with the exam held on October 5, 2025. Results have been released. A record surge in MSU-IIT applicants was noted this cycle.',
  NULL,
  NULL,
  'results',
  '[{"label":"MSU SASE 2026-2027 Guide — ExamsPinas","url":""},{"label":"MSU System Admissions see record surge — msuiit.edu.ph","url":""}]'::jsonb,
  true
),

(
  '2026-06-03-plm-admissions-open',
  '2026-06-03',
  'info',
  'plm',
  'Pamantasan ng Lungsod ng Maynila — PLM AY 2026–2027',
  'PLM AY 2026–2027 — Applications Open; Multi-Factor Ranking System',
  'PLM admissions are open. There is no tuition fee. Final ranking combines PLMAT score, SHS GWA, and socioeconomic/geographic factors.',
  NULL,
  NULL,
  'app_open',
  '[{"label":"PLM Admissions Page","url":""}]'::jsonb,
  true
),

(
  '2026-06-03-batstateucat-qualifiers-announced',
  '2026-06-03',
  'info',
  'batstateu',
  'Batangas State University — BatStateUCAT AY 2026–2027',
  'BatStateUCAT AY 2026–2027 — Qualifiers Announced, Enrollment Ongoing',
  'BatStateU qualifiers for AY 2026-2027 have been published. Enrollment is currently ongoing.',
  NULL,
  NULL,
  NULL,
  '[{"label":"BatStateUCAT AY 2026-2027 Qualifiers — TAO Facebook","url":""}]'::jsonb,
  true
),

-- =========================================================
-- NO CHANGE CONFIRMED (no_change)
-- =========================================================

(
  '2026-06-03-nochange-acet',
  '2026-06-03',
  'no_change',
  'acet',
  'Ateneo de Manila University — ACET',
  'ACET — AY 2026-2027 Cycle Complete; Next Cycle Expected July 2026',
  'ACET AY 2026-2027 admissions cycle is done. Next cycle is expected to open in July 2026.',
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  true
),

(
  '2026-06-03-nochange-dcat',
  '2026-06-03',
  'no_change',
  'dlsu',
  'De La Salle University — DCAT',
  'DCAT — AY 2026-2027 Cycle Complete; Next Cycle Expected Q3 2026',
  'DCAT AY 2026-2027 admissions cycle is done. Next cycle is expected in Q3 2026.',
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  true
),

(
  '2026-06-03-nochange-ustet',
  '2026-06-03',
  'no_change',
  'ust',
  'University of Santo Tomas — USTET',
  'USTET — AY 2026-2027 Cycle Complete; Next Cycle Expected Q4 2026',
  'USTET AY 2026-2027 admissions cycle is done. Next cycle is expected in Q4 2026.',
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  true
),

(
  '2026-06-03-nochange-bucet',
  '2026-06-03',
  'no_change',
  'bicol-univ',
  'Bicol University — BUCET',
  'BUCET — AY 2026-2027 Cycle Complete; App Period Was Aug–Oct 2025',
  'BUCET AY 2026-2027 admissions cycle is done. Application period ran August–October 2025.',
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  true
),

(
  '2026-06-03-nochange-clsu-cat',
  '2026-06-03',
  'no_change',
  'clsu',
  'Central Luzon State University — CLSU-CAT',
  'CLSU-CAT — AY 2026-2027 Cycle Running; Portal Active',
  'CLSU-CAT AY 2026-2027 cycle is currently running with the portal active.',
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  true
),

(
  '2026-06-03-nochange-mmsu-cat',
  '2026-06-03',
  'no_change',
  'mmsu',
  'Mariano Marcos State University — MMSU-CAT',
  'MMSU-CAT — AY 2026-2027 Enrollment Underway',
  'MMSU-CAT AY 2026-2027 admissions are complete and enrollment is underway.',
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  true
),

(
  '2026-06-03-nochange-mapua',
  '2026-06-03',
  'no_change',
  'mapua',
  'Mapua University — MPASS',
  'MPASS — Application Open; Provincial Testing Center Dates Pending Update',
  'Mapua University MPASS application is confirmed open for AY 2026-2027 (College Freshmen and SHS) via admissions.mapua.edu.ph. MPASS is a rolling online assessment with no single fixed exam date. Provincial testing centers page still shows 2023 dates — new onsite slot dates expected to be announced on their Facebook page in Q3–Q4 2026.',
  'Watch for provincial testing center date update on Mapua Facebook or announcements page.',
  NULL,
  'app_open',
  '[{"label":"Mapua Admissions Portal","url":"https://admissions.mapua.edu.ph"}]'::jsonb,
  true
),

-- =========================================================
-- UNABLE TO VERIFY (info + verified=false)
-- =========================================================

(
  '2026-06-03-unverified-aducet',
  '2026-06-03',
  'info',
  'adamson',
  'Adamson University — AdUCET',
  'AdUCET — No Recent Announcement Found; Manual Check Needed',
  'No recent AY 2026-2027 announcement found for AdUCET. Manual check of the Adamson admissions page is required.',
  'Manually check https://www.adamson.edu.ph/aducet/ and add to Batch B next week.',
  NULL,
  NULL,
  '[{"label":"Adamson Admissions Portal","url":"https://www.adamson.edu.ph/aducet/"}]'::jsonb,
  false
),

(
  '2026-06-03-unverified-usc-cat',
  '2026-06-03',
  'info',
  'usc',
  'University of San Carlos — USC-CAT',
  'USC-CAT AY 2026-2027 — Guidelines Missing; Portal Open But No Exam Schedule Published',
  'Direct website crawl confirmed no AY 2026-27 admissions guidelines published. The /admission-guidelines-for-ay2026-27 page returns 404 and news feed shows zero admissions announcements for April–May 2026. ISMIS portal is open for application submission but no official exam schedule exists. Last published guidelines were for AY 2025-26 (January 12, 2025), making this approximately 5 months overdue.',
  'Flag USC-CAT as an open question in app. Manually check USC Admissions Facebook (facebook.com/uscadmissions) for any announcement not on the website.',
  NULL,
  NULL,
  '[{"label":"USC Admissions Facebook","url":"https://www.facebook.com/uscadmissions"},{"label":"USC ISMIS Portal","url":"https://ismis.usc.edu.ph"}]'::jsonb,
  false
)

ON CONFLICT (id) DO UPDATE SET
  report_date    = EXCLUDED.report_date,
  severity       = EXCLUDED.severity,
  school_slug    = EXCLUDED.school_slug,
  school_name    = EXCLUDED.school_name,
  title          = EXCLUDED.title,
  body           = EXCLUDED.body,
  action_required= EXCLUDED.action_required,
  event_date     = EXCLUDED.event_date,
  event_type     = EXCLUDED.event_type,
  sources        = EXCLUDED.sources,
  verified       = EXCLUDED.verified;
