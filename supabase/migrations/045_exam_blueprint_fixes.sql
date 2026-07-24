-- Fix ACET/USTET blueprint data drift discovered while building timer scaling:
--   * ACET declares 245 items / 270 min but its 3 seeded sections only sum to
--     180 items / 180 min — the mechanics note's mandatory "General Information"
--     block (65 items / 90 min) was never seeded.
--   * USTET declares 210 min but its four 45-min subtests sum to 180 min.
-- Additive only: one new section row + declared-time corrections, with
-- updated_at bumped explicitly everywhere so the mobile updated_at-cursor sync
-- (apps/mobile/services/sync.ts) picks the change up on next pull.
--
-- The new acet:4 section below references skill_category 'General Information',
-- which was never added to exam_skill_categories (seeded with 8 categories in
-- 032_seed_exam_blueprints.sql). Seed it here too, matching that row shape.

INSERT INTO exam_skill_categories (name, requires_spatial_logic, display_order, updated_at) VALUES
  ('General Information', false, 9, now())
ON CONFLICT (name) DO UPDATE SET requires_spatial_logic = EXCLUDED.requires_spatial_logic, display_order = EXCLUDED.display_order, updated_at = now();

INSERT INTO exam_blueprint_sections (id,blueprint_slug,name,skill_category,item_count,time_minutes,requires_spatial_logic,display_order,updated_at)
VALUES ('acet:4','acet','General Information','General Information',65,90,false,4,now())
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name, skill_category=EXCLUDED.skill_category, item_count=EXCLUDED.item_count,
  time_minutes=EXCLUDED.time_minutes, requires_spatial_logic=EXCLUDED.requires_spatial_logic,
  display_order=EXCLUDED.display_order, updated_at=now();

UPDATE exam_blueprints SET total_time_minutes = 180, updated_at = now() WHERE slug = 'ustet';

UPDATE exam_blueprint_sections SET updated_at = now() WHERE blueprint_slug IN ('acet','ustet');
UPDATE exam_blueprints SET updated_at = now() WHERE slug IN ('acet','ustet');
