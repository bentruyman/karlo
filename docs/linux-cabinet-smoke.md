# Linux Cabinet Smoke Build

This is the first slice of issue `#28`.

The goal for this pass is narrow on purpose: boot directly into the Karlo frontend on the real cabinet PC and make the startup path repeatable.

For the managed `main` auto-deploy path and LAN UI preview flow, use [Arcade Updates](arcade-updates.md).

## Scope Boundary

This smoke pass does include:

- building Karlo on the target Linux machine
- starting a dedicated cabinet user directly into Karlo
- running the app in fullscreen kiosk mode without a normal desktop shell
- timing boot-to-frontend and logging blockers

This smoke pass does not include:

- launching MAME from Karlo yet; that is issue `#26`
- validating preview video performance yet; that still depends on issue `#25`
- retiring the converter, timing, and input risks tracked in issue `#29`

## Supported First Pass

Use this exact path for the first hardware trial:

- Ubuntu 24.04 LTS x86_64 on the cabinet mini PC
- build on the cabinet machine itself
- X11 started from `tty1` via `startx`
- dedicated `karlo` user with autologin on `tty1`
- no desktop shell, panel, or compositor

This keeps the first test build simple and lines up with Tauri's Linux build constraints and AppImage media-framework guidance.

## System Packages

Install the Tauri Linux prerequisites plus the minimal X stack:

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
  python3 \
  xorg \
  xinit
```

Rust and Bun still need to be installed separately.

## Build On The Cabinet

From the repo root on the Linux cabinet machine:

```sh
bun install
bun test
bun run tauri:build -- --bundles appimage
```

Useful outputs:

- `src-tauri/target/release/karlo`
- `src-tauri/target/release/bundle/appimage/`

For the first smoke pass, seed the locally built AppImage into the managed runtime and confirm the cabinet boots straight into the frontend before wiring up CI auto-promotion.

## Direct Boot Setup

1. Create a dedicated `karlo` user on the cabinet machine.
2. Build the local AppImage.
3. Run [deploy/linux/install-arcade-host.sh](../deploy/linux/install-arcade-host.sh) with the built AppImage:

   ```sh
   sudo ./deploy/linux/install-arcade-host.sh \
     --user karlo \
     --seed-appimage "$(find src-tauri/target/release/bundle/appimage -type f -name '*.AppImage' | head -n 1)"
   ```

4. Reboot and confirm the machine lands in Karlo without manual input.
5. After the smoke boot works, point `/etc/karlo/karlo.env` at the rolling manifest and let the update timer take over.

## Smoke Checklist

- cold boot lands in Karlo with no shell or desktop visible
- the app opens fullscreen and stays focused
- keyboard or IPAC navigation still works in the frontend
- the hidden service menu still opens
- config changes persist across reboot
- measured time from power-on to usable frontend is captured

## Boot Blockers To Track

Record these during the first hardware pass instead of guessing:

- total cold-boot time to interactive frontend
- any visible mode-switch flashing before the UI appears
- whether WebKit or GPU startup shows warnings or stalls
- whether fullscreen focus is lost after boot
- whether `tty1` autologin or `startx` adds unexpected delay
