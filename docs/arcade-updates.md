# Arcade Updates

Karlo now supports two separate iteration paths:

- production deploys from green `main` commits via a rolling AppImage release
- live UI iteration on the cabinet through a fullscreen kiosk browser pointed at a LAN Vite server

Library state stays local to the cabinet. Code deploys must not overwrite the app database or settings.

## Production Flow

1. Push to `main`.
2. GitHub Actions runs CI. `develop` and `main` both stay covered, but only `main` publishes the arcade release.
3. A successful `main` build publishes `arcade-stable`:
   - `Karlo-x86_64.AppImage`
   - `arcade-stable.json`
4. The arcade host polls the manifest, downloads the new AppImage, verifies the checksum, and swaps the `current` symlink.
5. By default the new build applies on the next Karlo restart or cabinet reboot. Set `KARLO_UPDATE_APPLY_MODE=restart` only if you explicitly want immediate restarts after an update check.

Stable manifest URL:

- `https://github.com/bentruyman/karlo/releases/download/arcade-stable/arcade-stable.json`

## Arcade Host Install

Install the host runtime from the cabinet machine after cloning the repo:

```sh
sudo ./deploy/linux/install-arcade-host.sh --user karlo
```

To seed the machine before the first published `main` release exists, pass a local AppImage:

```sh
sudo ./deploy/linux/install-arcade-host.sh \
  --user karlo \
  --seed-appimage "$(find src-tauri/target/release/bundle/appimage -type f -name '*.AppImage' | head -n 1)"
```

Important runtime paths:

- `/opt/karlo/releases/<commit>/`
- `/opt/karlo/current`
- `/opt/karlo/previous`
- `/etc/karlo/karlo.env`
- `/etc/karlo/karlo-preview.env`

Installed units:

- `karlo.service` user unit for the production AppImage
- `karlo-preview.service` user unit for live browser preview
- `karlo-update.service` system unit for polling and staging updates
- `karlo-update.timer` system timer for recurring checks

## Live UI Preview

Run Vite on the dev machine:

```sh
bun run dev
```

Switch the cabinet into browser preview:

```sh
sudo karlo-preview on http://DEV_MACHINE_IP:1420
```

Switch back to the installed Tauri build:

```sh
sudo karlo-preview off
```

Preview mode is for UI, layout, and navigation iteration only. The production deploy path stays on the bundled Tauri AppImage.

## Operations

Force an immediate update check:

```sh
sudo systemctl start karlo-update.service
```

Apply a staged build immediately:

```sh
sudo runuser -u karlo -- env XDG_RUNTIME_DIR="/run/user/$(id -u karlo)" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u karlo)/bus" \
  systemctl --user restart karlo.service
```

Inspect the update timer:

```sh
systemctl status karlo-update.timer
```

Rollback to the previous deployed AppImage:

```sh
sudo ln -sfn "$(readlink -f /opt/karlo/previous)" /opt/karlo/current
sudo runuser -u karlo -- env XDG_RUNTIME_DIR="/run/user/$(id -u karlo)" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u karlo)/bus" \
  systemctl --user restart karlo.service
```
