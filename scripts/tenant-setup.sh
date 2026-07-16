#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

echo "┌──────────────────────────────────────────────────────┐"
echo "│  SDP — Tenant & Admin User Setup                    │"
echo "└──────────────────────────────────────────────────────┘"
echo ""

# ─── Step 1: Ensure default tenant ────────────────────────────────────

echo "📋 Step 1/2: Creating default tenant..."
cd "$REPO_ROOT/backend"

TENANT_OUTPUT=$(ENV_FILE="$ENV_FILE" go run . tenants ensure-default 2>&1)
echo "$TENANT_OUTPUT"

# Extract tenant UUID from output. Handles both:
#   "Created default tenant: default (9682573f-...)"
#   "Default tenant exists: default (9682573f-...)"
TENANT_ID=$(echo "$TENANT_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)

if [ -z "$TENANT_ID" ]; then
  # If tenant already exists, fetch it from the API
  echo "📋 Tenant may already exist. Fetching tenant ID..."
  ADMIN_ACCOUNT=$(grep ADMIN_ACCOUNT "$ENV_FILE" | cut -d= -f2- | head -1)
  ADMIN_API_KEY=$(grep ADMIN_API_KEY "$ENV_FILE" | cut -d= -f2- | head -1)
  ADMIN_PORT=$(grep ADMIN_PORT "$ENV_FILE" | cut -d= -f2- | head -1)
  ADMIN_PORT=${ADMIN_PORT:-8003}

  TENANT_ID=$(curl -s -H "Authorization: Basic $(printf '%s' "$ADMIN_ACCOUNT:$ADMIN_API_KEY" | base64 -w0 2>/dev/null || printf '%s' "$ADMIN_ACCOUNT:$ADMIN_API_KEY" | base64)" \
    "http://localhost:$ADMIN_PORT/tenants" 2>/dev/null | sed -n 's/.*"id":"\([^"]*\).*/\1/p' | head -1 || true)
fi

if [ -z "$TENANT_ID" ]; then
  echo "⚠️  Could not determine tenant ID. The 'tenants ensure-default' output above should show it."
  echo "   You can manually add a user later with:"
  echo "   cd backend && ENV_FILE=$ENV_FILE go run . auth add-user owner@default.local Default Owner --password --owner --roles owner --tenant-id <TENANT_ID>"
  exit 1
fi

echo "✅  Tenant ID: $TENANT_ID"
echo ""

# ─── Step 2: Add admin user with Password123! ─────────────────────────

echo "📋 Step 2/2: Adding admin user (owner@default.local / Password123!)..."
cd "$REPO_ROOT/backend"

# The auth add-user --password flag reads from stdin
echo "Password123!" | ENV_FILE="$ENV_FILE" go run . auth add-user \
  "owner@default.local" "Default" "Owner" \
  --password --owner --roles owner \
  --tenant-id "$TENANT_ID" 2>&1 || true

# If user already exists, that's fine
echo "✅  Admin user: owner@default.local / Password123!"
echo ""

cd "$REPO_ROOT"
echo "┌──────────────────────────────────────────────────────┐"
echo "│  🎉 Setup complete!                                  │"
echo "│                                                      │"
echo "│  Login URL:  http://localhost:3000                    │"
echo "│  Username:   owner@default.local                     │"
echo "│  Password:   Password123!                            │"
echo "└──────────────────────────────────────────────────────┘"
