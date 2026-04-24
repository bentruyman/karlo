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
- `bun run deploy:cabinet`

The active app lives in:

- `src/`
- `src-tauri/`

### Repo Shape

- `docs/` for planning and project notes
- `src/` for the React/Vite cabinet UI
- `src-tauri/` for Rust commands, persistence, and launcher work

## Cabinet Deployment

The repo can build a Linux desktop artifact in GitHub Actions and deploy it to
an Ubuntu/Debian x64 cabinet over SSH.

One-time local setup:

1. Authenticate the GitHub CLI with access to this repo: `gh auth login`
2. Copy `ops/cabinet.env.example` to `ops/cabinet.env`
3. Set `KARLO_CABINET_HOST` and `KARLO_CABINET_SSH_USER`
4. Confirm the SSH user can run `sudo` on the cabinet

Deploy the current pushed commit:

```sh
bun run deploy:cabinet
```

The deploy command expects `HEAD` to be pushed to `KARLO_GITHUB_REF`, triggers
or reuses the matching `linux-artifact.yml` workflow, downloads the `.deb`,
installs it on the cabinet, and restarts `karlo-session.service`.

Provisioning is enabled by default. It installs the cabinet runtime packages,
creates the dedicated `karlo` user if needed, installs a systemd service that
runs Karlo under `cage` on tty1, disables the normal display manager for a
direct cabinet boot, and keeps SSH enabled for future deploys.
