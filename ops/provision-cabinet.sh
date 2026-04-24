#!/usr/bin/env bash
set -euo pipefail

CABINET_USER="${KARLO_CABINET_USER:-karlo}"
APP_BINARY="${KARLO_APP_BINARY:-/usr/bin/karlo}"
OPTIMIZE_BOOT="${KARLO_OPTIMIZE_BOOT:-1}"
SERVICE_PATH="/etc/systemd/system/karlo-session.service"

die() {
  echo "error: $*" >&2
  exit 1
}

if [[ "${EUID}" -ne 0 ]]; then
  SUDO="sudo"
else
  SUDO=""
fi

run() {
  # shellcheck disable=SC2086
  ${SUDO} "$@"
}

group_exists() {
  getent group "$1" >/dev/null 2>&1
}

add_user_to_group_if_present() {
  local group="$1"
  if group_exists "${group}"; then
    run usermod -aG "${group}" "${CABINET_USER}"
  fi
}

run apt-get update
run env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates \
  cage \
  dbus \
  dbus-user-session \
  gstreamer1.0-libav \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  libayatana-appindicator3-1 \
  librsvg2-2 \
  libwebkit2gtk-4.1-0 \
  libxdo3 \
  mame \
  openssh-server \
  seatd

if ! id -u "${CABINET_USER}" >/dev/null 2>&1; then
  run useradd --create-home --shell /bin/bash "${CABINET_USER}"
fi

CABINET_HOME="$(getent passwd "${CABINET_USER}" | cut -d: -f6 || true)"
[[ -n "${CABINET_HOME}" ]] || die "could not resolve home directory for ${CABINET_USER}"

add_user_to_group_if_present audio
add_user_to_group_if_present input
add_user_to_group_if_present render
add_user_to_group_if_present seat
add_user_to_group_if_present video

if command -v systemctl >/dev/null 2>&1; then
  run systemctl enable --now ssh || true
  run systemctl enable --now seatd || true
fi

run install -d -m 0755 "$(dirname "${SERVICE_PATH}")"
run tee "${SERVICE_PATH}" >/dev/null <<SERVICE
[Unit]
Description=Karlo arcade cabinet session
Documentation=https://github.com/bentruyman/karlo
After=systemd-user-sessions.service dbus.service
Conflicts=getty@tty1.service display-manager.service

[Service]
User=${CABINET_USER}
PAMName=login
WorkingDirectory=${CABINET_HOME}
Environment=XDG_SESSION_TYPE=wayland
Environment=GDK_BACKEND=wayland
Environment=WEBKIT_DISABLE_COMPOSITING_MODE=1
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardInput=tty
StandardOutput=journal
StandardError=journal
ExecStart=/usr/bin/dbus-run-session -- /usr/bin/cage -s -- ${APP_BINARY}
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
SERVICE

if [[ "${OPTIMIZE_BOOT}" == "1" ]]; then
  run systemctl set-default multi-user.target
  run systemctl disable --now display-manager.service >/dev/null 2>&1 || true
  run systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
  run systemctl disable --now NetworkManager-wait-online.service >/dev/null 2>&1 || true
  run systemctl disable --now systemd-networkd-wait-online.service >/dev/null 2>&1 || true

  if [[ -f /etc/default/grub ]]; then
    run sed -i 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=0/' /etc/default/grub
    if grep -q '^GRUB_CMDLINE_LINUX_DEFAULT=' /etc/default/grub; then
      run sed -i 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT="quiet loglevel=3 systemd.show_status=auto rd.udev.log_level=3"/' /etc/default/grub
    else
      echo 'GRUB_CMDLINE_LINUX_DEFAULT="quiet loglevel=3 systemd.show_status=auto rd.udev.log_level=3"' | run tee -a /etc/default/grub >/dev/null
    fi

    if command -v update-grub >/dev/null 2>&1; then
      run update-grub
    fi
  fi
fi

run systemctl daemon-reload
run systemctl enable karlo-session.service
