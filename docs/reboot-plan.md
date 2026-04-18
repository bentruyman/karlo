# Karlo Reboot Plan

## Product Definition

Karlo is a cabinet-first MAME front-end for a personal arcade machine.

The hardware and UX assumptions currently locked in:

- Linux mini PC
- Auto-login into the front-end
- Offline-capable operation
- True 4:3 CRT target at 480i, likely via HDMI conversion or transcoding
- IPAC-style keyboard encoder for controls
- MAME-only scope for v1
- Favorites-first home screen
- Manual ROM and media scanning
- Hidden admin/service menu
- Attract mode when the cabinet is idle

## Design Direction

The provided visual reference points in a useful direction:

- One dominant central gameplay or preview area
- Strong asymmetry instead of a grid-heavy launcher
- Cabinet art and logo treatment as supporting context, not the primary navigation model
- Sparse metadata instead of dense lists
- Mostly black background so the CRT image stays punchy

That should be translated into a CRT-safe layout rather than copied literally.

### CRT-Specific Rules

- Design for a fixed 4:3 frame first
- Keep critical content inside an overscan-safe area inset by roughly 5% to 8%
- Use large type, large focus rings, and high-contrast silhouettes
- Avoid thin rules, small labels, and dense metadata blocks
- Assume blur, interlace flicker, and inconsistent converter quality
- Prefer fewer moving elements on screen at once
- Skip fake scanline effects and other decorative filters that reduce readability

## Recommended Architecture

The recommended v1 architecture is a single local app:

- `React + Vite` for the UI
- `Tauri` for the desktop shell
- `Rust` for scanning, persistence, config, and launching MAME
- `SQLite` for local data

Why this fits:

- Faster and cleaner than booting Chromium kiosk just to host one local app
- Easier seamless return from MAME than a browser-only setup
- Still very easy to iterate on during development
- No local HTTP service required for v1
- Good long-term path for packaging and cabinet deployment

## Runtime Model

### Normal Startup

1. Linux boots into a minimal user session.
2. The session launches Karlo directly in fullscreen.
3. Karlo opens into the favorites screen.
4. If no favorites exist yet, Karlo falls back to the full library browser.

### Configuration Model

Karlo needs an explicit cabinet configuration model instead of hardcoded local paths.

- Cabinet-specific launcher and scan settings live in SQLite-backed app settings owned by the Rust side
- Required v1 config includes:
  - MAME executable path
  - optional `mame.ini` path
  - one or more ROM roots
  - one or more media roots
  - preview-video root
  - artwork root
  - attract-mode timeout
  - display calibration and overscan values
- The hidden admin menu is responsible for editing and validating this configuration
- Manual scans run only against the configured roots

### Import and Scan Model

- ROM scans are manual, triggered from the hidden admin menu
- Media scans are manual, also triggered from the admin menu
- Scan commands resolve their ROM and media roots from persisted cabinet configuration
- Karlo stores scan results in SQLite so normal startup stays fast
- MAME XML should be the source of truth for machine identity and core metadata
- Genre/category data will likely need an extra curated source layered on top of MAME metadata

### Game Launch Model

1. User focuses a game in the frontend.
2. Preview video and artwork update immediately.
3. `Start` launches MAME with the selected machine using the persisted MAME executable path and launch configuration.
4. Karlo hides while MAME owns the screen.
5. On MAME exit, Karlo resumes directly to the same location in the frontend.

## Proposed Repo Structure

Start over with a simple single-app layout:

```text
docs/
src/                 # React UI
src-tauri/           # Rust commands, DB, launcher, config
tools/               # import/reconcile utilities
public/              # static UI assets
```

This keeps the project simple while still leaving room to add tooling scripts later.

## Data Model

SQLite should stay intentionally small for v1.

### Configuration Strategy

Imported machine metadata and cabinet-specific presentation rules should not be fused together.

- `games` stores imported MAME truth plus resolved media pointers
- `library_entries` stores cabinet-facing curation rules such as visibility, favorites, and ordering
- `settings` stores cabinet configuration such as MAME paths, ROM roots, media roots, and calibration

This separation keeps import behavior predictable:

- Karlo can retain imported machines that are not currently visible in the cabinet UI
- browse views and attract mode operate on curated visible library entries, not the full imported catalog
- an initial import may seed visible library entries for ROM-available games in title order, but long-term curation lives in `library_entries`

### Core Tables

