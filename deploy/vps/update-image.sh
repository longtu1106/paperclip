#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

image="${1:-}"
revision="${2:-}"
if [ "$#" != 2 ] || \
   [[ ! "$image" =~ ^ghcr\.io/longtu1106/paperclip-server@sha256:[a-f0-9]{64}$ ]] || \
   [[ ! "$revision" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'Usage: bash update-image.sh ghcr.io/longtu1106/paperclip-server@sha256:<64 hex> <40 hex source commit>' >&2
  exit 2
fi

prepare_operation
# Pull/inspect before stopping anything. Private GHCR images need docker login first.
sudo docker pull "$image"
architecture="$(sudo docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")"
actual_revision="$(sudo docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
actual_source="$(sudo docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "$image")"
test "$architecture" = linux/amd64
test "$actual_revision" = "$revision" || { echo 'Image source commit mismatch.' >&2; exit 1; }
test "$actual_source" = https://github.com/longtu1106/paperclip
backup_current

# Parse as text, never source .env as shell code. Change only this one key.
python3 - "$image" <<'PY'
import os, re, sys, tempfile
from pathlib import Path
path = Path('.env')
original = path.read_bytes()
pattern = rb'(?m)^PAPERCLIP_IMAGE=[^\r\n]*'
if len(re.findall(pattern, original)) != 1:
    raise SystemExit('Expected exactly one PAPERCLIP_IMAGE in .env; no change made.')
updated = re.sub(pattern, lambda _: b'PAPERCLIP_IMAGE=' + sys.argv[1].encode(), original)
fd, name = tempfile.mkstemp(prefix='.env.update-', dir='.')
try:
    with os.fdopen(fd, 'wb') as output:
        output.write(updated)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(name, 0o600)
    os.replace(name, path)
finally:
    if os.path.exists(name):
        os.unlink(name)
PY

report_failure() {
  local result=$?
  if [ "$result" != 0 ]; then
    echo "Update incomplete. Backup: $BACKUP_DIR" >&2
    echo 'No automatic rollback: the new image may have migrated the database.' >&2
    echo 'Inspect with: bash public-compose.sh ps; bash public-compose.sh logs --tail=80 paperclip' >&2
  fi
}
trap report_failure EXIT
dc up -d --no-deps --force-recreate paperclip
# Check through the public proxy, not only the container's process state.
fqdn="$(python3 - <<'PY'
from pathlib import Path
import re
matches = re.findall(r'^PUBLIC_FQDN=([a-z0-9.-]+)$', Path('public.env').read_text(), re.M)
if len(matches) != 1: raise SystemExit('Invalid PUBLIC_FQDN in public.env')
print(matches[0])
PY
)"
for ((attempt=1; attempt<=36; attempt++)); do
  if python3 - "$fqdn" "$revision" <<'PY'
import json, sys, urllib.request
try:
    with urllib.request.urlopen('https://' + sys.argv[1] + '/api/health', timeout=8) as response:
        health = json.load(response)
    assert health.get('status') == 'ok'
    assert health.get('deploymentMode') == 'authenticated'
    assert health.get('deploymentExposure') == 'public'
    assert health.get('commit') == sys.argv[2]
except Exception:
    raise SystemExit(1)
PY
  then
    echo "Updated successfully to source commit $revision"
    echo "Backup: $BACKUP_DIR (copy off the VPS)."
    exit 0
  fi
  sleep 5
done
echo 'Public health/commit verification timed out.' >&2
exit 1
