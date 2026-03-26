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

if [ ! -f "$LAST_COMMIT_FILE" ]; then
  echo "First deploy — building all services."
  docker compose build
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

# ── Backend ─────────────────────────────────────────────────────────────────────
if echo "$CHANGED" | grep -qE "^back/"; then
  echo ">>> Rebuilding backend..."
  docker compose build backend
  docker compose up -d backend
  REBUILT=$((REBUILT + 1))
fi

# ── Frontend ────────────────────────────────────────────────────────────────────
if echo "$CHANGED" | grep -qE "^front/"; then
  echo ">>> Rebuilding frontend..."
  docker compose build frontend
  docker compose up -d frontend
  REBUILT=$((REBUILT + 1))
fi

# ── Root-level changes (tsconfig, package.json, docker-compose, etc.) ──────────
if echo "$CHANGED" | grep -qE "^(tsconfig|package|docker-compose|eslint)"; then
  echo ">>> Root config changed — rebuilding all services..."
  docker compose build
  docker compose up -d
  REBUILT=$((REBUILT + 1))
fi

if [ "$REBUILT" -eq 0 ]; then
  echo "No service directories changed — nothing rebuilt."
fi

# ── Save commit for next run ───────────────────────────────────────────────────
echo "$CURRENT_COMMIT" > "$LAST_COMMIT_FILE"

# ── Prune dangling images ──────────────────────────────────────────────────────
docker image prune -f

echo "=== Deploy complete at $(date) ==="
