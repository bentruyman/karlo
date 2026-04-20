#!/usr/bin/env sh
set -eu

karlo_root="${KARLO_ROOT:-/opt/karlo}"
appimage_path="${karlo_root}/current/Karlo.AppImage"

if [ ! -x "$appimage_path" ]; then
  echo "Karlo AppImage not found at ${appimage_path}." >&2
  exit 1
fi

export KARLO_KIOSK="${KARLO_KIOSK:-1}"

exec "$appimage_path" --kiosk "$@"
