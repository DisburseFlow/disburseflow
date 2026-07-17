#!/bin/sh
set -e

BIN=/app/stellar-disbursement-platform

# =============================================================================
# Write runtime env-config.js for the React frontend.
#
# API_URL must be the public URL of this service (same origin), so browser
# requests go to nginx and are proxied through to the Go backend.
#
# Override by setting PUBLIC_URL in the container's environment variables.
# Defaults to empty string (same-origin relative URLs).
# =============================================================================
PUBLIC_URL="${PUBLIC_URL:-}"
ENV_CONFIG_PATH="/usr/share/nginx/html/settings/env-config.js"
mkdir -p "$(dirname "$ENV_CONFIG_PATH")"

cat > "$ENV_CONFIG_PATH" <<EOF
window._env_ = {
  API_URL: "${PUBLIC_URL}",
  DISABLE_TENANT_PREFIL_FROM_DOMAIN: "${DISABLE_TENANT_PREFIL_FROM_DOMAIN:-}",
  STELLAR_EXPERT_URL: "${STELLAR_EXPERT_URL:-https://stellar.expert/explorer/testnet}",
  HORIZON_URL: "${HORIZON_URL:-https://horizon-testnet.stellar.org}",
  RPC_ENABLED: ${RPC_ENABLED:-false},
  RECAPTCHA_SITE_KEY: "${RECAPTCHA_SITE_KEY:-}",
  SINGLE_TENANT_MODE: ${SINGLE_TENANT_MODE:-true},
};
EOF

echo "✅ env-config.js written (API_URL=${PUBLIC_URL})"

# =============================================================================
# Run database migrations before starting any services.
# The SDP requires four migration passes + network setup:
#   1. admin  — creates the multi-tenant schema (incl. the "tenants" table)
#   2. tss    — transaction submission service tables
#   3. sdp    — per-tenant SDP tables
#   4. auth   — per-tenant auth tables
#   5. setup-for-network — seeds assets & wallets for the configured network
# =============================================================================
echo "⏳ Running admin migrations..."
$BIN db admin migrate up

echo "⏳ Running TSS migrations..."
$BIN db tss migrate up

echo "⏳ Running SDP migrations..."
$BIN db sdp migrate up --all

echo "⏳ Running Auth migrations..."
$BIN db auth migrate up --all

echo "⏳ Setting up assets & wallets for network..."
$BIN db setup-for-network --all

echo "✅ Migrations complete."

# =============================================================================
# Ensure the default tenant exists (idempotent — safe to run on every deploy).
# =============================================================================
echo "⏳ Ensuring default tenant..."
$BIN tenants ensure-default || echo "⚠️  tenant ensure-default failed (may already exist)"

echo "✅ Tenant setup complete."

# =============================================================================
# Start nginx (serves the React frontend on the platform-assigned public port).
#
# Render (and similar PaaS) inject a PORT env var naming the port that must
# receive public traffic. The Go backend's own "port" config option reads
# that same env var name, so if left ambient, Render's PORT would collide
# with the backend's and route traffic straight to it, bypassing nginx.
# We resolve this by making nginx listen on $PORT, and pinning the backend to
# a fixed internal port passed explicitly via --port (ignoring env PORT).
# =============================================================================
PUBLIC_PORT="${PORT:-80}"
BACKEND_PORT=8000

sed -i "s/__PUBLIC_PORT__/${PUBLIC_PORT}/" /etc/nginx/http.d/default.conf

nginx -g "daemon off;" &

# Wait briefly for nginx to bind its port
sleep 1

# =============================================================================
# Start the Go backend on its fixed internal port (nginx proxies to it above)
# =============================================================================
$BIN serve --port "${BACKEND_PORT}" &
BACKEND_PID=$!

# Forward SIGTERM/SIGINT to the backend process
trap 'kill -TERM $BACKEND_PID; wait $BACKEND_PID' TERM INT

# Block until the backend exits, propagating its exit code
wait $BACKEND_PID
