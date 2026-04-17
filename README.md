# Karlo

Karlo is a Linux-first arcade cabinet front-end for MAME.

The target environment is a real 4:3 CRT television running at 480i, driven by a stripped-down mini PC that boots directly into the front-end and launches MAME seamlessly.

## Status

This repo is being rebooted.

The existing `packages/*` code is a legacy prototype and is not the current architecture direction.

## Direction

- Single local app, not a web app plus separate backend service
- Tauri shell with a React/Vite UI and Rust runtime
- SQLite for ROM metadata, favorites, recent games, and settings
- Manual ROM/media scanning
- CRT-first UI with overscan-safe layout and large readable focus states
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
- `bun run dev`
- `bun run tauri:dev`

The old `packages/*` tree is still present as legacy reference material, but the active app now lives in:

- `src/`
- `src-tauri/`
