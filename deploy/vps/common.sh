#!/usr/bin/env bash
# Shared by the backup/update entrypoints. Run on the Ubuntu VPS, as paperclip.
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

dc() {
  sudo docker compose --env-file .env --env-file public.env \
    -f compose.yaml -f compose.public.yaml "$@"
}

prepare_operation() {
  for command in sudo python3 flock tar; do command -v "$command" >/dev/null; done
  test -f .env && test -f public.env
  exec 9>.operation.lock
  flock -n 9 || { echo 'Another backup/update is running.' >&2; return 1; }
  dc config --quiet
}

backup_current() {
  local container image was_stopped=0
  container="$(dc ps -q paperclip)"
  test -n "$container" || { echo 'Paperclip must be running before backup.' >&2; return 1; }
  test "$(sudo docker inspect --format '{{.State.Running}}' "$container")" = true
  image="$(sudo docker inspect --format '{{.Image}}' "$container")"
  mkdir -p "$HOME/backups"
  chmod 700 "$HOME/backups"
  BACKUP_DIR="$(mktemp -d "$HOME/backups/paperclip-before-update-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
  export BACKUP_DIR
  cp .env public.env compose.yaml compose.public.yaml Caddyfile "$BACKUP_DIR/"
  printf '%s\n' "$image" > "$BACKUP_DIR/previous-image-id.txt"

  # The subshell trap restarts the SAME container if either backup fails.
  (
    restart_original() {
      if [ "$was_stopped" = 1 ]; then sudo docker start "$container" >/dev/null; fi
    }
    trap restart_original EXIT
    was_stopped=1
    sudo docker stop --time 60 "$container" >/dev/null
    dc exec -T db pg_dump -U paperclip -d paperclip -Fc > "$BACKUP_DIR/database.dump"
    # The paperclip SSH user owns the backup; sudo is only for Docker access.
    # shellcheck disable=SC2024
    sudo docker run --rm --network none --user 0:0 --volumes-from "$container:ro" \
      --entrypoint /bin/tar "$image" -C /paperclip -czf - . > "$BACKUP_DIR/paperclip-data.tar.gz"
    test -s "$BACKUP_DIR/database.dump"
    test -s "$BACKUP_DIR/paperclip-data.tar.gz"
    dc exec -T db pg_restore --list < "$BACKUP_DIR/database.dump" >/dev/null
    tar -tzf "$BACKUP_DIR/paperclip-data.tar.gz" >/dev/null
    printf '%s\n' 'Archive and dump structure checked; restore rehearsal not performed.' \
      > "$BACKUP_DIR/BACKUP_COMPLETE.txt"
  )
  echo "Backup: $BACKUP_DIR"
}
