CREATE TABLE IF NOT EXISTS upcat_cutoffs (
  id text PRIMARY KEY,
  campus text NOT NULL,
  program text,
  cutoff numeric NOT NULL,
  year int,
  is_estimate boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE upcat_cutoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upcat_cutoffs_read ON upcat_cutoffs;
CREATE POLICY upcat_cutoffs_read ON upcat_cutoffs FOR SELECT USING (true);
DROP TRIGGER IF EXISTS upcat_cutoffs_updated_at ON upcat_cutoffs;
CREATE TRIGGER upcat_cutoffs_updated_at BEFORE UPDATE ON upcat_cutoffs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.estimate_admission_score(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m_mean CONSTANT numeric := 50; m_sd CONSTANT numeric := 12;
  r_mean CONSTANT numeric := 58; r_sd CONSTANT numeric := 10;
  l_mean CONSTANT numeric := 62; l_sd CONSTANT numeric := 9;
  s_mean CONSTANT numeric := 52; s_sd CONSTANT numeric := 11;
  h_mean CONSTANT numeric := 88; h_sd CONSTANT numeric := 5;
  hsgwa numeric := (payload->>'hsGWA')::numeric;
  ma numeric := COALESCE((payload->>'math')::numeric, m_mean);
  rc numeric := COALESCE((payload->>'reading')::numeric, r_mean);
  lp numeric := COALESCE((payload->>'language')::numeric, l_mean);
  sc numeric := COALESCE((payload->>'science')::numeric, s_mean);
  school_type text := COALESCE(payload->>'schoolType','');
  is_ip boolean := COALESCE((payload->>'isIndigenous')::boolean, false);
  target_far boolean := COALESCE((payload->>'targetCampusFar')::boolean, false);
  zma numeric; zrc numeric; zlp numeric; zsc numeric; zh numeric;
  upg numeric; eff numeric; palugit numeric := 0; pabigat numeric := 0; elig_pal boolean := false;
  lo numeric; hi numeric; campuses jsonb;
BEGIN
  IF hsgwa IS NULL THEN RAISE EXCEPTION 'hsGWA required'; END IF;
  ma := least(greatest(ma,0),100); rc := least(greatest(rc,0),100);
  lp := least(greatest(lp,0),100); sc := least(greatest(sc,0),100);
  hsgwa := least(greatest(hsgwa,0),100);
  zma := (ma-m_mean)/m_sd; zrc := (rc-r_mean)/r_sd; zlp := (lp-l_mean)/l_sd;
  zsc := (sc-s_mean)/s_sd; zh := (hsgwa-h_mean)/h_sd;
  upg := 2.8101 - 0.047147*zma - 0.046402*zrc - 0.1381*zlp - 0.15531*zh - 0.025178*(zsc*zlp*zh);
  upg := least(greatest(upg,1.0),5.0);
  elig_pal := is_ip OR school_type IN ('public_general','public_vocational','public_barangay');
  IF elig_pal THEN palugit := 0.05; END IF;
  IF target_far THEN pabigat := 0.05; END IF;
  eff := least(greatest(upg - palugit + pabigat, 1.0), 5.0);
  lo := greatest(eff-0.20,1.0); hi := least(eff+0.20,5.0);
  SELECT jsonb_agg(jsonb_build_object(
    'campus', c.campus, 'program', c.program, 'cutoff', c.cutoff, 'year', c.year,
    'isEstimate', c.is_estimate,
    'status', CASE WHEN eff <= c.cutoff THEN 'likely' WHEN eff <= c.cutoff+0.30 THEN 'possible' ELSE 'unlikely' END,
    'gap', round(eff - c.cutoff, 3)) ORDER BY c.cutoff)
  INTO campuses FROM upcat_cutoffs c WHERE c.program IS NULL;
  RETURN jsonb_build_object(
    'point', round(eff,3), 'low', round(lo,3), 'high', round(hi,3),
    'eeas', jsonb_build_object('palugit', palugit, 'pabigat', pabigat, 'eligiblePalugit', elig_pal),
    'campuses', COALESCE(campuses, '[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.estimate_admission_score(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_admission_score(jsonb) TO authenticated;
-- App is offline-first with anonymous users; the Manlapaz coefficients are already public
-- (seeded in upcat_facts), so anon execute is safe and required for the estimator to work for all users.
GRANT EXECUTE ON FUNCTION public.estimate_admission_score(jsonb) TO anon;
