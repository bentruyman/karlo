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

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

repo_from_origin() {
  local origin
  local repo
  origin="$(git -C "${ROOT_DIR}" config --get remote.origin.url || true)"
  case "${origin}" in
    git@github.com:*.git)
      repo="${origin#git@github.com:}"
      echo "${repo%.git}"
      ;;
    https://github.com/*.git)
      repo="${origin#https://github.com/}"
      echo "${repo%.git}"
      ;;
    https://github.com/*)
      echo "${origin#https://github.com/}"
      ;;
    *)
      echo ""
      ;;
  esac
}

latest_successful_run_id() {
  local repo="$1"
  local workflow="$2"
  local sha="$3"

  gh run list \
    --repo "${repo}" \
    --workflow "${workflow}" \
    --json databaseId,headSha,conclusion \
    --limit 50 \
    --jq ".[] | select(.headSha == \"${sha}\" and .conclusion == \"success\") | .databaseId" \
    | head -n 1
}

latest_run_id() {
  local repo="$1"
  local workflow="$2"
  local sha="$3"

  gh run list \
    --repo "${repo}" \
    --workflow "${workflow}" \
    --json databaseId,headSha \
    --limit 20 \
    --jq ".[] | select(.headSha == \"${sha}\") | .databaseId" \
    | head -n 1
}

shell_quote() {
  printf "%q" "$1"
}

require_command git
require_command gh
require_command scp
require_command ssh

cd "${ROOT_DIR}"

DEFAULT_REPO="$(repo_from_origin)"
DEFAULT_REF="$(git branch --show-current)"
HEAD_SHA="$(git rev-parse HEAD)"

KARLO_GITHUB_REPO="${KARLO_GITHUB_REPO:-${DEFAULT_REPO}}"
KARLO_GITHUB_REF="${KARLO_GITHUB_REF:-${DEFAULT_REF}}"
KARLO_WORKFLOW="${KARLO_WORKFLOW:-linux-artifact.yml}"
KARLO_ARTIFACT_NAME="${KARLO_ARTIFACT_NAME:-karlo-linux-x64}"
KARLO_CABINET_SSH_USER="${KARLO_CABINET_SSH_USER:-${USER}}"
KARLO_CABINET_USER="${KARLO_CABINET_USER:-karlo}"
KARLO_REMOTE_TMP="${KARLO_REMOTE_TMP:-/tmp/karlo-deploy}"
KARLO_PROVISION="${KARLO_PROVISION:-1}"
KARLO_OPTIMIZE_BOOT="${KARLO_OPTIMIZE_BOOT:-1}"
KARLO_RESTART="${KARLO_RESTART:-1}"
KARLO_APP_BINARY="${KARLO_APP_BINARY:-/usr/bin/karlo}"

[[ -n "${KARLO_GITHUB_REPO}" ]] || die "set KARLO_GITHUB_REPO or use a GitHub origin remote"
[[ -n "${KARLO_GITHUB_REF}" ]] || die "set KARLO_GITHUB_REF or run from a branch"
[[ -n "${KARLO_CABINET_HOST:-}" ]] || die "set KARLO_CABINET_HOST in ${ENV_FILE}"

if [[ "${KARLO_SKIP_PUSH_CHECK:-0}" != "1" ]]; then
  git fetch --quiet origin "${KARLO_GITHUB_REF}"
  REMOTE_SHA="$(git rev-parse FETCH_HEAD)"
  [[ "${HEAD_SHA}" == "${REMOTE_SHA}" ]] || die "HEAD ${HEAD_SHA} is not pushed to origin/${KARLO_GITHUB_REF} (${REMOTE_SHA}); push first or set KARLO_SKIP_PUSH_CHECK=1"
fi

RUN_ID="$(latest_successful_run_id "${KARLO_GITHUB_REPO}" "${KARLO_WORKFLOW}" "${HEAD_SHA}")"

if [[ -z "${RUN_ID}" ]]; then
  echo "No successful ${KARLO_WORKFLOW} artifact found for ${HEAD_SHA}; triggering GitHub Actions."
  gh workflow run "${KARLO_WORKFLOW}" \
    --repo "${KARLO_GITHUB_REPO}" \
    --ref "${KARLO_GITHUB_REF}" \
    -f "ref=${HEAD_SHA}"

  sleep 8
  RUN_ID="$(latest_run_id "${KARLO_GITHUB_REPO}" "${KARLO_WORKFLOW}" "${HEAD_SHA}")"
  [[ -n "${RUN_ID}" ]] || die "could not find triggered workflow run for ${HEAD_SHA}"
  gh run watch "${RUN_ID}" --repo "${KARLO_GITHUB_REPO}" --exit-status
else
  echo "Using existing successful ${KARLO_WORKFLOW} run ${RUN_ID} for ${HEAD_SHA}."
fi

DOWNLOAD_DIR="$(mktemp -d)"
trap 'rm -rf "${DOWNLOAD_DIR}"' EXIT

gh run download "${RUN_ID}" \
  --repo "${KARLO_GITHUB_REPO}" \
  --name "${KARLO_ARTIFACT_NAME}" \
  --dir "${DOWNLOAD_DIR}"

DEB_PATH="$(find "${DOWNLOAD_DIR}" -type f -name '*.deb' | sort | tail -n 1)"
[[ -n "${DEB_PATH}" ]] || die "artifact ${KARLO_ARTIFACT_NAME} did not contain a .deb package"

REMOTE="${KARLO_CABINET_SSH_USER}@${KARLO_CABINET_HOST}"
REMOTE_TMP_QUOTED="$(shell_quote "${KARLO_REMOTE_TMP}")"
REMOTE_DEB="${KARLO_REMOTE_TMP}/karlo.deb"
REMOTE_PROVISION="${KARLO_REMOTE_TMP}/provision-cabinet.sh"

echo "Deploying ${DEB_PATH} to ${REMOTE}:${REMOTE_DEB}"
# shellcheck disable=SC2029
ssh "${REMOTE}" "mkdir -p ${REMOTE_TMP_QUOTED}"
scp "${DEB_PATH}" "${REMOTE}:${REMOTE_DEB}"
scp "${ROOT_DIR}/ops/provision-cabinet.sh" "${REMOTE}:${REMOTE_PROVISION}"

ssh "${REMOTE}" "sudo systemctl stop karlo-session.service >/dev/null 2>&1 || true"
# shellcheck disable=SC2029
ssh "${REMOTE}" "sudo apt-get install -y $(shell_quote "${REMOTE_DEB}")"

if [[ "${KARLO_PROVISION}" == "1" ]]; then
  # shellcheck disable=SC2029
  ssh "${REMOTE}" "sudo env KARLO_CABINET_USER=$(shell_quote "${KARLO_CABINET_USER}") KARLO_APP_BINARY=$(shell_quote "${KARLO_APP_BINARY}") KARLO_OPTIMIZE_BOOT=$(shell_quote "${KARLO_OPTIMIZE_BOOT}") bash $(shell_quote "${REMOTE_PROVISION}")"
fi

if [[ "${KARLO_RESTART}" == "1" ]]; then
  ssh "${REMOTE}" "sudo systemctl daemon-reload && sudo systemctl enable karlo-session.service && sudo systemctl restart karlo-session.service && sudo systemctl --no-pager --full status karlo-session.service"
fi

echo "Deployed Karlo ${HEAD_SHA} to ${KARLO_CABINET_HOST}."
