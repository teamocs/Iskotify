-- 057_drop_estimate_admission_score_rpc.sql
--
-- The Estimated Admission Score is computed on the device again
-- (apps/mobile/utils/admissionEstimate.ts, a tested port of this function), so
-- the estimator works offline. The server RPC from 020 has had no callers since
-- June and no grants since 029. Its definition stays in 020 if it is ever needed.
-- upcat_cutoffs (also from 020) stays: the app syncs it for the campus list.

DROP FUNCTION IF EXISTS public.estimate_admission_score(jsonb);
