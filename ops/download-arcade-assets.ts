#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { collectGlob, die, ensureDir, isDirectory, isFile, resolvePath } from "./lib";

const DEFAULT_DEST_ROOT = "/Volumes/arcade";
const ROM_DIR_NAME = "MAME 0.201 ROMs (merged)";
const DEFAULT_HOST = "files.emumovies.com";
const VIDEO_SNAPS_PARENT = "Video Snaps (HQ)";
// Full archive-name prefixes; "(Artwork Preview" is unclosed on purpose so it
// matches both the old plural and the current singular pack name. Marquees are
// intentionally absent — the app only shows artwork as a video fallback and
// never gets past title/preview snaps.
const ARTWORK_PACKS = [
  "MAME (Title Snaps)",
  "MAME (Artwork Preview",
  "MAME (Cabinets)",
  "MAME (Flyers)",
];

export type FtpEntry = {
  name: string;
  size: number;
  isDir: boolean;
};

export type ArchiveGroup = {
  base: string;
  parts: string[];
};

export type DownloadPlan = {
  download: Array<{ name: string; size: number }>;
  skipped: number;
  missingRemote: string[];
};

type Args = {
  destRoot: string;
  romDir: string | null;
  only: "videos" | "artwork" | null;
  limit: number | null;
  parallel: number;
  dryRun: boolean;
};

const UNIX_LIST_LINE =
  /^([-dl])[rwxsStT-]{9}[+.@]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S{3}\s+\d{1,2}\s+[\d:]{4,5}\s+(.+)$/;
// The EmuMovies server (Microsoft FTP) serves either style depending on the
// session, so both parsers are required.
const DOS_LIST_LINE = /^\d{2}-\d{2}-\d{2,4}\s+\d{2}:\d{2}(?:AM|PM)?\s+(<DIR>|\d+)\s+(.+)$/i;

export function parseFtpListing(text: string): FtpEntry[] {
  const entries: FtpEntry[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim().length === 0 || line.startsWith("total ")) continue;

    const unix = line.match(UNIX_LIST_LINE);
    if (unix) {
      const [, type, size, name] = unix;
      if (type === "l") continue;
      entries.push({ name, size: Number(size), isDir: type === "d" });
      continue;
    }

    const dos = line.match(DOS_LIST_LINE);
    if (dos) {
      const [, sizeField, name] = dos;
      const isDir = sizeField.toUpperCase() === "<DIR>";
      entries.push({ name, size: isDir ? 0 : Number(sizeField), isDir });
    }
  }
  return entries;
}

export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function ftpUrl(host: string, segments: string[], trailingSlash = false) {
  const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
  return `ftp://${host}/${path}${trailingSlash ? "/" : ""}`;
}

export function findMameDirs(entries: FtpEntry[]) {
  return entries
    .filter((entry) => entry.isDir && entry.name.startsWith("MAME"))
    .map((entry) => entry.name)
    .sort();
}

export function groupArtworkArchives(
  names: string[],
  prefix: string,
): ArchiveGroup | null {
  const groups = new Map<string, Array<{ name: string; part: number }>>();

  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const partMatch = name.match(/^(.*)\.part0*(\d+)\.rar$/i);
    let base: string;
    let part: number;
    if (partMatch) {
      base = partMatch[1];
      part = Number(partMatch[2]);
    } else if (/\.(zip|rar)$/i.test(name)) {
      base = name.replace(/\.(zip|rar)$/i, "");
      part = 0;
    } else {
      continue;
    }
    const group = groups.get(base) ?? [];
    group.push({ name, part });
    groups.set(base, group);
  }

  // ponytail: newest version = lexicographically-last base; good enough for
  // EmuMovies' "(MAME .NNN)" suffixes, revisit if they change naming.
  const base = [...groups.keys()].sort().at(-1);
  if (base === undefined) return null;
  const parts = groups
    .get(base)!
    .sort((left, right) => left.part - right.part || left.name.localeCompare(right.name))
    .map((entry) => entry.name);
  return { base, parts };
}

