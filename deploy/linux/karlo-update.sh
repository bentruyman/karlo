#!/usr/bin/env sh
set -eu

karlo_root="${KARLO_ROOT:-/opt/karlo}"
manifest_url="${KARLO_UPDATE_MANIFEST_URL:-}"
runtime_user="${KARLO_RUNTIME_USER:-karlo}"
retain_count="${KARLO_RELEASE_RETAIN_COUNT:-5}"
apply_mode="${KARLO_UPDATE_APPLY_MODE:-next-restart}"

if [ -z "$manifest_url" ]; then
  echo "Set KARLO_UPDATE_MANIFEST_URL in /etc/karlo/karlo.env before running updates." >&2
  exit 1
fi

case "$manifest_url" in
  https://*) ;;
  *)
    echo "Refusing non-HTTPS manifest URL: $manifest_url" >&2
    exit 1
    ;;
esac

case "$apply_mode" in
  next-restart|restart) ;;
  *)
    echo "Unsupported KARLO_UPDATE_APPLY_MODE: $apply_mode" >&2
    exit 1
    ;;
esac

mkdir -p "$karlo_root/releases"

lock_file="$karlo_root/.update.lock"
exec 9>"$lock_file"

if ! flock -n 9; then
  exit 0
fi

tmp_dir="$(mktemp -d)"
staged_release_dir=""

cleanup() {
  rm -rf "$tmp_dir"

  if [ -n "$staged_release_dir" ] && [ -d "$staged_release_dir" ]; then
    rm -rf "$staged_release_dir"
  fi
}

trap cleanup EXIT INT TERM HUP

manifest_path="$tmp_dir/arcade-stable.json"
artifact_path="$tmp_dir/Karlo.AppImage"

curl -fsSL "$manifest_url" -o "$manifest_path"

manifest_fields="$(
  python3 - "$manifest_path" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

print(payload["commit"])
print(payload["artifact"]["url"])
print(payload["artifact"]["sha256"])
PY
)"

manifest_commit="$(printf '%s\n' "$manifest_fields" | sed -n '1p')"
artifact_url="$(printf '%s\n' "$manifest_fields" | sed -n '2p')"
artifact_sha="$(printf '%s\n' "$manifest_fields" | sed -n '3p')"

if ! printf '%s\n' "$manifest_commit" | grep -Eq '^[0-9a-f]{40}([0-9a-f]{24})?$'; then
  echo "Refusing manifest with unexpected commit id: $manifest_commit" >&2
  exit 1
fi

if ! printf '%s\n' "$artifact_sha" | grep -Eq '^[0-9a-f]{64}$'; then
  echo "Refusing manifest with unexpected sha256: $artifact_sha" >&2
  exit 1
fi

case "$artifact_url" in
  https://*) ;;
  *)
    echo "Refusing non-HTTPS artifact URL: $artifact_url" >&2
    exit 1
    ;;
esac

current_commit=""
if [ -f "$karlo_root/current/commit.txt" ]; then
  current_commit="$(cat "$karlo_root/current/commit.txt")"
fi

if [ "$manifest_commit" = "$current_commit" ]; then
  exit 0
fi

# GitHub release artifact replacement is not atomic relative to the manifest.
# A transient checksum mismatch during release rotation is expected to self-heal on the next poll.
curl -fsSL "$artifact_url" -o "$artifact_path"
printf '%s  %s\n' "$artifact_sha" "$artifact_path" | sha256sum -c -

release_dir="$karlo_root/releases/$manifest_commit"
staged_release_dir="$(mktemp -d "$karlo_root/releases/.staged.${manifest_commit}.XXXXXX")"

install -m 0755 "$artifact_path" "$staged_release_dir/Karlo.AppImage"
install -m 0644 "$manifest_path" "$staged_release_dir/manifest.json"
printf '%s\n' "$manifest_commit" > "$staged_release_dir/commit.txt"

if [ -d "$release_dir" ]; then
  if [ ! -x "$release_dir/Karlo.AppImage" ] || [ ! -f "$release_dir/commit.txt" ] || [ "$(cat "$release_dir/commit.txt")" != "$manifest_commit" ]; then
    rm -rf "$release_dir"
    mv "$staged_release_dir" "$release_dir"
    staged_release_dir=""
  else
    rm -rf "$staged_release_dir"
    staged_release_dir=""
  fi
else
  mv "$staged_release_dir" "$release_dir"
  staged_release_dir=""
fi

previous_target="$(readlink -f "$karlo_root/current" 2>/dev/null || true)"
ln -sfn "$release_dir" "$karlo_root/current"

if [ -n "$previous_target" ] && [ "$previous_target" != "$release_dir" ] && [ -d "$previous_target" ]; then
  ln -sfn "$previous_target" "$karlo_root/previous"
fi

if [ "$apply_mode" = "restart" ] && id "$runtime_user" >/dev/null 2>&1; then
  runtime_uid="$(id -u "$runtime_user")"
  runtime_dir="/run/user/$runtime_uid"
  runtime_bus="$runtime_dir/bus"

  if [ -S "$runtime_bus" ]; then
    runuser -u "$runtime_user" -- env \
      XDG_RUNTIME_DIR="$runtime_dir" \
      DBUS_SESSION_BUS_ADDRESS="unix:path=$runtime_bus" \
      systemctl --user try-restart karlo.service >/dev/null 2>&1 || true
  fi
fi

preserve_current="$(readlink -f "$karlo_root/current" 2>/dev/null || true)"
preserve_previous="$(readlink -f "$karlo_root/previous" 2>/dev/null || true)"
sorted_releases="$tmp_dir/releases.sorted"

find "$karlo_root/releases" -mindepth 1 -maxdepth 1 -type d ! -name '.staged.*' -printf '%T@ %p\n' \
  | sort -nr \
  | cut -d' ' -f2- > "$sorted_releases"

release_index=0
while IFS= read -r candidate_dir; do
  [ -n "$candidate_dir" ] || continue
  release_index=$((release_index + 1))

  if [ "$candidate_dir" = "$preserve_current" ] || [ "$candidate_dir" = "$preserve_previous" ]; then
    continue
  fi

  if [ "$release_index" -le "$retain_count" ]; then
    continue
  fi

  rm -rf "$candidate_dir"
done < "$sorted_releases"
