# Karlo

Karlo is a Linux-first arcade cabinet front-end for MAME.

The target environment is a 27-inch 1440p LCD display, driven by a stripped-down mini PC that boots directly into the front-end and launches MAME seamlessly.

## Status

This repo is being rebooted.

## Direction

- Single local app, not a web app plus separate backend service
- Tauri shell with a React/Vite UI and Rust runtime
- SQLite for ROM metadata, favorites, recent games, and settings
- Manual ROM/media scanning
- LCD-first UI with a 16:9 safe-area layout and large readable focus states
- MAME-only scope for v1

## Planning Docs

- [Reboot Plan](docs/reboot-plan.md)

## Initial Product Priorities

- Favorites-first home screen
- Browse by genre, year, manufacturer, favorites, and recently played
- Large preview-video-focused game selection UI
- Seamless launch into MAME and seamless return to Karlo
- Hidden admin menu for cabinet tasks like rescan, calibration, reboot, and shutdown

## Development

Milestone 0 is now scaffolded at the repo root.

### Commands

- `bun install`
- `bun test`
- `bun run dev`
- `bun run tauri:dev`
- `bun run organize:library`
- `bun run deploy:cabinet`

The active app lives in:

- `src/`
- `src-tauri/`

### MAME Launching

Use the hidden service menu to set the MAME executable path before launching
games. The optional `mame.ini` path is used as MAME's `-inipath` directory.
Press the launch control on a selected game to hide Karlo, run MAME for that
machine, then return to the same frontend state when MAME exits.

### ROM and Media Scanning

Use the hidden service menu to configure ROM roots, media roots, and an optional
MAME category INI path, then run the library scan from the Library section.
Scanned ROM archives or ROM directories are added to the local SQLite catalog
when they are not already known, marked available, and made visible in the
cabinet library. The scan also imports MAME `-listxml` metadata when a MAME
executable is configured, and uses the category INI file to populate browse
genres when available.

### Repo Shape

- `docs/` for planning and project notes
- `src/` for the React/Vite cabinet UI
- `src-tauri/` for Rust commands, persistence, and launcher work

## Cabinet Deployment

The repo runs lightweight Bun CI on `develop` and release packaging on `main`.
Pushes to `main` build the Linux desktop artifact in GitHub Actions, which can
then be deployed to an Ubuntu/Debian x64 cabinet over SSH.

One-time local setup:

1. Authenticate the GitHub CLI with access to this repo: `gh auth login`
2. Copy `ops/cabinet.env.example` to `ops/cabinet.env`
3. Set `KARLO_CABINET_HOST` and `KARLO_CABINET_SSH_USER`
4. Confirm the SSH user can run `sudo` on the cabinet

Deploy the current pushed commit:

```sh
bun run deploy:cabinet
```

The deploy command expects `HEAD` to be pushed to `KARLO_GITHUB_REF`, reuses a
successful `linux-artifact.yml` run for that commit when one exists, or triggers
the workflow manually for that exact SHA. It downloads the `.deb`, installs it
on the cabinet, and restarts `karlo-session.service`.

By default `KARLO_GITHUB_REF` should point at `main` for release deployments.
Set it to another pushed branch, such as `develop`, only when you intentionally
want a manual non-release cabinet build.

Provisioning is enabled by default. It installs the cabinet runtime packages,
creates the dedicated `karlo` user if needed, installs a systemd service that
runs Karlo on tty1, disables the normal display manager for a direct cabinet
boot, and keeps SSH enabled for future deploys. The default session backend is
X11 with Openbox because it is more reliable with Tauri/WebKit on the tested
Ubuntu cabinet image. A Weston-based Wayland path remains available with
`KARLO_SESSION_BACKEND=wayland`.

Set `KARLO_PASSWORDLESS_SUDO=1` for a dedicated cabinet if you want future
deploys to run without prompting for the SSH user's sudo password.
