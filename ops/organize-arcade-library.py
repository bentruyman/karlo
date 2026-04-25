#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_SOURCE_ROOT = Path("/Users/bentruyman/Downloads/arcade")
DEFAULT_OUTPUT_ROOT = DEFAULT_SOURCE_ROOT / "karlo-library"
ROM_DIR_NAME = "MAME 0.201 ROMs (merged)"
OFFICIAL_MEDIA_ROOT = Path("EmuMovies/data/Official")
VIDEO_SNAPS_DIR = Path("Video Snaps (HQ)/MAME (Video Snaps)(HQ)(EM 20161025)")


@dataclass(frozen=True)
class ArtworkSet:
    key: str
    archive_name: str
    output_dir: str


ARTWORK_SETS = (
    ArtworkSet("title", "MAME (Title Snaps)(MAME .201)", "title"),
    ArtworkSet("preview", "MAME (Artwork Previews)(MAME .201)", "preview"),
    ArtworkSet("marquee", "MAME (Marquees)(MAME .201)", "marquee"),
    ArtworkSet("cabinet", "MAME (Cabinets)(MAME .201)", "cabinet"),
    ArtworkSet("flyer", "MAME (Flyers)(MAME .201)", "flyer"),
)


@dataclass
class CopyStats:
    linked: int = 0
    existing: int = 0
    missing: int = 0


@dataclass
class ExtractStats:
    extracted: int = 0
    existing: int = 0
    missing: int = 0


@dataclass(frozen=True)
class ExtractResult:
    ok: bool
    stderr: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Stage Karlo ROMs and frontend media from the local arcade download tree.",
    )
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned work and write nothing.",
    )
    return parser.parse_args()


