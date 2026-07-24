-- Task 5: university_profiles.requirements / .qualifications
-- Requirements = paper documents (Form 137/138, report card, clearance,
-- barangay certificate, ID photos, ...). Qualifications = eligibility
-- criteria (GWA minimums, strand, citizenship, age, ...). Additive only —
-- no backfill, admin fills these in later. Both default to '{}' so existing
-- rows are unaffected and no updated_at bump is needed (values are empty).
alter table university_profiles add column if not exists requirements text[] not null default '{}';
alter table university_profiles add column if not exists qualifications text[] not null default '{}';
