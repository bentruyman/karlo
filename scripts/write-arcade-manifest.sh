#!/usr/bin/env sh
set -eu

if [ "$#" -ne 6 ]; then
  echo "usage: $0 <commit> <built-at-rfc3339> <owner/repo> <tag> <appimage-path> <output-path>" >&2
  exit 1
fi

commit_sha="$1"
built_at="$2"
repo_full_name="$3"
release_tag="$4"
artifact_path="$5"
output_path="$6"
artifact_name="$(basename "$artifact_path")"
artifact_sha="$(shasum -a 256 "$artifact_path" | awk '{print $1}')"
artifact_url="https://github.com/${repo_full_name}/releases/download/${release_tag}/${artifact_name}"

python3 - "$commit_sha" "$built_at" "$artifact_url" "$artifact_sha" "$output_path" <<'PY'
import json
import sys

payload = {
    "channel": "stable",
    "commit": sys.argv[1],
    "built_at": sys.argv[2],
    "artifact": {
        "format": "appimage",
        "url": sys.argv[3],
        "sha256": sys.argv[4],
    },
}

with open(sys.argv[5], "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY
