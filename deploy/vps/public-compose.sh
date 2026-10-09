#!/usr/bin/env bash
# Run all later public-mode Compose operations using the same files/settings.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
exec sudo docker compose --env-file .env --env-file public.env \
  -f compose.yaml -f compose.public.yaml "$@"
