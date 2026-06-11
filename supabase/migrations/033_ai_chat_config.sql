-- AI Chat Config: single-row remote-control table for Kuya Baw's prompts, guardrails, and RAG budgets.
-- Admins can override any prompt piece or adjust RAG tuning without a mobile release.
-- Public read (mobile syncs it) + admin write (Supabase RLS admin policy).

CREATE TABLE IF NOT EXISTS ai_chat_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Per-piece text overrides. Empty string '' = use mobile builtin.
  core_rules_override           text NOT NULL DEFAULT '',
  scope_block_override          text NOT NULL DEFAULT '',
  grounding_rule_override       text NOT NULL DEFAULT '',
  anti_injection_override       text NOT NULL DEFAULT '',
  progress_addendum_override    text NOT NULL DEFAULT '',
  topic_addendum_override       text NOT NULL DEFAULT '',
  math_addendum_override        text NOT NULL DEFAULT '',
  -- RAG budget tuning. 0 = use mobile builtin default.
  rag_total_token_budget        int  NOT NULL DEFAULT 700,
  rag_per_block_char_cap        int  NOT NULL DEFAULT 280,
  -- Block enable/disable flags (jsonb → mobile stores as TEXT).
  rag_blocks_enabled            jsonb NOT NULL DEFAULT '{"flashcards":true,"listings":true,"courses":true,"progress":true}',
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger (reuses the update_updated_at() function created in an earlier migration)
DROP TRIGGER IF EXISTS ai_chat_config_updated_at ON ai_chat_config;
CREATE TRIGGER ai_chat_config_updated_at BEFORE UPDATE ON ai_chat_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE ai_chat_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_chat_config_read   ON ai_chat_config;
CREATE POLICY ai_chat_config_read ON ai_chat_config FOR SELECT USING (true);

DROP POLICY IF EXISTS ai_chat_config_admin  ON ai_chat_config;
CREATE POLICY ai_chat_config_admin ON ai_chat_config FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Seed the single config row (admin edits it; never re-insert on re-run)
INSERT INTO ai_chat_config (id) VALUES (1) ON CONFLICT DO NOTHING;
