#!/bin/bash
# deploy.sh — runs on VPS after git pull
# Called by GitHub Actions via SSH on push to `main` branch.
set -e

echo "=== Starting deploy at $(date) ==="

# ── Pull latest code ────────────────────────────────────────────────────────────
git fetch origin main
git reset --hard origin/main

# ── Detect what changed since last deploy ──────────────────────────────────────
CURRENT_COMMIT=$(git rev-parse HEAD)
LAST_COMMIT_FILE=".last-deploy-commit"

migrate_database() {
  echo ">>> Applying pending database migrations before starting the backend..."
  docker compose run --rm backend npx prisma migrate deploy
}

if [ ! -f "$LAST_COMMIT_FILE" ]; then
  echo "First deploy — building all services."
  docker compose build
  migrate_database
  docker compose up -d
  echo "$CURRENT_COMMIT" > "$LAST_COMMIT_FILE"
  echo "=== Deploy complete ==="
  exit 0
fi

LAST_COMMIT=$(cat "$LAST_COMMIT_FILE")
CHANGED=$(git diff --name-only "$LAST_COMMIT" "$CURRENT_COMMIT")

echo "Changed files:"
echo "$CHANGED"
echo ""

REBUILT=0

# Root changes need a full rebuild; handle this first to avoid rebuilding twice.
if echo "$CHANGED" | grep -qE "^(tsconfig|package|docker-compose|eslint)"; then
  echo ">>> Root config changed — rebuilding all services..."
  docker compose build
  migrate_database
  docker compose up -d
  REBUILT=1
else
  if echo "$CHANGED" | grep -qE "^back/"; then
    echo ">>> Rebuilding backend..."
    docker compose build backend
    # Idempotent: also picks up migrations missed by an earlier deployment.
    migrate_database
    docker compose up -d backend
    REBUILT=$((REBUILT + 1))
  fi

  if echo "$CHANGED" | grep -qE "^front/"; then
    echo ">>> Rebuilding frontend..."
    docker compose build frontend
    docker compose up -d frontend
    REBUILT=$((REBUILT + 1))
  fi
fi

if [ "$REBUILT" -eq 0 ]; then
  echo "No service directories changed — nothing rebuilt."
fi

# ── Save commit for next run ───────────────────────────────────────────────────
echo "$CURRENT_COMMIT" > "$LAST_COMMIT_FILE"

# ── Prune dangling images ──────────────────────────────────────────────────────
docker image prune -f

echo "=== Deploy complete at $(date) ==="
