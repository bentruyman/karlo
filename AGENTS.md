# Repository Guidelines

## Project Structure & Module Organization

Karlo is a Tauri desktop app with a React/TypeScript frontend and Rust backend.

- `src/`: React UI; shared application logic lives in `src/app/`, with tests beside the modules they cover.
- `src/assets/`: bundled fonts and other frontend assets.
- `src-tauri/src/`: Tauri commands, SQLite storage, MAME launching/import, and media serving.
- `ops/`: Bun and shell tools for library curation, organization, synchronization, and cabinet deployment.
- `deploy/linux/`: cabinet installation scripts and systemd units.
- `docs/`: architecture and cabinet operating guides.

## Build, Test, and Development Commands

- `bun install --frozen-lockfile`: install the pinned Bun dependencies.
- `bun run dev`: start Vite on port 1420 with mock browser data.
- `bun run tauri:dev`: run the complete desktop app against local SQLite state.
- `bun test`: run TypeScript tests with Bun.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust unit tests.
- `bun run build`: type-check TypeScript and build the frontend.
- `bun run tauri:build`: produce the desktop bundle.

Run the two test commands and `bun run build` before opening a pull request.

## Verifying UI Changes in a Browser

After a visible UI change, verify it yourself with the `agent-browser` skill against the Vite dev server (mock data) instead of asking for a manual check. Things to know:

- A dev server may already be serving this worktree with HMR — check with `ps ax | grep vite` whether one is running from this directory before starting your own. Vite defaults to port 1420 but falls back to the next free port, so don't assume the URL: read it from the dev server's startup output.
- The app idles into an attract-mode screensaver (bouncing K logo, black screen) after the configured timeout. If a screenshot comes back black, press an arrow key (`agent-browser press ArrowDown`) to wake it — unmapped keys like Escape are ignored (see `HANDLED_KEYS` in `src/App.tsx`).
- The UI is keyboard-driven like a cabinet: arrows to move, Enter/Z to launch, X to favorite, C/V to switch browse mode. Drive it with `agent-browser press`, not clicks.
- Layout uses container-query units (`cqh`), so element positions shift with viewport size. Screenshot at the default 1280x720 (use `set viewport 1280 720 2` for retina detail) and crop with `sips` to inspect fine spacing.

## Coding Style & Naming Conventions

Match existing formatting: two-space indentation in TypeScript/TSX and standard `rustfmt` output in Rust. Use `camelCase` for TypeScript functions and variables, `PascalCase` for React components and types, and `snake_case` for Rust functions and modules. Keep Tauri command names aligned across `src-tauri/src/commands.rs` and `src/app/bootstrap.ts`. No TypeScript formatter or linter is configured; rely on `tsc`, nearby code, and `cargo fmt --all`.

## Testing Guidelines

Name frontend tests `*.test.ts` and keep them beside the tested module; Bun's `test` and `expect` APIs are used. Put Rust tests in a local `#[cfg(test)] mod tests`. Add focused regression coverage for changed parsing, navigation, persistence, launch, or media behavior. There is no numeric coverage requirement.

## Commit & Pull Request Guidelines

History follows Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `chore:`, and `build:`. Keep subjects imperative and scoped to one change. Target normal work at `develop`; reserve `main` for releases. Pull requests should explain behavior and motivation, link relevant issues, list verification commands, and include screenshots or video for visible UI changes. Call out cabinet, database, or deployment effects explicitly.

## Security & Configuration

Copy `ops/cabinet.env.example` for local cabinet settings. Never commit credentials, cabinet-specific environment files, ROMs, media, or SQLite databases.