export function planDownloads(
  remoteSizes: Map<string, number>,
  wantedNames: string[],
  localSizes: Map<string, number>,
): DownloadPlan {
  const plan: DownloadPlan = { download: [], skipped: 0, missingRemote: [] };
  for (const name of wantedNames) {
    const remoteSize = remoteSizes.get(name);
    if (remoteSize === undefined) {
      plan.missingRemote.push(name);
      continue;
    }
    if (localSizes.get(name) === remoteSize) {
      plan.skipped += 1;
      continue;
    }
    plan.download.push({ name, size: remoteSize });
  }
  return plan;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    destRoot: DEFAULT_DEST_ROOT,
    romDir: null,
    only: null,
    limit: null,
    parallel: 2,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (
      arg === "--dest-root" ||
      arg === "--rom-dir" ||
      arg === "--only" ||
      arg === "--limit" ||
      arg === "--parallel"
    ) {
      const value = argv[index + 1];
      if (!value) die(`${arg} requires a value`);
      if (arg === "--dest-root") args.destRoot = value;
      if (arg === "--rom-dir") args.romDir = value;
      if (arg === "--only") {
        if (value !== "videos" && value !== "artwork") die("--only expects videos or artwork");
        args.only = value;
      }
      if (arg === "--limit") {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit < 1) die("--limit expects a positive integer");
        args.limit = limit;
      }
      if (arg === "--parallel") {
        const parallel = Number(value);
        // ponytail: cap 8; EmuMovies limits subscriber connections anyway.
        if (!Number.isInteger(parallel) || parallel < 1 || parallel > 8) {
          die("--parallel expects an integer from 1 to 8");
        }
        args.parallel = parallel;
      }
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
    destRoot: resolvePath(args.destRoot),
    romDir: args.romDir ? resolvePath(args.romDir) : null,
  };
}

function printUsage() {
  console.log(`Usage: ops/download-arcade-assets.ts [options]

Downloads MAME video snaps and artwork packs from the EmuMovies subscriber FTP
into <dest-root>/EmuMovies/data/Official/, fetching video snaps only for
machines present in the local ROM directory.

Credentials come from ops/emumovies.env (see ops/emumovies.env.example) or the
EMUMOVIES_USER / EMUMOVIES_PASSWORD environment variables.

Options:
  --dest-root PATH   default ${DEFAULT_DEST_ROOT}
  --rom-dir PATH     default <dest-root>/${ROM_DIR_NAME}
  --only videos|artwork
  --limit N          stop after N downloads (for verification runs)
  --parallel N       concurrent transfers, 1-8 (default 2)
  --dry-run          list remote state and print the plan, download nothing
`);
}

async function loadCredentials() {
  const envFile = process.env.EMUMOVIES_ENV_FILE ?? join(import.meta.dir, "emumovies.env");
  const fromFile = (await isFile(envFile))
    ? parseEnvFile(await readFile(envFile, "utf8"))
    : {};
  const get = (key: string) => process.env[key] ?? fromFile[key];

  const user = get("EMUMOVIES_USER");
  const password = get("EMUMOVIES_PASSWORD");
  if (!user || !password) {
    die(`set EMUMOVIES_USER and EMUMOVIES_PASSWORD in ${envFile} (see ops/emumovies.env.example)`);
  }
  return { host: get("EMUMOVIES_HOST") || DEFAULT_HOST, user, password };
}

function curlConfigEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

// Credentials go to curl via a stdin config file so they never appear in ps.
function curlConfig(user: string, password: string) {
  return `user = "${curlConfigEscape(`${user}:${password}`)}"\n`;
}

// One curl invocation per batch reuses connections across files instead of
// paying TCP+TLS+login per transfer.
export function batchCurlConfig(
  credentials: string,
  items: Array<{ url: string; output: string }>,
) {
  const lines = [credentials.trimEnd()];
  for (const item of items) {
    lines.push(`url = "${curlConfigEscape(item.url)}"`);
    lines.push(`output = "${curlConfigEscape(item.output)}"`);
  }
  return `${lines.join("\n")}\n`;
}

// The server supports FTPS with a valid certificate, so require it. nocwd
// fetches with one full-path RETR instead of a CWD walk per file.
const CURL_BASE_ARGS = [
  "--ssl-reqd",
  "--ftp-method",
  "nocwd",
  "--connect-timeout",
  "30",
  "-K",
  "-",
];
const BATCH_SIZE = 64;

