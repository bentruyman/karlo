#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  link,
  mkdir,
  mkdtemp,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  join,
  resolve,
} from "node:path";

const DEFAULT_SOURCE_ROOT = "/Users/bentruyman/Downloads/arcade";
const DEFAULT_OUTPUT_ROOT = join(DEFAULT_SOURCE_ROOT, "karlo-library");
const ROM_DIR_NAME = "MAME 0.201 ROMs (merged)";
const OFFICIAL_MEDIA_ROOT = join("EmuMovies", "data", "Official");
const VIDEO_SNAPS_DIR = join(
  "Video Snaps (HQ)",
  "MAME (Video Snaps)(HQ)(EM 20161025)",
);

type ArtworkSet = {
  key: string;
  archiveName: string;
  outputDir: string;
};

type CopyStats = {
  linked: number;
  existing: number;
  missing: number;
};

type ExtractStats = {
  extracted: number;
  existing: number;
  missing: number;
};

type ExtractResult = {
  ok: boolean;
  stderr: string;
};

type Args = {
  sourceRoot: string;
  outputRoot: string;
  categoryIni: string | null;
  dryRun: boolean;
};

const ARTWORK_SETS: ArtworkSet[] = [
  {
    key: "title",
    archiveName: "MAME (Title Snaps)(MAME .201)",
    outputDir: "title",
  },
  {
    key: "preview",
    archiveName: "MAME (Artwork Previews)(MAME .201)",
    outputDir: "preview",
  },
  {
    key: "marquee",
    archiveName: "MAME (Marquees)(MAME .201)",
    outputDir: "marquee",
  },
  {
    key: "cabinet",
    archiveName: "MAME (Cabinets)(MAME .201)",
    outputDir: "cabinet",
  },
  {
    key: "flyer",
    archiveName: "MAME (Flyers)(MAME .201)",
    outputDir: "flyer",
  },
];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    categoryIni: null,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--source-root" || arg === "--output-root" || arg === "--category-ini") {
      const value = argv[index + 1];
      if (!value) die(`${arg} requires a path`);
      if (arg === "--source-root") args.sourceRoot = value;
      if (arg === "--output-root") args.outputRoot = value;
      if (arg === "--category-ini") args.categoryIni = value;
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }

    die(`unknown argument: ${arg}`);
  }

  return {
    ...args,
    sourceRoot: resolvePath(args.sourceRoot),
    outputRoot: resolvePath(args.outputRoot),
    categoryIni: args.categoryIni ? resolvePath(args.categoryIni) : null,
  };
}

function printUsage() {
  console.log(`Usage: ops/organize-arcade-library.ts [options]

Stages Karlo ROMs and frontend media from the local arcade download tree.

Options:
  --source-root PATH
  --output-root PATH
  --category-ini PATH
  --dry-run
`);
}

function resolvePath(path: string) {
  if (path === "~") return process.env.HOME ?? path;
  if (path.startsWith("~/")) return resolve(process.env.HOME ?? ".", path.slice(2));
  return resolve(path);
}

