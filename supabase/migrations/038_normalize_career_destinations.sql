-- 038_normalize_career_destinations.sql
--
-- Normalize career_destinations.country so every genuine FOREIGN country resolves
-- to a career_countries.code — the join key used by the app's countryCodeFromName()
-- and the website Destinations tab (apps/admin/lib/destinations.ts). Before this,
-- rows like "United Kingdom" (-> united-kingdom) were dropped because the country
-- row is "UK" (-> uk), and several real destination countries had no row at all.
--
-- Two parts, both idempotent:
--   1) Add real destination countries that had destination rows but no
--      career_countries entry.
--   2) Collapse name aliases of EXISTING countries (United Kingdom -> UK, etc.).
--
-- Intentionally NOT added (these are not single geographic countries, so they do
-- not belong in a destination-COUNTRIES grid): Philippines (domestic), "Remote",
-- "International (UN/NGO)", "Global", "Multilateral", "Cruise Lines", "LNG/FOC
-- vessels", and generic "Middle East". They remain excluded by design.

-- ── 1) Missing real foreign countries ────────────────────────────────────────
INSERT INTO career_countries (code, name, region, immigration_system, why_demand, language_required, pr_pathway, notes)
VALUES
  ('hong-kong', 'Hong Kong', 'East Asia', 'Employment visa', 'Finance and trade hub; construction; healthcare', 'English widely used', 'Possible (after 7 years)', 'Major Asian financial centre with a large Filipino community.'),
  ('indonesia', 'Indonesia', 'Southeast Asia', 'Work permit (KITAS)', 'ASEAN growth; mining; manufacturing; energy', 'English in MNCs; Bahasa helpful', 'Limited', 'Regional postings with ASEAN employers and multilaterals.'),
  ('malaysia', 'Malaysia', 'Southeast Asia', 'Employment Pass', 'Electronics and semiconductor; oil and gas; shared services', 'English widely used', 'Possible', 'Penang and KL electronics and shared-services hubs.'),
  ('belgium', 'Belgium', 'Western Europe', 'EU Blue Card / Single Permit', 'EU institutions (Brussels); pharma; logistics', 'English in EU bodies; French/Dutch helpful', 'Yes (PR to Citizenship)', 'Brussels hosts EU and international institutions.'),
  ('greece', 'Greece', 'Southern Europe', 'Work permit; EU shipping employers', 'Global shipping and maritime management hub', 'English in shipping', 'Yes (EU pathway)', 'Greek shipping companies recruit Filipino maritime officers.'),
  ('spain', 'Spain', 'Southern Europe', 'Work permit', 'Healthcare; tourism; renewable energy', 'Spanish required', 'Yes (PR to Citizenship)', 'Growing demand; Spanish language is the main barrier.'),
  ('switzerland', 'Switzerland', 'Western Europe', 'Work permit (quota)', 'Geneva humanitarian/UN hub; pharma; finance', 'English in international orgs; German/French helpful', 'Possible (after 10 years)', 'Geneva is a global hub for UN agencies and NGOs.'),
  ('papua-new-guinea', 'Papua New Guinea', 'Oceania', 'Work permit', 'Mining; LNG; construction', 'English (official)', 'Limited', 'Resource-sector postings in mining and LNG.'),
  ('kenya', 'Kenya', 'Africa', 'Work permit; international org postings', 'Regional hubs for INGOs and research', 'English (official)', 'Limited', 'Nairobi hosts regional offices of international organisations.')
ON CONFLICT (code) DO NOTHING;

-- ── 2) Collapse aliases of existing countries ────────────────────────────────
UPDATE career_destinations SET country = 'UK'  WHERE country = 'United Kingdom';
UPDATE career_destinations SET country = 'UAE' WHERE country = 'United Arab Emirates';
UPDATE career_destinations SET country = 'UAE' WHERE country = 'UAE or Gulf';
