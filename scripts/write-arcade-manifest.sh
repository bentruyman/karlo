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

# Every value here is a commit sha, an RFC3339 stamp, a URL, or a hex digest,
# so none of them need JSON string escaping.
cat >"$output_path" <<EOF
{
  "channel": "stable",
  "commit": "${commit_sha}",
  "built_at": "${built_at}",
  "artifact": {
    "format": "appimage",
    "url": "${artifact_url}",
    "sha256": "${artifact_sha}"
  }
}
EOF