- `games`
  - `id`
  - `machine_name`
  - `title`
  - `year`
  - `manufacturer`
  - `genre`
  - `rom_available`
  - `video_path`
  - `artwork_paths_json`
- `library_entries`
  - `game_id`
  - `is_visible`
  - `is_favorite`
  - `browse_sort_order`
  - `attract_sort_order`
  - `include_in_attract_mode`
- `settings`
  - cabinet config and global app settings
  - required keys include:
    - `mame_executable_path`
    - `mame_ini_path`
    - `rom_roots_json`
    - `media_roots_json`
    - `preview_video_root`
    - `artwork_root`
    - `attract_timeout_seconds`
    - `display_calibration_json`
- `recent_games`
  - game id and timestamp

### Deferred to v2

- play count
- cumulative play time
- richer media indexing
- per-game presentation overrides

## UI Shape

The first UI pass should be optimized for a curated-library experience, not a giant spreadsheet of MAME titles.

Frontend browse views should operate on curated visible library entries by default. Hidden imported machines remain available to service and import tooling without cluttering the cabinet-facing UI.

### Primary Selection Screen

- Favorites is the default landing screen
- A small carousel or horizontal strip handles navigation between visible games
- The dominant panel is a large preview-video area
- Secondary panels can show marquee art, cabinet art, or title/logo treatment
- Metadata stays sparse: title, year, manufacturer, genre

### Secondary Navigation

- Full library browser
- Genre
- Year
- Manufacturer
- Recently played

### Attract Mode

- Starts after an idle timeout
- Cycles through a curated sequence of visible games
- Prefers explicit `attract_sort_order` entries and falls back to visible browse order if no dedicated attract sequence exists
- Uses muted preview video by default
- Can be interrupted immediately by any control input

## Admin and Cabinet Operations

The cabinet should be operable from arcade controls in normal use, with a hidden service/admin path for maintenance.

### Normal User Actions

- navigate
- launch
- back
- favorite toggle

### Hidden Admin Menu

- configure MAME executable path, `mame.ini`, ROM roots, and media roots
- rescan ROMs
- rescan media
- display calibration and overscan adjustment
- input test
- shutdown
- reboot

## Linux Boot Strategy

The app alone will not achieve an under-8-second cold boot. The OS image and boot flow matter just as much.

Recommended direction:

- lightweight Linux install
- auto-login dedicated `karlo` user
- minimal session that launches Karlo directly
- no desktop shell, dock, or wallpaper process
- systemd-managed startup where possible
- MAME and Karlo installed locally with no network dependency at runtime

Early hardware validation is mandatory for:

- converter quality from HDMI to CRT
- supported 480i timings
- whether fullscreen transitions into and out of MAME cause visible flashing
- whether preview video playback behaves acceptably on the chosen GPU stack

## Technical Risks to Validate Early

- CRT output quality and overscan behavior through the chosen converter
- video preview codec support and playback smoothness inside Tauri on Linux
- focus recovery after MAME exits
- input behavior through the IPAC encoder in both Karlo and MAME
- real cold-boot timing on the chosen hardware

## Milestones

### Milestone 0: Reboot Scaffold

- remove dependency on the old dual-package direction
- create the new Tauri app scaffold
- establish design tokens for the 4:3 CRT layout
- build static mock data so UI work can start immediately
- define configuration and curation schema boundaries early so later milestones do not hardcode cabinet-specific rules

### Milestone 1: Core Cabinet UI

- favorites-first home screen
- game carousel
- large preview panel
- details metadata panel
- keyboard/IPAC navigation model
- overscan-safe calibration screen

### Milestone 2: Library Import

- integrate MAME machine import
- create SQLite schema
- manual ROM scan flow
- fallback behavior for empty favorites
- browse by genre, year, and manufacturer

### Milestone 3: Media and Attract Mode

- wire preview video
- wire artwork
- create media reconciliation tooling
- implement idle attract mode

### Milestone 4: Launch and Return

- launch MAME from the frontend
- preserve frontend state across launch/return
- hidden admin menu
- reboot and shutdown flows

### Milestone 5: Cabinet Deployment

- minimal Linux boot flow
- fullscreen startup
- input smoke tests on cabinet hardware
- cold-boot performance tuning

## Immediate Next Step

With the Milestone 0 scaffold in place, the next implementation step is to:

- formalize the configuration model for MAME paths, ROM roots, media roots, and calibration values
- formalize the curation model that separates imported machines from cabinet-visible library entries
- carry those schema boundaries into the Rust command surface for later integration
