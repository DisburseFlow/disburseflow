# =============================================================================
# Stellar Disbursement Platform — Monorepo Makefile
# =============================================================================

SUDO := $(shell docker version >/dev/null 2>&1 || echo "sudo")

.PHONY: build build-backend build-frontend \
        dev dev-backend dev-frontend dev-setup setup \
        db-migrate tenant-setup \
        test test-backend test-frontend \
        lint lint-backend lint-frontend \
        docker-build docker-compose-up docker-compose-down \
        install install-backend install-frontend clean help

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
build-backend:
	@echo "┌─ Building backend ──────────────────────────────┐"
	cd backend && go build -o stellar-disbursement-platform .
	@echo "└──────────────────────────────────────────────────┘"

build-frontend:
	@echo "┌─ Building frontend ──────────────────────────────┐"
	cd frontend && yarn install --immutable && yarn build
	@echo "└──────────────────────────────────────────────────┘"

build: build-backend build-frontend
	@echo "✅ Both backend and frontend built successfully."

# ---------------------------------------------------------------------------
# Development  (run on host for fast HMR / live-reload)
# ---------------------------------------------------------------------------

# One-time setup: installs yarn, generates keys, creates .env
dev-setup:
	@echo "🚀 Running dev environment setup..."
	scripts/dev-setup.sh

# Official interactive setup wizard (generates config, funds accounts, starts Docker)
setup:
	@echo "🚀 Launching SDP interactive setup wizard..."
	cd backend && go run tools/sdp-setup/main.go

# Prerequisite checks before dev
.PHONY: _check-prereqs
_check-prereqs:
	@if ! command -v go >/dev/null 2>&1; then echo "❌ Go is required: https://go.dev/dl/"; exit 1; fi
	@if ! command -v node >/dev/null 2>&1; then echo "❌ Node.js ≥22 is required: https://nodejs.org/"; exit 1; fi
	@if ! command -v yarn >/dev/null 2>&1; then echo "📦 Installing yarn..."; npm install -g yarn; fi
	@if ! command -v openssl >/dev/null 2>&1; then echo "❌ openssl is required"; exit 1; fi
	@if [ ! -f .env ]; then echo "📝 Creating .env from template..."; scripts/dev-setup.sh; fi

dev-backend: _check-prereqs
	@echo "┌─ Starting backend dev server ────────────────────┐"
	@echo "│   http://localhost:8000                           │"
	@echo "└──────────────────────────────────────────────────┘"
	cd backend && ENV_FILE=$(CURDIR)/.env go run . serve

dev-frontend: _check-prereqs
	@echo "┌─ Starting frontend dev server ───────────────────┐"
	@echo "│   http://localhost:3000                           │"
	@echo "└──────────────────────────────────────────────────┘"
	@if [ ! -d frontend/node_modules ]; then cd frontend && yarn install; fi
	@# Ensure runtime env config exists (created by dev-setup)
	@if [ ! -f frontend/public/settings/env-config.js ]; then \
		mkdir -p frontend/public/settings && \
		printf 'window._env_ = { API_URL: "http://localhost:8000", SINGLE_TENANT_MODE: true };\n' > frontend/public/settings/env-config.js; \
	fi
	cd frontend && \
	  mkdir -p src/generated && \
	  (git rev-parse --short HEAD >/dev/null 2>&1 && yarn git-info || \
	    echo "export default { commitHash: 'dev', version: 'dev' };" > src/generated/gitInfo.ts) && \
	  yarn start

dev:
	@echo "🚀 Starting both dev servers concurrently..."
	@echo "   Backend  → http://localhost:8000"
	@echo "   Frontend → http://localhost:3000"
	$(MAKE) -j2 dev-backend dev-frontend

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------
test-backend:
	@echo "┌─ Testing backend ────────────────────────────────┐"
	cd backend && go test -count=1 ./...
	@echo "└──────────────────────────────────────────────────┘"

test-frontend:
	@echo "┌─ Testing frontend ───────────────────────────────┐"
	cd frontend && yarn test --watchAll=false 2>/dev/null || echo "(no test runner configured)"
	@echo "└──────────────────────────────────────────────────┘"

test: test-backend test-frontend
	@echo "✅ All tests completed."

# ---------------------------------------------------------------------------
# Linting
# ---------------------------------------------------------------------------
lint-backend:
	@echo "┌─ Linting backend ────────────────────────────────┐"
	cd backend && go vet ./...
	@echo "└──────────────────────────────────────────────────┘"

lint-frontend:
	@echo "┌─ Linting frontend ───────────────────────────────┐"
	cd frontend && npx eslint src/
	@echo "└──────────────────────────────────────────────────┘"

lint: lint-backend lint-frontend
	@echo "✅ All lints passed."

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
tenant-setup:
	scripts/tenant-setup.sh

db-migrate:
	@echo "┌─ Running all database migrations ────────────────┐"
	@echo "  (requires PostgreSQL running on DATABASE_URL)"
	@echo ""
	@echo "  1. Admin (multi-tenant module)..."
	cd backend && ENV_FILE=$(CURDIR)/.env go run . db admin migrate up
	@echo "  2. TSS (transaction submission)..."
	cd backend && ENV_FILE=$(CURDIR)/.env go run . db tss migrate up
	@echo "  3. SDP (per-tenant)..."
	cd backend && ENV_FILE=$(CURDIR)/.env go run . db sdp migrate up --all
	@echo "  4. Auth (per-tenant)..."
	cd backend && ENV_FILE=$(CURDIR)/.env go run . db auth migrate up --all
	@echo "  5. Setting up assets/wallets for network..."
	cd backend && ENV_FILE=$(CURDIR)/.env go run . db setup-for-network --all
	@echo ""
	@echo "✅ All migrations complete."
	@echo "└──────────────────────────────────────────────────┘"

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------
docker-build:
	$(SUDO) docker build \
		--build-arg GIT_COMMIT=$(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown") \
		-t stellar-disbursement-platform:latest .

docker-compose-up:
	docker compose up --build

docker-compose-down:
	docker compose down

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
install-backend:
	cd backend && go mod download

install-frontend:
	cd frontend && yarn install --immutable

install: install-backend install-frontend
	@echo "✅ Dependencies installed."

# ---------------------------------------------------------------------------
# Clean
# ---------------------------------------------------------------------------
clean:
	rm -rf frontend/build frontend/node_modules frontend/src/generated
	cd backend && go clean -cache
	@echo "✅ Clean complete."

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Setup:"
	@echo "  dev-setup        Install prerequisites and create .env with dev keys"
	@echo ""
	@echo "Build:"
	@echo "  build            Build both backend and frontend"
	@echo ""
	@echo "Development:"
	@echo "  dev              Auto-setup + start both dev servers"
	@echo "  dev-backend      Start Go dev server (port 8000)"
	@echo "  dev-frontend     Start Vite dev server (port 3000)"
	@echo ""
	@echo "Testing:"
	@echo "  test             Run all tests"
	@echo ""
	@echo "Linting:"
	@echo "  lint             Lint all code"
	@echo ""
	@echo "Docker:"
	@echo "  docker-build     Build production Docker image"
	@echo "  docker-compose-up   Start all services via Compose"
	@echo "  docker-compose-down Stop all services"
	@echo ""
	@echo "Other:"
	@echo "  install          Install all dependencies"
	@echo "  clean            Remove build artifacts"
