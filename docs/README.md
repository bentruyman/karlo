# Karlo Docs

Karlo is a MAME front-end for one physical arcade cabinet: a stripped-down
Linux mini PC that auto-logins, boots straight into the front-end, and drives
a 27-inch 1440p LCD. Controls come from an IPAC-style keyboard encoder.
Everything runs offline. Scope is MAME only.

- [Architecture](architecture.md) — app shape, command surface, data, controls
- [Cabinet](cabinet.md) — building, installing, deploying, and operating the machine

## Development

```sh
bun install
bun test                                        # TS unit tests
cargo test --manifest-path src-tauri/Cargo.toml # Rust tests
bun run dev                                     # Vite on :1420, mock data
bun run tauri:dev                               # full app against real SQLite
```

`bun run dev` works in a plain browser — the frontend falls back to mock data
when Tauri commands are unavailable. See [Architecture](architecture.md).

## Not built yet

- input test, reboot, and shutdown actions in the service menu ([#27](https://github.com/bentruyman/karlo/issues/27))
- LCD and IPAC input validation on real hardware ([#29](https://github.com/bentruyman/karlo/issues/29))
