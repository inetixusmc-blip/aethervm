#!/usr/bin/env bash
set -euo pipefail
cd /opt/aethervm
git pull --ff-only
docker compose -f deploy/aws/compose.yml config --quiet
docker compose -f deploy/aws/compose.yml up -d --build --wait
# Build only the selected provider's template; never run Daytona migrations for E2B.
docker compose -f deploy/aws/compose.yml exec -T api python -c 'from sandboxes import provider; from e2b_template import ensure_template; from ubuntu_snapshot import ensure_snapshot; ensure_template() if provider()=="e2b" else ensure_snapshot() if provider()=="daytona" else None'
curl --fail --silent http://127.0.0.1:8000/health
