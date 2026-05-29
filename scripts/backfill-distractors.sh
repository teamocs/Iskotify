#!/usr/bin/env bash
# Drains the distractor-backfill queue. Re-runs until remaining=0.
# Requires: ADMIN_BACKFILL_URL and ADMIN_BACKFILL_SECRET env vars.

set -euo pipefail
: "${ADMIN_BACKFILL_URL:?env var required, e.g. https://admin.iskotify.app/api/flashcards/backfill}"
: "${ADMIN_BACKFILL_SECRET:?env var required}"

while true; do
  resp=$(curl -sfX POST "$ADMIN_BACKFILL_URL?limit=50" \
    -H "x-admin-secret: $ADMIN_BACKFILL_SECRET")
  echo "$resp" | jq .
  remaining=$(echo "$resp" | jq -r '.remaining // 0')
  [ "$remaining" -eq 0 ] && break
done
echo "✓ All cards enhanced."
