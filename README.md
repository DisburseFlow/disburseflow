# Stellar Disbursement Platform (SDP)

An open-source project for the **Stellar Disbursement Platform** — a web application for
organizations to disburse bulk payments to recipients using the Stellar network.

> 📖 **Official documentation:** [developers.stellar.org/docs/platforms/stellar-disbursement-platform](https://developers.stellar.org/docs/platforms/stellar-disbursement-platform/admin-guide/getting-started)

| Component | Location | Tech Stack |
|-----------|----------|-----------|
| **Frontend** | `frontend/` | React 19, TypeScript, Vite 7, Redux Toolkit, TanStack Query |
| **Backend** | `backend/` | Go 1.25, PostgreSQL, Cobra CLI, Chi router |
| **Demo Wallet** | `backend/dev/Dockerfile-demo-wallet` | Stellar Demo Wallet (Testnet) |
| **Smart Contracts** | `contracts/` | Rust, Soroban |

---

## Quick Start

> **Prerequisites:** [Go](https://go.dev/dl/) ≥ 1.25, [Node.js](https://nodejs.org/) ≥ 22, [Docker](https://docker.com), [jq](https://jqlang.github.io/jq/download/)

### Option A: Automated dev setup (recommended)

```bash
# One command — installs deps, generates keys, starts both servers:
make dev
```

This will:
1. ✅ Check prerequisites (Go, Node.js, Yarn, openssl)
2. ✅ Install Yarn if missing
3. ✅ Generate cryptographic keys & create `.env`
4. ✅ Install frontend dependencies
5. ✅ Start **backend** on `http://localhost:8000` and **frontend** on `http://localhost:3000`

> **Before running** `make dev`, start PostgreSQL:
> ```bash
> docker compose up db -d
> ```

### Option B: Official setup wizard

The project includes the official interactive setup wizard (same as `make setup` in the
standalone backend repo):

```bash
make setup
```

This opens an interactive prompt that:
1. Walks you through network selection (testnet/pubnet)
2. Generates and funds Stellar accounts on testnet (via Friendbot)
3. Creates a fully configured `.env` file
4. Optionally starts Docker Compose and initializes tenants
5. Prints admin login credentials

---

## Manual Setup (step by step)

### 1. Clone & prepare

```bash
git clone <repo-url> && cd <repo-directory>
```

### 2. Generate environment configuration

```bash
# Option A: Automated (generates all keys, no prompts)
make dev-setup

# Option B: Interactive wizard (walks through every option)
make setup
```

The generated `.env` includes:
- **EC256 private key** — signs authentication tokens (JWT)
- **SEP-10 Stellar keypair** — Stellar Web Authentication
- **Distribution account keypair** — Stellar distribution account
- **Encryption passphrase** — encrypts distribution account keys
- **Random secrets** — JWT secret, admin credentials

Review the generated `.env` and adjust values as needed.

### 3. Set up PostgreSQL

```bash
docker compose up db -d
```

### 4. Run database migrations

```bash
make db-migrate
```

This runs all 5 migration groups in order: admin, tss, sdp, auth, and network setup.

### 5. Create the admin user

```bash
make tenant-setup
```

This creates the default tenant (organization) with the admin user configured
in your `.env` (`DEFAULT_TENANT_OWNER_EMAIL`, `DEFAULT_TENANT_OWNER_FIRST_NAME`,
`DEFAULT_TENANT_OWNER_LAST_NAME`).

### 6. Start development servers

```bash
# Both servers:
make dev

# Or individually:
make dev-backend   # Go API on port 8000
make dev-frontend  # Vite dev server on port 3000 with HMR
```

---

## Docker Compose

Run the full stack with Docker:

```bash
docker compose up --build
```

### Services & Ports

| Service | Port | Image | Description |
|---------|------|-------|-------------|
| `db` | 5432 | `postgres:16-alpine` | PostgreSQL database |
| `backend` | 8000, 8002, 8003, 2345 | Go (Dockerfile.development) | API server + metrics + admin API + Delve debugger |
| `frontend` | 3000 | Node (Dockerfile.dev) | Vite dev server with HMR |
| `demo-wallet` | 4000 | Nginx (Dockerfile-demo-wallet) | Stellar Demo Wallet for testing disbursements |

### Official Docker Compose

The official compose files are also available in `backend/dev/`:

```bash
docker compose -f backend/dev/docker-compose.yml --env-file backend/dev/.env up
```

---

## Project Structure

```
./
├── Makefile                #  Build orchestrator
├── Dockerfile              #  Multi-stage production image
├── docker-compose.yml      #  Local development stack
├── nginx.conf              #  Reverse proxy config (production)
├── docker-entrypoint.sh    #  Container entrypoint (nginx + backend)
├── .env.example            #  Environment variable template
├── .dockerignore           #  Docker build context exclusions
├── dev/
│   └── env-config-demo-wallet.js  #  Demo wallet runtime config
├── scripts/
│   └── dev-setup.sh        #  One-time dev setup (keys, deps, .env)
├── backend/
│   ├── main.go             #  Entry point
│   ├── cmd/                #  CLI commands (serve, db, tss, ...)
│   ├── internal/           #  Application logic
│   ├── db/                 #  Database layer & migrations
│   ├── dev/                #  Official Docker Compose + setup files
│   └── tools/
│       └── sdp-setup/      #  Interactive setup wizard (make setup)
├── frontend/
│   ├── src/                #  React application
│   ├── vite.config.ts      #  Vite configuration
│   └── Dockerfile.dev      #  Dev-specific Docker image
└── contracts/              #  Soroban smart contracts (Rust)
```

---

## Makefile Reference

| Command | Description |
|---------|-------------|
| `make setup` | Interactive wizard (official SDP setup) |
| `make dev-setup` | Automated key generation & .env creation |
| `make dev` | Start both backend and frontend dev servers |
| `make dev-backend` | Start Go dev server on port 8000 |
| `make dev-frontend` | Start Vite dev server on port 3000 |
| `make build` | Build backend binary + frontend bundle |
| `make db-migrate` | Run all database migrations |
| `make tenant-setup` | Create default tenant (first admin user) |
| `make test` | Run all tests |
| `make lint` | Lint all code |
| `make install` | Install all dependencies |
| `make docker-build` | Build multi-stage Docker image |
| `make docker-compose-up` | Start all Compose services |
| `make docker-compose-down` | Stop all Compose services |
| `make clean` | Remove build artifacts |

---

## Backend CLI Commands

```bash
# Run from the project root or backend directory:
cd backend && ENV_FILE=../.env go run . <command>

# Available commands:
serve               # Start the API server
db admin migrate up # Run admin migrations
db tss migrate up   # Run TSS migrations
db sdp migrate up --all  # Run per-tenant SDP migrations
db auth migrate up --all # Run per-tenant auth migrations
db setup-for-network --all  # Set up assets & wallets
tenants ensure-default  # Create default tenant
tss                 # Transaction Submission Service
auth                # Authentication helpers
distribution-account # Distribution account management
channel-accounts     # Channel accounts management
message              # Message sending
integration-tests    # Integration tests
```

---

## Environment Variables

The `.env.example` file documents all available variables. Key ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://sdp:sdp@localhost:5432/sdp?sslmode=disable` | PostgreSQL connection |
| `PORT` | `8000` | Backend API port |
| `INSTANCE_NAME` | — | **Required.** SDP instance name |
| `EC256_PRIVATE_KEY` | — | **Required.** EC256 key for JWT signing |
| `SEP10_SIGNING_PUBLIC_KEY` | — | **Required.** Stellar SEP-10 public key |
| `SEP10_SIGNING_PRIVATE_KEY` | — | **Required.** Stellar SEP-10 secret seed |
| `SEP24_JWT_SECRET` | — | **Required.** JWT secret for SEP-24 |
| `DISTRIBUTION_PUBLIC_KEY` | — | **Required.** Stellar distribution account |
| `DISTRIBUTION_ACCOUNT_ENCRYPTION_PASSPHRASE` | — | **Required.** Encryption key |
| `CHANNEL_ACCOUNT_ENCRYPTION_PASSPHRASE` | — | **Required.** Channel account encryption |
| `CORS_ALLOWED_ORIGINS` | — | **Required.** Comma-separated allowed origins |
| `SINGLE_TENANT_MODE` | `false` | Run without multi-tenancy |
| `DISABLE_RECAPTCHA` | `false` | Skip reCAPTCHA in dev |
| `DISABLE_MFA` | `false` | Skip MFA in dev |

The `make dev-setup` command generates all required keys automatically.

---

## Testing with the Demo Wallet

After starting the full stack (`docker compose up --build`), you can test
disbursements end-to-end using the demo wallet:

1. Open the demo wallet: **http://localhost:4000**
2. Click **Generate Keypair** to create a new Stellar account
3. Click **Create account** to fund it on testnet (10,000 XLM)
4. Under Asset XLM, click **Add Home Domain**, enter `localhost:8000`, and click **Override**
5. In the **Select action** dropdown, choose **SEP-24 Deposit**, then click **Start**
6. Enter the same phone number from your disbursement CSV for identity verification
7. Complete the OTP and Date of Birth verification (OTP appears in backend logs)

See the [official getting-started guide](https://developers.stellar.org/docs/platforms/stellar-disbursement-platform/admin-guide/getting-started) for full instructions.

---

## Testing

```bash
# Run all tests
make test

# Backend tests only
make test-backend

# Frontend tests only
make test-frontend
```

For backend tests that require a PostgreSQL database, the test suite will
automatically create temporary databases.

---

## Production Build

```bash
# Build the multi-stage Docker image:
make docker-build

# Run with your production .env:
docker run -p 80:80 -p 8000:8000 \
  --env-file /path/to/production.env \
  stellar-disbursement-platform:latest
```

The production image:
1. Builds the frontend into static files (served by nginx on port 80)
2. Compiles the Go backend (listens on port 8000)
3. Nginx proxies all non-static requests to the Go backend

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
