#!/bin/sh
set -e

BIN=/app/stellar-disbursement-platform

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
# Start nginx (serves the React frontend on port 80)
# =============================================================================
nginx -g "daemon off;" &

# Wait briefly for nginx to bind its port
sleep 1

# =============================================================================
# Start the Go backend (listens on port 8000)
# =============================================================================
$BIN serve &
BACKEND_PID=$!

# Forward SIGTERM/SIGINT to the backend process
trap 'kill -TERM $BACKEND_PID; wait $BACKEND_PID' TERM INT

# Block until the backend exits, propagating its exit code
wait $BACKEND_PID