function listRemoteDir(host: string, segments: string[], curlCfg: string): FtpEntry[] {
  const url = ftpUrl(host, segments, true);
  const result = spawnSync("curl", ["-sS", ...CURL_BASE_ARGS, url], {
    input: curlCfg,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    die(`FTP listing failed for ${url}: ${result.stderr.trim()}`);
  }
  const entries = parseFtpListing(result.stdout);
  if (entries.length === 0) {
    die(`FTP listing for ${url} parsed to zero entries; raw output:\n${result.stdout.slice(0, 2000)}`);
  }
  return entries;
}

async function fileSize(path: string) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function localSizesFor(directory: string, pattern: string) {
  const sizes = new Map<string, number>();
  if (!(await isDirectory(directory))) return sizes;
  for (const entry of await collectGlob(pattern, directory)) {
    const size = await fileSize(join(directory, entry));
    if (size !== null) sizes.set(entry, size);
  }
  return sizes;
}

async function downloadRemoteFile(
  host: string,
  segments: string[],
  target: string,
  remoteSize: number,
  curlCfg: string,
) {
  const url = ftpUrl(host, segments);
  await ensureDir(dirname(target), false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await fileSize(target);
    if (existing === remoteSize) return true;
    if (existing !== null && existing > remoteSize) await rm(target, { force: true });

    const result = spawnSync(
      "curl",
      ["-S", "--progress-bar", ...CURL_BASE_ARGS, "-C", "-", "-o", target, url],
      { input: curlCfg, stdio: ["pipe", "inherit", "inherit"] },
    );

    if ((await fileSize(target)) === remoteSize) return true;
    if (result.status === 33) await rm(target, { force: true }); // server refused resume
    if ((result.status ?? 1) !== 0) {
      console.error(`warning: curl exited ${result.status} for ${url}`);
    }
  }
  // Leave any partial in place; the next run resumes it.
  return false;
}

type SectionStats = {
  downloaded: number;
  skipped: number;
  missingRemote: number;
  failed: number;
  limited: number;
};

function printStats(name: string, stats: SectionStats) {
  const summary = Object.entries(stats)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  console.log(`${name}: ${summary}`);
}

async function listMachineNames(romDir: string) {
  if (!(await isDirectory(romDir))) die(`ROM directory not found: ${romDir}`);
  const entries = await collectGlob("*.zip", romDir);
  return entries.map((entry) => entry.replace(/\.zip$/, "")).sort();
}

async function runSection(options: {
  name: string;
  host: string;
  remoteSegments: string[];
  localDir: string;
  plan: DownloadPlan;
  curlCfg: string;
  dryRun: boolean;
  parallel: number;
  budget: { remaining: number };
}) {
  const stats: SectionStats = {
    downloaded: 0,
    skipped: options.plan.skipped,
    missingRemote: options.plan.missingRemote.length,
    failed: 0,
    limited: 0,
  };

  const queue: DownloadPlan["download"] = [];
  for (const item of options.plan.download) {
    if (options.budget.remaining <= 0) {
      stats.limited += 1;
      continue;
    }
    options.budget.remaining -= 1;
    if (options.dryRun) stats.downloaded += 1;
    else queue.push(item);
  }

  if (queue.length > 0) await ensureDir(options.localDir, false);
  const retry: DownloadPlan["download"] = [];

  for (let start = 0; start < queue.length; start += BATCH_SIZE) {
    const batch = queue.slice(start, start + BATCH_SIZE);
    const items = [];
    for (const item of batch) {
      const target = join(options.localDir, item.name);
      const existing = await fileSize(target);
      if (existing === item.size) {
        stats.downloaded += 1;
        continue;
      }
      if (existing !== null && existing > item.size) await rm(target, { force: true });
      items.push({
        item,
        target,
        url: ftpUrl(options.host, [...options.remoteSegments, item.name]),
      });
    }
    if (items.length === 0) continue;

    console.log(
      `${options.name}: downloading ${items.length} file(s) (${Math.min(start + BATCH_SIZE, queue.length)}/${queue.length})`,
    );
    spawnSync(
      "curl",
      [
        "-S",
        "--progress-bar",
        "--parallel",
        "--parallel-max",
        String(options.parallel),
        "-C",
        "-",
        ...CURL_BASE_ARGS,
      ],
      {
        input: batchCurlConfig(
          options.curlCfg,
          items.map(({ url, target }) => ({ url, output: target })),
        ),
        stdio: ["pipe", "inherit", "inherit"],
      },
    );

    for (const { item, target } of items) {
      if ((await fileSize(target)) === item.size) stats.downloaded += 1;
      else retry.push(item);
    }
  }

  // Stragglers (truncated or refused-resume files) get individual attempts.
  for (const item of retry) {
    const ok = await downloadRemoteFile(
      options.host,
      [...options.remoteSegments, item.name],
      join(options.localDir, item.name),
      item.size,
      options.curlCfg,
    );
    if (ok) stats.downloaded += 1;
    else stats.failed += 1;
  }

  printStats(options.name, stats);
  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const romDir = args.romDir ?? join(args.destRoot, ROM_DIR_NAME);
  const officialLocalRoot = join(args.destRoot, "EmuMovies", "data", "Official");

  const { host, user, password } = await loadCredentials();
  const curlCfg = curlConfig(user, password);

  const machineNames = await listMachineNames(romDir);
  console.log(`machines: ${machineNames.length}`);
  if (args.dryRun) console.log("dry run: nothing will be downloaded");

  const rootEntries = listRemoteDir(host, [], curlCfg);
  if (!rootEntries.some((entry) => entry.isDir && entry.name === "Official")) {
    die(
      `remote root has no Official directory; found: ${rootEntries.map((entry) => entry.name).join(", ")}`,
    );
  }

  const budget = { remaining: args.limit ?? Number.POSITIVE_INFINITY };
  let failed = 0;

  if (args.only !== "artwork") {
    const parentSegments = ["Official", VIDEO_SNAPS_PARENT];
    const mameDirs = findMameDirs(listRemoteDir(host, parentSegments, curlCfg));
    if (mameDirs.length === 0) {
      die(`no MAME directories found under ${VIDEO_SNAPS_PARENT}`);
    }
    console.log(`video snap dirs: ${mameDirs.join(", ")}`);

    // Machines not found in one dir cascade to the next (EmuMovies splits
    // MAME snaps into Arcade / Casino / Handheld sets).
    let remaining = machineNames.map((machineName) => `${machineName}.mp4`);
    for (const videoDirName of mameDirs) {
      const videoSegments = [...parentSegments, videoDirName];
      const remoteSizes = new Map(
        listRemoteDir(host, videoSegments, curlCfg)
          .filter((entry) => !entry.isDir)
          .map((entry) => [entry.name, entry.size]),
      );
      const localDir = join(officialLocalRoot, VIDEO_SNAPS_PARENT, videoDirName);
      const plan = planDownloads(
        remoteSizes,
        remaining,
        await localSizesFor(localDir, "*.mp4"),
      );
      remaining = plan.missingRemote;
      plan.missingRemote = [];
      const stats = await runSection({
        name: `videos[${videoDirName}]`,
        host,
        remoteSegments: videoSegments,
        localDir,
        plan,
        curlCfg,
        dryRun: args.dryRun,
        parallel: args.parallel,
        budget,
      });
      failed += stats.failed;
    }
    console.log(`videos: missingRemote=${remaining.length}`);
  }

  if (args.only !== "videos") {
    const artworkSegments = ["Official", "Artwork", "MAME"];
    const remoteSizes = new Map(
      listRemoteDir(host, artworkSegments, curlCfg)
        .filter((entry) => !entry.isDir)
        .map((entry) => [entry.name, entry.size]),
    );
    const localDir = join(officialLocalRoot, "Artwork", "MAME");
    const localSizes = await localSizesFor(localDir, "*");

    for (const packPrefix of ARTWORK_PACKS) {
      const group = groupArtworkArchives([...remoteSizes.keys()], packPrefix);
      if (group === null) {
        console.error(`warning: no remote archives found for pack: ${packPrefix}`);
        failed += 1;
        continue;
      }
      const stats = await runSection({
        name: `artwork[${group.base}]`,
        host,
        remoteSegments: artworkSegments,
        localDir,
        plan: planDownloads(remoteSizes, group.parts, localSizes),
        curlCfg,
        dryRun: args.dryRun,
        parallel: args.parallel,
        budget,
      });
      failed += stats.failed;
    }
  }

  if (failed > 0) {
    console.error(`error: ${failed} download(s) failed; rerun to resume`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
