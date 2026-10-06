#!/usr/bin/env bash
set -euo pipefail
cd /opt/aethervm
git pull --ff-only
docker compose -f deploy/aws/compose.yml config --quiet
docker compose -f deploy/aws/compose.yml up -d --build --wait
curl --fail --silent http://127.0.0.1:8000/health
