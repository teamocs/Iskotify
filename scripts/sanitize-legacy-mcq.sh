#!/usr/bin/env bash
# Two-pass legacy MCQ sanitization: dry-run first, prompts before real run.
# Requires: ADMIN_BACKFILL_URL_BASE and ADMIN_BACKFILL_SECRET env vars.

set -euo pipefail
: "${ADMIN_BACKFILL_URL_BASE:?env var, e.g. https://admin.iskotify.app/api/flashcards}"
: "${ADMIN_BACKFILL_SECRET:?env var required}"

echo "→ Dry run (no writes)..."
curl -sfX POST "$ADMIN_BACKFILL_URL_BASE/sanitize-legacy?limit=1000&dry_run=1" \
  -H "x-admin-secret: $ADMIN_BACKFILL_SECRET" | jq .

echo
read -rp "Proceed with real sanitization? [y/N] " ok
[ "$ok" = "y" ] || { echo "Aborted."; exit 0; }

echo "→ Real run..."
curl -sfX POST "$ADMIN_BACKFILL_URL_BASE/sanitize-legacy?limit=1000&dry_run=0" \
  -H "x-admin-secret: $ADMIN_BACKFILL_SECRET" | jq .

echo "✓ Sanitization done."