function die(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function requireCommand(name: string) {
  const result = spawnSync("sh", ["-c", `command -v ${shellQuote(name)}`], {
    stdio: "ignore",
  });
  if (result.status !== 0) die(`missing required command: ${name}`);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function ensureDir(path: string, dryRun: boolean) {
  if (!dryRun) await mkdir(path, { recursive: true });
}

async function sameFile(left: string, right: string) {
  try {
    const [leftStat, rightStat] = await Promise.all([stat(left), stat(right)]);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

async function hardlinkFile(source: string, target: string, dryRun: boolean) {
  if (await pathExists(target)) {
    if (await sameFile(source, target)) return "existing";
    throw new Error(`refusing to overwrite existing file: ${target}`);
  }

  if (dryRun) return "linked";

  await ensureDir(dirname(target), false);
  await link(source, target);
  return "linked";
}

async function listMachineNames(romRoot: string) {
  if (!(await isDirectory(romRoot))) die(`ROM root not found: ${romRoot}`);
  const entries = await collectGlob("*.zip", romRoot);
  const machineNames = [];
  for (const entry of entries) {
    const path = join(romRoot, entry);
    if (await isFile(path)) machineNames.push(basename(entry, ".zip"));
  }
  return machineNames.sort();
}

function archiveSortKey(path: string): [number, number, string] {
  const name = basename(path);
  const match = name.match(/\.part0*(\d+)\.rar$/i);
  if (match) return [1, Number(match[1]), name];
  if (extname(name).toLowerCase() === ".zip") return [0, 0, name];
  return [2, 0, name];
}

async function artworkArchives(artworkRoot: string, archiveName: string) {
  const zipArchives = await collectGlob(`${archiveName}.zip`, artworkRoot);
  const rarArchives = await collectGlob(`${archiveName}.part*.rar`, artworkRoot);
  const archives = [];
  for (const entry of [...zipArchives, ...rarArchives]) {
    const path = join(artworkRoot, entry);
    if (await isFile(path)) archives.push(path);
  }
  return archives.sort((left, right) => {
    const leftKey = archiveSortKey(left);
    const rightKey = archiveSortKey(right);
    return (
      leftKey[0] - rightKey[0] ||
      leftKey[1] - rightKey[1] ||
      leftKey[2].localeCompare(rightKey[2])
    );
  });
}

async function collectGlob(pattern: string, cwd: string) {
  const entries = [];
  for await (const entry of new Bun.Glob(pattern).scan(cwd)) {
    entries.push(entry);
  }
  return entries;
}

function isBenignBsdtarWarning(stderr: string) {
  return (
    stderr.includes("Too small block encountered") ||
    stderr.includes("Truncated input file")
  );
}

function runBsdtar(args: string[]) {
  return spawnSync("bsdtar", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 200,
  });
}

function archiveEntries(archive: string) {
  const result = runBsdtar(["-tf", archive]);
  const stderr = result.stderr.trim();
  if ((result.status ?? 0) !== 0 && !isBenignBsdtarWarning(stderr)) {
    throw new Error(`could not list ${archive}: ${stderr}`);
  }
  return result.stdout
    .split("\n")
    .filter((line) => line.length > 0 && !line.endsWith("/"));
}

function artworkMemberName(entry: string): [string, string] | null {
  const filename = basename(entry);
  const suffix = extname(filename).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(suffix)) return null;
  return [basename(filename, suffix), suffix];
}

function extractBatch(
  archive: string,
  entries: string[],
  tempDir: string,
): ExtractResult {
  const result = runBsdtar(["-xf", archive, "-C", tempDir, ...entries]);
  const stderr = result.stderr.trim();
  if ((result.status ?? 0) !== 0 && !isBenignBsdtarWarning(stderr)) {
    return { ok: false, stderr };
  }
  return { ok: true, stderr };
}

async function stageExtractedFile(
  entry: string,
  target: string,
  tempDir: string,
) {
  const extracted = join(tempDir, entry);
  if (!(await isFile(extracted))) return false;
  await ensureDir(dirname(target), false);
  if (await pathExists(target)) return true;
  await rename(extracted, target);
  return true;
}

function emptyCopyStats(): CopyStats {
  return { linked: 0, existing: 0, missing: 0 };
}

function emptyExtractStats(): ExtractStats {
  return { extracted: 0, existing: 0, missing: 0 };
}

async function stageRoms(
  machineNames: string[],
  romRoot: string,
  outputRoot: string,
  dryRun: boolean,
) {
  const stats = emptyCopyStats();
  const targetRoot = join(outputRoot, "roms", "mame");
  await ensureDir(targetRoot, dryRun);

  for (const machineName of machineNames) {
    const source = join(romRoot, `${machineName}.zip`);
    const target = join(targetRoot, `${machineName}.zip`);
    const result = await hardlinkFile(source, target, dryRun);
    if (result === "linked") stats.linked += 1;
    else stats.existing += 1;
  }

  return stats;
}

async function stageVideos(
  machineNames: string[],
  videoRoot: string,
  outputRoot: string,
  dryRun: boolean,
): Promise<[CopyStats, Set<string>]> {
  const stats = emptyCopyStats();
  const staged = new Set<string>();
  const targetRoot = join(outputRoot, "media", "mame", "videos");
  await ensureDir(targetRoot, dryRun);

  for (const machineName of machineNames) {
    const source = join(videoRoot, `${machineName}.mp4`);
    if (!(await isFile(source))) {
      stats.missing += 1;
      continue;
    }

    const target = join(targetRoot, `${machineName}.mp4`);
    const result = await hardlinkFile(source, target, dryRun);
    staged.add(machineName);
    if (result === "linked") stats.linked += 1;
    else stats.existing += 1;
  }

  return [stats, staged];
}

async function withTempDir<T>(fn: (tempDir: string) => Promise<T>) {
  const tempDir = await mkdtemp(join(tmpdir(), "karlo-artwork-"));
  try {
    return await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function stageArtworkSet(
  machineNames: Set<string>,
  artworkRoot: string,
  outputRoot: string,
  artworkSet: ArtworkSet,
  dryRun: boolean,
): Promise<[ExtractStats, Set<string>]> {
  const stats = emptyExtractStats();
  const staged = new Set<string>();
  const targetRoot = join(
    outputRoot,
    "media",
    "mame",
    "artwork",
    artworkSet.outputDir,
  );
  await ensureDir(targetRoot, dryRun);

  const archives = await artworkArchives(artworkRoot, artworkSet.archiveName);
  if (archives.length === 0) die(`no archives found for artwork set: ${artworkSet.archiveName}`);

  for (const archive of archives) {
    const pending: Array<[string, string, string, string]> = [];

    for (const entry of archiveEntries(archive)) {
      const member = artworkMemberName(entry);
      if (member === null) continue;
      const [machineName, suffix] = member;
      if (!machineNames.has(machineName) || staged.has(machineName)) continue;

      const target = join(targetRoot, `${machineName}${suffix}`);
      if (await pathExists(target)) {
        staged.add(machineName);
        stats.existing += 1;
        continue;
      }
      pending.push([entry, machineName, target, suffix]);
    }

    if (dryRun) {
      stats.extracted += pending.length;
      for (const [, machineName] of pending) staged.add(machineName);
      continue;
    }

    for (let batchStart = 0; batchStart < pending.length; batchStart += 150) {
      const batch = pending.slice(batchStart, batchStart + 150);
      await withTempDir(async (tempDir) => {
        const extractResult = extractBatch(
          archive,
          batch.map(([entry]) => entry),
          tempDir,
        );

        if (!extractResult.ok && batch.length > 1) {
          for (const [entry, machineName, target] of batch) {
            await withTempDir(async (singleTempDir) => {
              const singleResult = extractBatch(archive, [entry], singleTempDir);
              if (!singleResult.ok) {
                console.error(
                  `warning: skipped ${entry} from ${basename(archive)}: ${singleResult.stderr}`,
                );
                return;
              }
              if (await stageExtractedFile(entry, target, singleTempDir)) {
                staged.add(machineName);
                stats.extracted += 1;
              }
            });
          }
          return;
        }

        if (!extractResult.ok) {
          const entry = batch[0]?.[0] ?? "";
          console.error(
            `warning: skipped ${entry} from ${basename(archive)}: ${extractResult.stderr}`,
          );
          return;
        }

        for (const [entry, machineName, target] of batch) {
          if (await stageExtractedFile(entry, target, tempDir)) {
            staged.add(machineName);
            stats.extracted += 1;
          }
        }
      });
    }
  }

  stats.missing += machineNames.size - staged.size;
  return [stats, staged];
}

function buildInventory(
  machineNames: string[],
  videoNames: Set<string>,
  artworkNames: Record<string, Set<string>>,
) {
  return machineNames.map((machineName) => ({
    machineName,
    rom: `roms/mame/${machineName}.zip`,
    video: videoNames.has(machineName)
      ? `media/mame/videos/${machineName}.mp4`
      : null,
    artwork: Object.fromEntries(
      Object.entries(artworkNames).map(([key, names]) => [
        key,
        names.has(machineName)
          ? `media/mame/artwork/${key}/${machineName}.png`
          : null,
      ]),
    ),
  }));
}

async function stageCategoryIni(
  categoryIni: string | null,
  outputRoot: string,
  dryRun: boolean,
) {
  if (categoryIni === null) return null;
  if (!(await isFile(categoryIni))) die(`category INI not found: ${categoryIni}`);

  const target = join(outputRoot, "metadata", "Category.ini");
  if (!dryRun) {
    await ensureDir(dirname(target), false);
    await copyFile(categoryIni, target, fsConstants.COPYFILE_FICLONE);
  }
  return "metadata/Category.ini";
}

async function writeManifest(options: {
  outputRoot: string;
  sourceRoot: string;
  categoryIniPath: string | null;
  machineNames: string[];
  romStats: CopyStats;
  videoStats: CopyStats;
  artworkStats: Record<string, ExtractStats>;
  videoNames: Set<string>;
  artworkNames: Record<string, Set<string>>;
  dryRun: boolean;
}) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceRoot: options.sourceRoot,
    outputRoot: options.outputRoot,
    categoryIni: options.categoryIniPath,
    machineCount: options.machineNames.length,
    counts: {
      roms: options.romStats,
      videos: options.videoStats,
      artwork: options.artworkStats,
    },
    inventory: buildInventory(
      options.machineNames,
      options.videoNames,
      options.artworkNames,
    ),
  };

  if (options.dryRun) {
    const { inventory: _inventory, ...summary } = manifest;
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const manifestPath = join(options.outputRoot, "manifests", "inventory.json");
  await ensureDir(dirname(manifestPath), false);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function printStats(name: string, stats: CopyStats | ExtractStats) {
  const summary = Object.entries(stats)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  console.log(`${name}: ${summary}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const romRoot = join(args.sourceRoot, ROM_DIR_NAME);
  const officialRoot = join(args.sourceRoot, OFFICIAL_MEDIA_ROOT);
  const videoRoot = join(officialRoot, VIDEO_SNAPS_DIR);
  const artworkRoot = join(officialRoot, "Artwork", "MAME");

  requireCommand("bsdtar");

  if (!(await isDirectory(args.sourceRoot))) die(`source root not found: ${args.sourceRoot}`);
  if (!(await isDirectory(videoRoot))) die(`video snap root not found: ${videoRoot}`);
  if (!(await isDirectory(artworkRoot))) die(`artwork root not found: ${artworkRoot}`);

  const machineNames = await listMachineNames(romRoot);
  const machineNameSet = new Set(machineNames);
  const categoryIniPath = await stageCategoryIni(
    args.categoryIni,
    args.outputRoot,
    args.dryRun,
  );
  console.log(`machines: ${machineNames.length}`);
  console.log(`output: ${args.outputRoot}`);
  if (categoryIniPath !== null) console.log(`category INI: ${categoryIniPath}`);
  if (args.dryRun) console.log("dry run: no files will be written");

  const romStats = await stageRoms(
    machineNames,
    romRoot,
    args.outputRoot,
    args.dryRun,
  );
  printStats("roms", romStats);

  const [videoStats, videoNames] = await stageVideos(
    machineNames,
    videoRoot,
    args.outputRoot,
    args.dryRun,
  );
  printStats("videos", videoStats);

  const allArtworkStats: Record<string, ExtractStats> = {};
  const allArtworkNames: Record<string, Set<string>> = {};
  for (const artworkSet of ARTWORK_SETS) {
    const [stats, staged] = await stageArtworkSet(
      machineNameSet,
      artworkRoot,
      args.outputRoot,
      artworkSet,
      args.dryRun,
    );
    allArtworkStats[artworkSet.key] = stats;
    allArtworkNames[artworkSet.key] = staged;
    printStats(`artwork.${artworkSet.key}`, stats);
  }

  await writeManifest({
    outputRoot: args.outputRoot,
    sourceRoot: args.sourceRoot,
    categoryIniPath,
    machineNames,
    romStats,
    videoStats,
    artworkStats: allArtworkStats,
    videoNames,
    artworkNames: allArtworkNames,
    dryRun: args.dryRun,
  });
  if (!args.dryRun) {
    console.log(`manifest: ${join(args.outputRoot, "manifests", "inventory.json")}`);
  }
}

await main();
