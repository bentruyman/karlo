# Architecture

One local app. Tauri v2 shell, React 19 + Vite UI, Rust owns SQLite, cabinet
config, MAME metadata import, and a loopback media server. No separate backend.

```text
src/           React cabinet UI
src-tauri/     Rust commands, SQLite, MAME import
deploy/linux/  cabinet host install, systemd units, update/preview scripts
scripts/       release manifest generation
ops/           library curation, organization, sync, and cabinet deployment
```

## Frontend/backend seam

The Rust side registers twelve commands in `src-tauri/src/lib.rs`:

| Command | Purpose |
| --- | --- |
| `get_frontend_bootstrap` | default view + cabinet config + curation contract, in one call |
| `get_cabinet_config` / `save_cabinet_config` | service-menu config round trip |
| `get_library_snapshot` | imported games, library entries, recents |
| `toggle_game_favorite` | flips `is_favorite`, returns a fresh snapshot |
| `record_recent_game` | stamps `recent_games`, returns a fresh snapshot |
| `launch_mame_game` | hides Karlo, runs MAME, restores focus, records the game |
| `import_mame_catalog` | runs `mame -listxml` and rebuilds `games` |
| `scan_rom_roots` | walks configured ROM roots, updates `rom_available` |
| `get_runtime_contract` | schema/curation rules, surfaced in the service menu |
| `get_schema_overview` | schema version, DDL, and table purposes |
| `report_frontend_diagnostic` | writes media playback diagnostics to stderr |

Mutations return the whole `LibrarySnapshot` rather than a delta, so the UI
replaces state instead of reconciling it.

Every loader in `src/app/bootstrap.ts` wraps `invoke` in a `try/catch` and
falls back to a `DEFAULT_*` constant. That is why `bun run dev` renders a
fully working cabinet in an ordinary browser tab with no Tauri process — the
same path the LAN preview kiosk uses. The consequence: a genuinely broken
command surfaces as stale defaults, not an error. Writes
(`save_cabinet_config`, `toggle_game_favorite`, `record_recent_game`,
the two maintenance commands) deliberately have no fallback and reject.

## Data

SQLite at `karlo.sqlite3` inside Tauri's `app_data_dir`, created and migrated
on startup by `store::AppState::initialize`. Schema version 2; the DDL lives
in `src-tauri/src/db.rs` (`SCHEMA_SQL`) and is not restated here.

Four tables: `games`, `library_entries`, `settings`, `recent_games`.

The one split worth explaining is `games` vs `library_entries`. `games` holds
imported MAME truth — every runnable machine `-listxml` reported, whether or
not the cabinet has the ROM or ever shows it. `library_entries` holds the
cabinet's opinion: visibility, favorites, browse order, attract order. Import
and scan rewrite `games` freely; they only ever *add* missing
`library_entries` rows. So a rescan never loses curation, and browse views
read curated visible entries, never the raw catalog.

`settings` is a flat key/value table. The eight required keys, their types,
and their purposes are declared once in `db.rs::SETTINGS` and re-exported to
the UI through `get_runtime_contract`.

`src/app/mock-catalog.json` has two consumers: `src-tauri/src/seed.rs`
`include_str!`s it to seed a fresh database on first run, and the TS mock
path imports it for the no-Tauri fallback. Editing it changes both.

## UI

A single 16:9 container. Mode bar across the top (favorites, recent, genre,
year, manufacturer), a windowed 14-row game list with an A–Z letter ribbon on
the left, a preview panel on the right, control hints along the bottom.

The preview panel plays configured video, falls back to artwork, then to a
gradient placeholder. Device media is served over loopback HTTP for range
request support; packaged relative media stays on the normal asset path.

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

Four sections — Launch (MAME paths), Library (ROM/media roots), Display
(attract timeout), Storage (read-only schema summary) — each with panel
actions: run the catalog import, run a ROM scan, open calibration.

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

`.github/workflows/publish-arcade.yml` watches for a successful CI run and
publishes the `arcade-stable` release only when the head branch was `main`.
`develop` is the default branch; see [Cabinet](cabinet.md) for the deploy path.
