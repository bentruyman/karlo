# Library

The arcade library lives on the Synology NAS, shared as the `arcade` volume
and mounted on the Mac at `/Volumes/arcade`. All `ops/` tools assume that
mount exists.

```text
/Volumes/arcade/
  MAME 0.201 ROMs (merged)/       12k+ <machine>.zip, the ROM source of truth
  mame.dat                        MAME -listxml dump, read by curate
  EmuMovies/data/Official/        FTP mirror written by download:library
    Video Snaps (HQ)/MAME */      <machine>.mp4 (EmuMovies splits MAME into
                                  Arcade / Casino / Handheld dirs)
    Artwork/MAME/                 bulk pack archives (.zip / .partNN.rar)
  karlo-library/                  staged output of organize:library
```

## Mounting the NAS

```sh
bun run mount:library    # NFS mount at /Volumes/arcade; prompts for sudo
```

Idempotent; replaces an existing AFP/SMB mount of the same volume. Remote
defaults to `data0.local:/volume1/arcade`, override with
`KARLO_LIBRARY_NFS_REMOTE`.

Why NFS: AFP and SMB mounts on macOS do **not** support hard links, so
`organize:library` falls back to copying — every byte goes NAS → Mac → NAS.
NFS hardlinks make organize near-instant. The download tool doesn't care —
its bottleneck is the EmuMovies FTP, not the mount.

One-time Synology setup (already done): Control Panel → File Services → NFS →
enable; shared folder `arcade` → Edit → NFS Permissions → add the client IPs
(this Mac and the cabinet) with **Squash: "Map all users to admin"** — without
the squash setting the mount succeeds but every access is Permission denied
(export root shows as mode 000). Check exports with
`showmount -e data0.local`. The old manual method was
Finder → `afp://data0._afpovertcp._tcp.local`.

## Pipeline

```sh
bun run download:library   # EmuMovies FTP -> NAS mirror (videos + artwork packs)
bun run organize:library   # NAS mirror -> /Volumes/arcade/karlo-library
bun run curate:library     # karlo-library -> karlo-library-curated (needs mame.dat)
bun run sync:library       # curated library -> cabinet over rsync/SSH
```

Every tool takes `--dry-run` and `-h`.

### download:library (`ops/download-arcade-assets.ts`)

Downloads only MAME assets, and video snaps only for machines that have a ROM
zip. Artwork packs (Title Snaps, Artwork Preview, Cabinets, Flyers) come as
bulk archives and are downloaded whole; marquees are deliberately skipped
(the app never displays them). Idempotent: same-size files are skipped,
partial downloads resume, so cancel/rerun freely. `--limit N` and
`--only videos|artwork` scope verification runs; `--parallel N` (default 2)
tunes concurrency.

Credentials: copy `ops/emumovies.env.example` to `ops/emumovies.env` (gitignored)
and fill in the EmuMovies **file server** credentials from the account page —
the FTP password is not the forum password.

Server quirks discovered the hard way: the FTP is a Microsoft FTP Service that
emits unix- or DOS-style listings depending on the session (both are parsed),
pack archive names change between releases (matched by prefix, newest version
wins), and the MAME video snaps are split across three directories (searched
in order).

### organize / curate / sync

`organize:library` stages `roms/mame/`, `media/mame/videos/`, and
`media/mame/artwork/<set>/` into `karlo-library` by hardlink (or copy, see
above). `curate:library` filters that to cabinet-worthy machines using
`mame.dat` and writes `karlo-library-curated`. `sync:library` rsyncs the
curated tree to the cabinet configured in `ops/cabinet.env` (see
[cabinet.md](cabinet.md)).
