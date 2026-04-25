#!/usr/bin/env bash
set -euo pipefail

CABINET_USER="${KARLO_CABINET_USER:-karlo}"
APP_BINARY="${KARLO_APP_BINARY:-/usr/bin/karlo}"
OPTIMIZE_BOOT="${KARLO_OPTIMIZE_BOOT:-1}"
SESSION_BACKEND="${KARLO_SESSION_BACKEND:-x11}"
WESTON_SHELL="${KARLO_WESTON_SHELL:-desktop}"
SERVICE_PATH="/etc/systemd/system/karlo-session.service"
SESSION_WRAPPER="/usr/local/bin/karlo-session"

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
  dbus-x11 \
  openbox \
  openssh-server \
  pipewire \
  seatd \
  unclutter \
  weston \
  x11-xserver-utils \
  xinit \
  xserver-xorg

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
run tee "${SESSION_WRAPPER}" >/dev/null <<SESSION
#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="\${HOME}/.local/state/karlo"
LOG_FILE="\${LOG_DIR}/session.log"

mkdir -p "\${LOG_DIR}"
exec >>"\${LOG_FILE}" 2>&1

echo "--- Karlo session started at \$(date --iso-8601=seconds) ---"
echo "SESSION_BACKEND=${SESSION_BACKEND}"
echo "XDG_RUNTIME_DIR=\${XDG_RUNTIME_DIR:-}"
echo "GDK_BACKEND=\${GDK_BACKEND:-}"

if [[ "\${1:-}" != "--inside-dbus" ]]; then
  exec /usr/bin/dbus-run-session -- "\$0" --inside-dbus
fi

pkill -u "\$(id -u)" -f at-spi-bus-launcher 2>/dev/null || true
pkill -u "\$(id -u)" -f accessibility.conf 2>/dev/null || true

if [[ "${SESSION_BACKEND}" == "x11" ]]; then
  export DISPLAY=:0
  export GDK_BACKEND=x11
  rm -f /tmp/.X0-lock

  XINITRC="\${LOG_DIR}/xinitrc"
  cat >"\${XINITRC}" <<'XINITRC'
#!/usr/bin/env bash
set -euo pipefail

xset s off -dpms s noblank 2>/dev/null || true
export GDK_BACKEND=x11
export XDG_CURRENT_DESKTOP=Openbox
dbus-update-activation-environment --verbose DISPLAY XAUTHORITY GDK_BACKEND XDG_CURRENT_DESKTOP || true

unclutter -idle 0.25 -root >/dev/null 2>&1 &
openbox >/dev/null 2>&1 &

exec ${APP_BINARY}
XINITRC
  chmod 0755 "\${XINITRC}"

  exec /usr/bin/startx "\${XINITRC}" -- :0 vt1 -keeptty -nolisten tcp
fi

export WAYLAND_DISPLAY=wayland-karlo
rm -f "\${XDG_RUNTIME_DIR}/\${WAYLAND_DISPLAY}" "\${XDG_RUNTIME_DIR}/\${WAYLAND_DISPLAY}.lock"

/usr/bin/weston \\
  --backend=drm \\
  --shell=${WESTON_SHELL} \\
  --idle-time=0 \\
  --socket="\${WAYLAND_DISPLAY}" \\
  --log="\${LOG_DIR}/weston.log" &
WESTON_PID=\$!

cleanup() {
  kill "\${WESTON_PID}" 2>/dev/null || true
  wait "\${WESTON_PID}" 2>/dev/null || true
}
trap cleanup EXIT

for _ in {1..100}; do
  if [[ -S "\${XDG_RUNTIME_DIR}/\${WAYLAND_DISPLAY}" ]]; then
    break
  fi
  sleep 0.05
done

if [[ ! -S "\${XDG_RUNTIME_DIR}/\${WAYLAND_DISPLAY}" ]]; then
  echo "weston did not create \${XDG_RUNTIME_DIR}/\${WAYLAND_DISPLAY}" >&2
  exit 1
fi

dbus-update-activation-environment --verbose --all || true
echo "WAYLAND_DISPLAY=\${WAYLAND_DISPLAY}"

exec ${APP_BINARY}
SESSION
run chmod 0755 "${SESSION_WRAPPER}"

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
Environment=XDG_SESSION_TYPE=${SESSION_BACKEND}
Environment=XDG_RUNTIME_DIR=/run/user/%U
Environment=GDK_BACKEND=${SESSION_BACKEND}
Environment=GTK_USE_PORTAL=0
Environment=NO_AT_BRIDGE=1
Environment=RUST_BACKTRACE=1
Environment=WEBKIT_DISABLE_COMPOSITING_MODE=1
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardInput=tty
StandardOutput=journal
StandardError=journal
ExecStart=${SESSION_WRAPPER}
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
