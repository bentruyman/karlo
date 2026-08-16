# Architecture

One local app. Tauri v2 shell, React 19 + Vite UI, Rust owns SQLite, cabinet
config, MAME metadata import, and a loopback media server. No separate backend.

```text
src/           React cabinet UI
src-tauri/     Rust commands, SQLite, MAME import
deploy/linux/  cabinet host install, systemd units, update/preview scripts
scripts/       release manifest generation
ops/           library curation, organization, and sync
```

## Frontend/backend seam

The Rust side registers eight commands in `src-tauri/src/lib.rs`:

| Command | Purpose |
| --- | --- |
| `get_frontend_bootstrap` | default view, cabinet config, and media server URL, in one call |
| `get_cabinet_config` / `save_cabinet_config` | service-menu config round trip |
| `get_library_snapshot` | imported games, library entries, recents |
| `toggle_game_favorite` | flips `is_favorite`, returns a fresh snapshot |
| `launch_mame_game` | hides Karlo, runs MAME, restores focus, records the game |
| `scan_rom_roots` | walks configured ROM roots, updates `rom_available`, and imports `-listxml` metadata when MAME is configured |
| `report_frontend_diagnostic` | writes media playback diagnostics to stderr |

Mutations return the whole `LibrarySnapshot` rather than a delta, so the UI
replaces state instead of reconciling it.

Every loader in `src/app/bootstrap.ts` wraps `invoke` in a `try/catch` and
falls back to a `DEFAULT_*` constant. That is why `bun run dev` renders a
fully working cabinet in an ordinary browser tab with no Tauri process — the
same path the LAN preview kiosk uses. The consequence: a genuinely broken
command surfaces as stale defaults, not an error. Writes
(`save_cabinet_config`, `toggle_game_favorite`, `launch_mame_game`,
`scan_rom_roots`) deliberately have no fallback and reject.

## Data

SQLite at `karlo.sqlite3` inside Tauri's `app_data_dir`, created on startup by
`store::AppState::initialize`. The DDL lives in `src-tauri/src/db.rs`
(`SCHEMA_SQL`) and is not restated here. A fresh database starts empty; the
library fills in from a ROM scan.

Four tables: `games`, `library_entries`, `settings`, `recent_games`.

The one split worth explaining is `games` vs `library_entries`. `games` holds
imported MAME truth — every runnable machine `-listxml` reported, whether or
not the cabinet has the ROM or ever shows it. `library_entries` holds the
cabinet's opinion: visibility, favorites, browse order, attract order. Import
and scan rewrite `games` freely; they only ever *add* missing
`library_entries` rows. So a rescan never loses curation, and browse views
read curated visible entries, never the raw catalog.

`settings` is a flat key/value table, written and read as a whole
`CabinetConfig` by `store::settings_pairs` and `store::load_cabinet_config`.

`src/app/mock-catalog.json` backs the no-Tauri fallback only — `bun run dev`
and the LAN preview kiosk. It never reaches the cabinet database.

## UI

A single 16:9 container. Mode bar across the top (favorites, recent, genre,
year, manufacturer), a windowed 14-row game list with an A–Z letter ribbon on
the left, a preview panel on the right, control hints along the bottom.

The preview panel plays configured video, falls back to artwork, then to a
gradient placeholder. All device media — video and artwork alike — is served
over the loopback HTTP server for range request support; packaged relative
media stays on the normal asset path.

### Controls

| Key | In browse |
| --- | --- |
| `↑` `↓` | move the selection; from the top row, `↑` focuses the mode bar |
| `←` `→` | jump to the previous/next letter bucket; on the mode bar, cycle views |
| `Enter` `1` `Z` | select (records the game as recently played) |
| `X` | toggle favorite |
| `C` `Space` | next view |
| `V` | previous view |
| `B` | jump to favorites |
| `5` ×3 within 1.4s | open the service menu |
| `Esc` | back out of service menu or calibration |

`Cmd`/`Ctrl`+`S` saves inside the service menu and calibration screens.

### Attract mode

An interval checks idle time against `attract_timeout_seconds`. Once idle, it
hides the browse UI and moves a color-changing Karlo token around the screen.
The selection continues advancing behind it every 3.6s. Any interaction exits
immediately, and attract mode never opens while the service menu is up.

### Service menu

Three sections — Launch (MAME paths), Library (ROM/media roots), Display
(attract timeout) — with two panel actions: run a ROM scan, open calibration.

Calibration adjusts four edge insets between 0% and 25%, persisted as
`display_calibration_json`, and applied as absolute offsets on the content
grid.

The layout is a 16:9 letterbox sized to `min(100vw, 100vh * 16/9)`, and that
box — not the inset content box — is the container-query root. Everything
sizes in `cqh`/`cqw`, so type and spacing stay pinned to the full frame while
the insets only pull the content inward. Raising an inset moves content away
from the panel edge without shrinking it.

## CI

`.github/workflows/ci.yml` runs on `develop` and `main`: `bun test`,
`bun run build`, `cargo test`, then an AppImage build.

`.github/workflows/publish-arcade.yml` watches for a successful CI run,
downloads the AppImage that run already built, and publishes the
`arcade-stable` release only when the head branch was `main`.
`develop` is the default branch; see [Cabinet](cabinet.md) for the deploy path.
