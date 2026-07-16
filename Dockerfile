# =============================================================================
# Stage 1 — Build Frontend (React / Vite / Yarn)
# =============================================================================
FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend

# Install dependencies (layer caching)
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source and build
COPY frontend/ ./
RUN yarn build

# =============================================================================
# Stage 2 — Build Backend (Go)
# =============================================================================
FROM golang:1.26-alpine AS backend-build

ARG GIT_COMMIT=unknown

WORKDIR /app/backend

# Download deps first for layer caching
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy source and build
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /bin/stellar-disbursement-platform -ldflags "-X main.GitCommit=${GIT_COMMIT}" .

# =============================================================================
# Stage 3 — Production Image (nginx + Go binary)
# =============================================================================
FROM alpine:3.24

RUN apk add --no-cache ca-certificates nginx

# ── Frontend: static assets served by nginx ──
COPY --from=frontend-build /app/frontend/build /usr/share/nginx/html

# ── Backend: Go binary ──
COPY --from=backend-build /bin/stellar-disbursement-platform /app/

# ── Nginx config (reverse-proxies unmatched routes to Go backend) ──
COPY nginx.conf /etc/nginx/http.d/default.conf

# ── Entrypoint script ──
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80 8000

ENTRYPOINT ["docker-entrypoint.sh"]
