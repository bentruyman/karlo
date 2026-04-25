#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${KARLO_ENV_FILE:-${ROOT_DIR}/ops/cabinet.env}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
fi

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ops/sync-arcade-library.sh [options] LIBRARY_PATH

Syncs the staged Karlo arcade library to the cabinet over rsync.

Environment defaults:
  KARLO_LIBRARY_REMOTE_ROOT=/srv/karlo/library
  KARLO_LIBRARY_RSYNC_SUDO=1
  KARLO_LIBRARY_CHOWN=1
  KARLO_LIBRARY_REMOTE_OWNER=${KARLO_CABINET_USER}:${KARLO_CABINET_USER}
  KARLO_LIBRARY_INSTALL_RSYNC=0

Options:
  --dry-run
  --no-delete
  --remote-root PATH
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

shell_quote() {
  printf "%q" "$1"
}

ssh_remote() {
  # Commands passed here are intentionally assembled locally for the target host.
  # shellcheck disable=SC2029
  ssh "${REMOTE}" "$@"
}

ssh_remote_tty() {
  # Commands passed here are intentionally assembled locally for the target host.
  # shellcheck disable=SC2029
  ssh -tt "${REMOTE}" "$@"
}

DRY_RUN=0
DELETE=1
SOURCE=""
REMOTE_ROOT="${KARLO_LIBRARY_REMOTE_ROOT:-/srv/karlo/library}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-delete)
      DELETE=0
      shift
      ;;
    --remote-root)
      [[ $# -ge 2 ]] || die "--remote-root requires a path"
      REMOTE_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      die "unknown argument: $1"
      ;;
    *)
      [[ -z "${SOURCE}" ]] || die "only one LIBRARY_PATH may be provided"
      SOURCE="$1"
      shift
      ;;
  esac
done

require_command rsync
require_command ssh

[[ -n "${KARLO_CABINET_HOST:-}" ]] || die "set KARLO_CABINET_HOST in ${ENV_FILE}"
KARLO_CABINET_SSH_USER="${KARLO_CABINET_SSH_USER:-${USER}}"
KARLO_CABINET_USER="${KARLO_CABINET_USER:-karlo}"
KARLO_LIBRARY_RSYNC_SUDO="${KARLO_LIBRARY_RSYNC_SUDO:-1}"
KARLO_LIBRARY_CHOWN="${KARLO_LIBRARY_CHOWN:-1}"
KARLO_LIBRARY_INSTALL_RSYNC="${KARLO_LIBRARY_INSTALL_RSYNC:-0}"
KARLO_LIBRARY_REMOTE_OWNER="${KARLO_LIBRARY_REMOTE_OWNER:-${KARLO_CABINET_USER}:${KARLO_CABINET_USER}}"

[[ -n "${SOURCE}" ]] || die "provide LIBRARY_PATH, for example: bun run sync:library -- /path/to/karlo-library"
SOURCE="${SOURCE%/}"
REMOTE_ROOT="${REMOTE_ROOT%/}"

[[ -d "${SOURCE}" ]] || die "library source does not exist: ${SOURCE}"
[[ -d "${SOURCE}/roms/mame" ]] || die "missing staged ROM directory: ${SOURCE}/roms/mame"
[[ -d "${SOURCE}/media/mame" ]] || die "missing staged media directory: ${SOURCE}/media/mame"
[[ -f "${SOURCE}/manifests/inventory.json" ]] || die "missing staged inventory: ${SOURCE}/manifests/inventory.json"

case "${REMOTE_ROOT}" in
  *[[:space:]]*) die "remote root cannot contain whitespace: ${REMOTE_ROOT}" ;;
esac

REMOTE="${KARLO_CABINET_SSH_USER}@${KARLO_CABINET_HOST}"
REMOTE_ROOT_QUOTED="$(shell_quote "${REMOTE_ROOT}")"

if ! ssh_remote "command -v rsync >/dev/null 2>&1"; then
  if [[ "${KARLO_LIBRARY_INSTALL_RSYNC}" == "1" ]]; then
    ssh_remote_tty "sudo apt-get update && sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y rsync"
  else
    die "remote host is missing rsync; install it or set KARLO_LIBRARY_INSTALL_RSYNC=1"
  fi
fi

if [[ "${KARLO_LIBRARY_RSYNC_SUDO}" == "1" ]]; then
  RSYNC_PATH="sudo rsync"
  if [[ "${DRY_RUN}" != "1" ]]; then
    ssh_remote_tty "sudo install -d -m 0755 ${REMOTE_ROOT_QUOTED}"
  fi
else
  RSYNC_PATH="rsync"
  if [[ "${DRY_RUN}" != "1" ]]; then
    ssh_remote "mkdir -p ${REMOTE_ROOT_QUOTED}"
  fi
fi

RSYNC_ARGS=(-aH --partial --progress)
if [[ "${DELETE}" == "1" ]]; then
  RSYNC_ARGS+=(--delete)
fi
if [[ "${DRY_RUN}" == "1" ]]; then
  RSYNC_ARGS+=(--dry-run)
fi

echo "Syncing ${SOURCE}/ -> ${REMOTE}:${REMOTE_ROOT}/"
if [[ "${DRY_RUN}" == "1" ]]; then
  echo "Dry run enabled; no remote files will be changed."
fi

rsync "${RSYNC_ARGS[@]}" \
  --rsync-path="${RSYNC_PATH}" \
  "${SOURCE}/" \
  "${REMOTE}:${REMOTE_ROOT}/"

if [[ "${DRY_RUN}" != "1" && "${KARLO_LIBRARY_RSYNC_SUDO}" == "1" && "${KARLO_LIBRARY_CHOWN}" == "1" ]]; then
  ssh_remote_tty "sudo chown -R $(shell_quote "${KARLO_LIBRARY_REMOTE_OWNER}") ${REMOTE_ROOT_QUOTED}"
fi

echo "Library sync complete."
