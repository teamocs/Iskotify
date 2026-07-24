-- Kuya Baw kill-switch: chat is retired by default until self-hosted AI exists.
-- Admins re-enable it remotely by flipping this flag; mobile syncs it and treats
-- a missing/unsynced config row as DISABLED (fail-closed).

alter table ai_chat_config add column if not exists chat_enabled boolean not null default false;

-- Bump updated_at on the existing seed row so the mobile updated_at-cursor sync
-- (apps/mobile/services/sync.ts) actually pulls this column on next sync.
update ai_chat_config set updated_at = now() where id = 1;
