# Cabinet

Two ways to get code onto the machine:

- **production** — `main` publishes a rolling AppImage the cabinet polls and installs
- **preview** — a fullscreen kiosk browser pointed at a LAN Vite server, for UI iteration

Library state is local to the cabinet. Deploys replace the AppImage only; they
never touch the app database or settings.

## Target

- Ubuntu 24.04 LTS x86_64 on the mini PC
- dedicated `karlo` user, autologin on `tty1`
- X11 started from `tty1` via `startx`, no desktop shell, panel, or compositor

## First-time setup

Install Tauri's Linux prerequisites plus a minimal X stack:

```sh
sudo apt update
sudo apt install \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  xorg \
  xinit
```

Rust and Bun install separately.

Clone the repo and install the host runtime:

```sh
sudo ./deploy/linux/install-arcade-host.sh --user karlo
```

Before the first `main` release exists, build locally and seed it:

```sh
bun install
bun test
bun run tauri:build -- --bundles appimage

sudo ./deploy/linux/install-arcade-host.sh \
  --user karlo \
  --seed-appimage "$(find src-tauri/target/release/bundle/appimage -type f -name '*.AppImage' | head -n 1)"
```

Reboot and confirm the machine lands in Karlo with no manual input.

## Layout

```text
/opt/karlo/releases/<commit>/   unpacked releases
/opt/karlo/current              symlink to the live release
/opt/karlo/previous             symlink to the rollback target
/etc/karlo/karlo.env            production runtime config
/etc/karlo/karlo-preview.env    browser preview config
```

Units:

- `karlo.service` — user unit, runs the production AppImage
- `karlo-preview.service` — user unit, runs the browser preview
- `karlo-update.service` / `.timer` — system unit and timer, polls and stages updates

### `karlo.env`

| Key | Meaning |
| --- | --- |
| `KARLO_ROOT` | install root, normally `/opt/karlo` |
| `KARLO_RUNTIME_USER` | user the app runs as |
| `KARLO_UPDATE_MANIFEST_URL` | manifest to poll |
| `KARLO_UPDATE_APPLY_MODE` | `next-restart` (default) or `restart` for immediate restarts |
| `KARLO_RELEASE_RETAIN_COUNT` | optional; old releases to keep |

### `karlo-preview.env`

| Key | Meaning |
| --- | --- |
| `KARLO_DEV_URL` | the Vite dev server, e.g. `http://192.168.1.10:1420` |
| `KARLO_BROWSER` | optional browser override, default `google-chrome-stable` |

## Production deploys

1. Push to `main`.
2. CI runs on both `develop` and `main`, but only a green `main` publishes.
3. The `arcade-stable` release gets `Karlo-x86_64.AppImage` and `arcade-stable.json`.
4. The cabinet polls the manifest, downloads, verifies the checksum, and swaps `current`.
5. The new build applies on the next Karlo restart or reboot, unless
   `KARLO_UPDATE_APPLY_MODE=restart`.

Manifest: `https://github.com/bentruyman/karlo/releases/download/arcade-stable/arcade-stable.json`

`develop` is the repo default branch, so `publish-arcade.yml` has to stay on
`develop` for its `workflow_run` trigger to be evaluated — GitHub reads that
workflow from the default branch. Move it if the default branch ever changes.

## Live UI preview

Run Vite on the dev machine:

```sh
bun run dev
```

Point the cabinet at it:

```sh
sudo karlo-preview on http://DEV_MACHINE_IP:1420
```

Back to the installed build:

```sh
sudo karlo-preview off
```

`sudo karlo-preview status` reports which mode the cabinet is in.

Preview runs the UI in a browser with no Tauri backend, so it renders against
mock data and cannot save config or touch the database. It is for layout and
navigation work only.

## Operations

Force an update check:

```sh
sudo systemctl start karlo-update.service
```

Apply a staged build now:

```sh
sudo runuser -u karlo -- env XDG_RUNTIME_DIR="/run/user/$(id -u karlo)" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u karlo)/bus" \
  systemctl --user restart karlo.service
```

Check the timer:

```sh
systemctl status karlo-update.timer
```

Roll back:

```sh
sudo ln -sfn "$(readlink -f /opt/karlo/previous)" /opt/karlo/current
sudo runuser -u karlo -- env XDG_RUNTIME_DIR="/run/user/$(id -u karlo)" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u karlo)/bus" \
  systemctl --user restart karlo.service
```
