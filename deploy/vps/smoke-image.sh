#!/usr/bin/env bash
# CI only: fresh isolated database/volume, no subscriptions or production data.
set -euo pipefail
image="${1:?image required}"
revision="${2:?source commit required}"
project="paperclip-smoke-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
db="$project-db"
app="$project-app"
network="$project-net"
volume="$project-data"
cleanup() {
  docker rm -f "$app" "$db" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
password="$(openssl rand -hex 24)"
secret="$(openssl rand -hex 32)"
docker network create "$network" >/dev/null
docker volume create "$volume" >/dev/null
docker run -d --name "$db" --network "$network" \
  -e POSTGRES_USER=paperclip -e POSTGRES_DB=paperclip -e POSTGRES_PASSWORD="$password" \
  postgres:17-alpine >/dev/null
ready=0
for ((attempt=1; attempt<=36; attempt++)); do
  if docker exec "$db" pg_isready -U paperclip -d paperclip >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
test "$ready" = 1
docker run -d --name "$app" --network "$network" -v "$volume:/paperclip" \
  -e DATABASE_URL="postgres://paperclip:$password@$db:5432/paperclip" \
  -e BETTER_AUTH_SECRET="$secret" -e PAPERCLIP_AGENT_JWT_SECRET="$secret" \
  -e PAPERCLIP_TOOL_ACTION_SIGNING_SECRET="$secret" \
  -e PAPERCLIP_MIGRATION_AUTO_APPLY=true -e PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  -e PAPERCLIP_DEPLOYMENT_EXPOSURE=public \
  -e PAPERCLIP_AUTH_BASE_URL_MODE=explicit \
  -e PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://paperclip-smoke.example \
  -e PAPERCLIP_PUBLIC_URL=https://paperclip-smoke.example \
  -e BETTER_AUTH_TRUSTED_ORIGINS=https://paperclip-smoke.example \
  -e PAPERCLIP_AUTH_DISABLE_SIGN_UP=true "$image" >/dev/null
for ((attempt=1; attempt<=60; attempt++)); do
  if docker exec -e EXPECTED_COMMIT="$revision" "$app" node -e '
    fetch("http://127.0.0.1:3100/api/health").then(async r => {
      const h = await r.json();
      if (!r.ok || h.status !== "ok" || h.commit !== process.env.EXPECTED_COMMIT ||
          h.deploymentMode !== "authenticated" || h.deploymentExposure !== "public") process.exit(1);
    }).catch(() => process.exit(1));
  ' >/dev/null 2>&1; then
    docker exec --user node "$app" codex --version
    docker exec --user node "$app" claude --version
    echo 'Fresh authenticated server, migrations and CLI executables passed smoke check.'
    exit 0
  fi
  sleep 3
done
echo 'Smoke failed: server did not become healthy with the expected commit.' >&2
exit 1
