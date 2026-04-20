#!/usr/bin/env sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run install-arcade-host.sh as root." >&2
  exit 1
fi

runtime_user="karlo"
karlo_root="/opt/karlo"
seed_appimage=""
seeded_release=0

usage() {
  echo "usage: $0 [--user <user>] [--root <path>] [--seed-appimage <appimage>]" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --user)
      runtime_user="${2:-}"
      shift 2
      ;;
    --root)
      karlo_root="${2:-}"
      shift 2
      ;;
    --seed-appimage)
      seed_appimage="${2:-}"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

home_dir="$(getent passwd "$runtime_user" | cut -d: -f6)"

if [ -z "$home_dir" ]; then
  echo "Could not resolve a home directory for user ${runtime_user}." >&2
  exit 1
fi

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
systemd_dir="$script_dir/systemd"
user_systemd_dir="$systemd_dir/user"

install -d -o "$runtime_user" -g "$runtime_user" \
  "$home_dir/.config" \
  "$home_dir/.config/systemd" \
  "$home_dir/.config/systemd/user" \
  "$home_dir/.config/systemd/user/default.target.wants"

mkdir -p \
  "$karlo_root/bin" \
  "$karlo_root/releases" \
  /etc/karlo \
  /etc/systemd/system \
  /etc/systemd/system/getty@tty1.service.d

install -m 0755 "$script_dir/karlo-run-current.sh" "$karlo_root/bin/karlo-run-current.sh"
install -m 0755 "$script_dir/karlo-run-preview.sh" "$karlo_root/bin/karlo-run-preview.sh"
install -m 0755 "$script_dir/karlo-update.sh" "$karlo_root/bin/karlo-update.sh"
install -m 0755 "$script_dir/karlo-preview" /usr/local/bin/karlo-preview

install -m 0644 "$systemd_dir/karlo-update.service" /etc/systemd/system/karlo-update.service
install -m 0644 "$systemd_dir/karlo-update.timer" /etc/systemd/system/karlo-update.timer
install -m 0644 "$user_systemd_dir/karlo.service" "$home_dir/.config/systemd/user/karlo.service"
install -m 0644 "$user_systemd_dir/karlo-preview.service" "$home_dir/.config/systemd/user/karlo-preview.service"
install -m 0644 "$script_dir/karlo-tty1-autologin.conf" /etc/systemd/system/getty@tty1.service.d/override.conf
install -m 0755 "$script_dir/karlo-xinitrc" "$home_dir/.xinitrc"

if [ ! -f "$home_dir/.bash_profile" ] || ! grep -q 'startx "$HOME/.xinitrc"' "$home_dir/.bash_profile"; then
  cat "$script_dir/karlo-bash-profile" >> "$home_dir/.bash_profile"
fi

if [ ! -f /etc/karlo/karlo.env ]; then
  sed \
    -e "s#__KARLO_ROOT__#${karlo_root}#g" \
    -e "s#__KARLO_RUNTIME_USER__#${runtime_user}#g" \
    "$script_dir/karlo.env.example" > /etc/karlo/karlo.env
  chmod 0644 /etc/karlo/karlo.env
fi

if [ ! -f /etc/karlo/karlo-preview.env ]; then
  install -m 0644 "$script_dir/karlo-preview.env.example" /etc/karlo/karlo-preview.env
fi

if [ -n "$seed_appimage" ]; then
  if [ ! -f "$seed_appimage" ]; then
    echo "Seed AppImage not found: $seed_appimage" >&2
    exit 1
  fi

  seed_release="manual-$(date -u +%Y%m%d%H%M%S)"
  seed_dir="$karlo_root/releases/$seed_release"
  mkdir -p "$seed_dir"
  install -m 0755 "$seed_appimage" "$seed_dir/Karlo.AppImage"
  printf '%s\n' "$seed_release" > "$seed_dir/commit.txt"
  ln -sfn "$seed_dir" "$karlo_root/current"
  seeded_release=1
fi

chown -R "$runtime_user:$runtime_user" \
  "$home_dir/.config/systemd/user" \
  "$home_dir/.xinitrc" \
  "$home_dir/.bash_profile"

systemctl daemon-reload
systemctl enable --now karlo-update.timer
loginctl enable-linger "$runtime_user" >/dev/null 2>&1 || true

warning_text=""
if [ "$seeded_release" -ne 1 ] && [ ! -x "$karlo_root/current/Karlo.AppImage" ]; then
  warning_text="Warning: no AppImage is staged at ${karlo_root}/current yet. The X session will stay idle until the first successful update or until you seed a local AppImage."
fi

cat <<EOF
Installed the Karlo arcade runtime for user ${runtime_user}.

Next steps:
  1. Review /etc/karlo/karlo.env
  2. Review /etc/karlo/karlo-preview.env
  3. Reboot the cabinet host
$warning_text
EOF
