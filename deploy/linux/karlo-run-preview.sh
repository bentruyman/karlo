#!/usr/bin/env sh
set -eu

if [ -z "${KARLO_DEV_URL:-}" ]; then
  echo "Set KARLO_DEV_URL in /etc/karlo/karlo-preview.env before starting preview mode." >&2
  exit 1
fi

browser_bin="${KARLO_BROWSER:-}"

if [ -z "$browser_bin" ]; then
  for candidate in chromium-browser chromium google-chrome-stable google-chrome; do
    if command -v "$candidate" >/dev/null 2>&1; then
      browser_bin="$candidate"
      break
    fi
  done
fi

if [ -z "$browser_bin" ]; then
  echo "No supported kiosk browser found. Install Chromium or Chrome, or set KARLO_BROWSER." >&2
  exit 1
fi

if command -v xset >/dev/null 2>&1; then
  xset s off
  xset -dpms
  xset s noblank
fi

exec "$browser_bin" \
  --kiosk \
  --incognito \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  "$KARLO_DEV_URL"