def die(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_command(name: str) -> None:
    if shutil.which(name) is None:
        die(f"missing required command: {name}")


def ensure_dir(path: Path, dry_run: bool) -> None:
    if dry_run:
        return
    path.mkdir(parents=True, exist_ok=True)


def same_file(left: Path, right: Path) -> bool:
    try:
        return left.samefile(right)
    except FileNotFoundError:
        return False


def hardlink_file(source: Path, target: Path, dry_run: bool) -> str:
    if target.exists():
        if same_file(source, target):
            return "existing"
        raise RuntimeError(f"refusing to overwrite existing file: {target}")

    if dry_run:
        return "linked"

    ensure_dir(target.parent, dry_run=False)
    os.link(source, target)
    return "linked"


def list_machine_names(rom_root: Path) -> list[str]:
    if not rom_root.is_dir():
        die(f"ROM root not found: {rom_root}")
    return sorted(path.stem for path in rom_root.glob("*.zip") if path.is_file())


def archive_sort_key(path: Path) -> tuple[int, int, str]:
    match = re.search(r"\.part0*(\d+)\.rar$", path.name, flags=re.IGNORECASE)
    if match:
        return (1, int(match.group(1)), path.name)
    if path.suffix.lower() == ".zip":
        return (0, 0, path.name)
    return (2, 0, path.name)


def artwork_archives(artwork_root: Path, archive_name: str) -> list[Path]:
    archives = list(artwork_root.glob(f"{archive_name}.zip"))
    archives.extend(artwork_root.glob(f"{archive_name}.part*.rar"))
    return sorted((path for path in archives if path.is_file()), key=archive_sort_key)


def archive_entries(archive: Path) -> list[str]:
    result = subprocess.run(
        ["bsdtar", "-tf", str(archive)],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 and not is_benign_bsdtar_warning(result.stderr):
        raise RuntimeError(f"could not list {archive}: {result.stderr.strip()}")
    return [line for line in result.stdout.splitlines() if line and not line.endswith("/")]


def is_benign_bsdtar_warning(stderr: str) -> bool:
    return (
        "Too small block encountered" in stderr
        or "Truncated input file" in stderr
    )


def artwork_member_name(entry: str) -> tuple[str, str] | None:
    filename = Path(entry).name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg"}:
        return None
    return Path(filename).stem, suffix


def extract_batch(archive: Path, entries: list[str], temp_dir: Path) -> ExtractResult:
    result = subprocess.run(
        ["bsdtar", "-xf", str(archive), "-C", str(temp_dir), *entries],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 and not is_benign_bsdtar_warning(result.stderr):
        return ExtractResult(False, result.stderr.strip())
    return ExtractResult(True, result.stderr.strip())


def stage_extracted_file(entry: str, machine_name: str, target: Path, temp_dir: Path) -> bool:
    extracted = temp_dir / entry
    if not extracted.is_file():
        return False
    ensure_dir(target.parent, dry_run=False)
    if target.exists():
        return True
    shutil.move(str(extracted), target)
    return True


def stage_roms(machine_names: list[str], rom_root: Path, output_root: Path, dry_run: bool) -> CopyStats:
    stats = CopyStats()
    target_root = output_root / "roms/mame"
    ensure_dir(target_root, dry_run)

    for machine_name in machine_names:
        source = rom_root / f"{machine_name}.zip"
        target = target_root / source.name
        result = hardlink_file(source, target, dry_run)
        if result == "linked":
            stats.linked += 1
        else:
            stats.existing += 1

    return stats


def stage_videos(
    machine_names: list[str],
    video_root: Path,
    output_root: Path,
    dry_run: bool,
) -> tuple[CopyStats, set[str]]:
    stats = CopyStats()
    staged = set[str]()
    target_root = output_root / "media/mame/videos"
    ensure_dir(target_root, dry_run)

    for machine_name in machine_names:
        source = video_root / f"{machine_name}.mp4"
        if not source.is_file():
            stats.missing += 1
            continue
        target = target_root / source.name
        result = hardlink_file(source, target, dry_run)
        staged.add(machine_name)
        if result == "linked":
            stats.linked += 1
        else:
            stats.existing += 1

    return stats, staged


def stage_artwork_set(
    machine_names: set[str],
    artwork_root: Path,
    output_root: Path,
    artwork_set: ArtworkSet,
    dry_run: bool,
) -> tuple[ExtractStats, set[str]]:
    stats = ExtractStats()
    staged = set[str]()
    target_root = output_root / "media/mame/artwork" / artwork_set.output_dir
    ensure_dir(target_root, dry_run)

    archives = artwork_archives(artwork_root, artwork_set.archive_name)
    if not archives:
        die(f"no archives found for artwork set: {artwork_set.archive_name}")

    for archive in archives:
        pending: list[tuple[str, str, Path, str]] = []

        for entry in archive_entries(archive):
            member = artwork_member_name(entry)
            if member is None:
                continue
            machine_name, suffix = member
            if machine_name not in machine_names or machine_name in staged:
                continue

            target = target_root / f"{machine_name}{suffix}"
            if target.exists():
                staged.add(machine_name)
                stats.existing += 1
                continue
            pending.append((entry, machine_name, target, suffix))

        if dry_run:
            stats.extracted += len(pending)
            staged.update(machine_name for _, machine_name, _, _ in pending)
            continue

        for batch_start in range(0, len(pending), 150):
            batch = pending[batch_start : batch_start + 150]
            with tempfile.TemporaryDirectory(prefix="karlo-artwork-") as temp_name:
                temp_dir = Path(temp_name)
                extract_result = extract_batch(
                    archive,
                    [entry for entry, _, _, _ in batch],
                    temp_dir,
                )
                if not extract_result.ok and len(batch) > 1:
                    for entry, machine_name, target, _ in batch:
                        with tempfile.TemporaryDirectory(prefix="karlo-artwork-") as single_temp_name:
                            single_temp_dir = Path(single_temp_name)
                            single_result = extract_batch(archive, [entry], single_temp_dir)
                            if not single_result.ok:
                                print(
                                    f"warning: skipped {entry} from {archive.name}: {single_result.stderr}",
                                    file=sys.stderr,
                                )
                                continue
                            if stage_extracted_file(entry, machine_name, target, single_temp_dir):
                                staged.add(machine_name)
                                stats.extracted += 1
                    continue
                if not extract_result.ok:
                    entry = batch[0][0]
                    print(
                        f"warning: skipped {entry} from {archive.name}: {extract_result.stderr}",
                        file=sys.stderr,
                    )
                    continue

                for entry, machine_name, target, _ in batch:
                    if stage_extracted_file(entry, machine_name, target, temp_dir):
                        staged.add(machine_name)
                        stats.extracted += 1

    stats.missing += len(machine_names - staged)
    return stats, staged


def build_inventory(
    machine_names: list[str],
    video_names: set[str],
    artwork_names: dict[str, set[str]],
) -> list[dict[str, object]]:
    inventory = []
    for machine_name in machine_names:
        inventory.append(
            {
                "machineName": machine_name,
                "rom": f"roms/mame/{machine_name}.zip",
                "video": f"media/mame/videos/{machine_name}.mp4"
                if machine_name in video_names
                else None,
                "artwork": {
                    key: f"media/mame/artwork/{key}/{machine_name}.png"
                    if machine_name in names
                    else None
                    for key, names in artwork_names.items()
                },
            },
        )
    return inventory


def write_manifest(
    output_root: Path,
    source_root: Path,
    machine_names: list[str],
    rom_stats: CopyStats,
    video_stats: CopyStats,
    artwork_stats: dict[str, ExtractStats],
    video_names: set[str],
    artwork_names: dict[str, set[str]],
    dry_run: bool,
) -> None:
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceRoot": str(source_root),
        "outputRoot": str(output_root),
        "machineCount": len(machine_names),
        "counts": {
            "roms": vars(rom_stats),
            "videos": vars(video_stats),
            "artwork": {key: vars(value) for key, value in artwork_stats.items()},
        },
        "inventory": build_inventory(machine_names, video_names, artwork_names),
    }

    if dry_run:
        print(json.dumps({key: manifest[key] for key in manifest if key != "inventory"}, indent=2))
        return

    manifest_path = output_root / "manifests/inventory.json"
    ensure_dir(manifest_path.parent, dry_run=False)
    with manifest_path.open("w", encoding="utf-8") as file:
        json.dump(manifest, file, indent=2)
        file.write("\n")


def print_stats(name: str, stats: CopyStats | ExtractStats) -> None:
    values = vars(stats)
    summary = ", ".join(f"{key}={value}" for key, value in values.items())
    print(f"{name}: {summary}")


def main() -> None:
    args = parse_args()
    source_root = args.source_root.expanduser().resolve()
    output_root = args.output_root.expanduser().resolve()
    rom_root = source_root / ROM_DIR_NAME
    official_root = source_root / OFFICIAL_MEDIA_ROOT
    video_root = official_root / VIDEO_SNAPS_DIR
    artwork_root = official_root / "Artwork/MAME"

    require_command("bsdtar")

    if not source_root.is_dir():
        die(f"source root not found: {source_root}")
    if not video_root.is_dir():
        die(f"video snap root not found: {video_root}")
    if not artwork_root.is_dir():
        die(f"artwork root not found: {artwork_root}")

    machine_names = list_machine_names(rom_root)
    machine_name_set = set(machine_names)
    print(f"machines: {len(machine_names)}")
    print(f"output: {output_root}")
    if args.dry_run:
        print("dry run: no files will be written")

    rom_stats = stage_roms(machine_names, rom_root, output_root, args.dry_run)
    print_stats("roms", rom_stats)

    video_stats, video_names = stage_videos(machine_names, video_root, output_root, args.dry_run)
    print_stats("videos", video_stats)

    all_artwork_stats: dict[str, ExtractStats] = {}
    all_artwork_names: dict[str, set[str]] = {}
    for artwork_set in ARTWORK_SETS:
        stats, staged = stage_artwork_set(
            machine_name_set,
            artwork_root,
            output_root,
            artwork_set,
            args.dry_run,
        )
        all_artwork_stats[artwork_set.key] = stats
        all_artwork_names[artwork_set.key] = staged
        print_stats(f"artwork.{artwork_set.key}", stats)

    write_manifest(
        output_root,
        source_root,
        machine_names,
        rom_stats,
        video_stats,
        all_artwork_stats,
        video_names,
        all_artwork_names,
        args.dry_run,
    )
    if not args.dry_run:
        print(f"manifest: {output_root / 'manifests/inventory.json'}")


if __name__ == "__main__":
    main()
