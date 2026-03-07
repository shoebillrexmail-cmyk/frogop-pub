#!/usr/bin/env bash
# setup-db.sh — one-time D1 provisioning script
# Creates the frogop-indexer D1 database via wrangler, parses the returned UUID,
# and patches wrangler.toml in place so no manual copy-paste is needed.
#
# Usage: run from indexer/ directory
#   npm run db:setup
#
# Idempotent: if database_id is already set (not the placeholder), it skips creation.
set -euo pipefail

TOML="wrangler.toml"
PLACEHOLDER="REPLACE_AFTER_wrangler_d1_create"
DB_NAME="frogop-indexer"

# ── Idempotency check ─────────────────────────────────────────────────────────
CURRENT_ID=$(grep 'database_id' "$TOML" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || true)
if [ -n "$CURRENT_ID" ]; then
  echo "ℹ  D1 already configured: $CURRENT_ID"
  echo "   Skipping database creation."
  echo ""
  echo "Run 'npm run db:migrate' to apply the schema if you haven't already."
  exit 0
fi

# ── Create the database ───────────────────────────────────────────────────────
echo "🚀 Creating D1 database '$DB_NAME'..."
OUTPUT=$(npx wrangler d1 create "$DB_NAME" 2>&1)
echo "$OUTPUT"
echo ""

# Parse UUID — works for both wrangler v2 (TOML snippet) and v3 (JSON object)
UUID=$(echo "$OUTPUT" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)

if [ -z "$UUID" ]; then
  echo "❌  Could not parse a UUID from wrangler output."
  echo "   Copy the uuid/database_id value and replace '$PLACEHOLDER' in $TOML manually."
  exit 1
fi

echo "✅ UUID parsed: $UUID"

# ── Patch wrangler.toml ───────────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS sed requires an extension argument
  sed -i '' "s/$PLACEHOLDER/$UUID/" "$TOML"
else
  sed -i "s/$PLACEHOLDER/$UUID/" "$TOML"
fi

echo "✅ Patched $TOML — database_id = \"$UUID\""
echo ""
echo "Next steps:"
echo "  1. npm run db:migrate        — apply schema.sql to production D1"
echo "  2. git add $TOML"
echo "  3. git commit -m 'chore(indexer): set D1 database_id'"
echo "  4. git push                  — GitHub Actions will deploy on merge to master"
