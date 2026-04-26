#!/usr/bin/env bun
import { access, link, mkdir, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SOURCE_ROOT = "/Users/bentruyman/Development/src/github.com/bentruyman/karlo-library";
const DEFAULT_OUTPUT_ROOT = "/Users/bentruyman/Development/src/github.com/bentruyman/karlo-library-curated";
const ARTWORK_SETS = ["title", "preview", "marquee", "cabinet", "flyer"] as const;
const ALLOWED_CONTROLS = new Set(["joy", "only_buttons", "doublejoy", "trackball", "dial", "paddle"]);
const REJECTED_CONTROLS = new Set([
  "pedal",
  "lightgun",
  "keyboard",
  "keypad",
  "mouse",
  "mahjong",
  "hanafuda",
  "gambling",
  "positional",
  "stick",
  "triplejoy",
]);
const BAD_VARIANT_MARKERS = ["bootleg", "hack", "prototype", "pirate"];
const NON_ENGLISH_REGION_MARKERS = new Set([
  "asia",
  "brazil",
  "china",
  "chinese",
  "france",
  "french",
  "germany",
  "german",
  "hispanic",
  "hong kong",
  "italy",
  "italian",
  "japan",
  "japanese",
  "korea",
  "korean",
  "russia",
  "russian",
  "spain",
  "spanish",
  "taiwan",
]);

type Args = {
  sourceRoot: string;
  outputRoot: string;
  dat: string | null;
  dryRun: boolean;
  allowPreliminary: boolean;
  keepVariants: boolean;
  include: string[];
  exclude: string[];
};

export type DisplayInfo = {
  type: string;
  rotate: string | null;
  width: string | null;
  height: string | null;
  refresh: string | null;
};

export type ControlInfo = {
  type: string;
  player: string | null;
  buttons: string | null;
  ways: string | null;
};

export type MachineInfo = {
  name: string;
  title: string;
  year: string | null;
  manufacturer: string | null;
  runnable: boolean;
  isBios: boolean;
  isDevice: boolean;
  isMechanical: boolean;
  cloneOf: string | null;
  romOf: string | null;
  sourceFile: string | null;
  driverStatus: string | null;
  emulationStatus: string | null;
  controls: ControlInfo[];
  displays: DisplayInfo[];
};

export type Candidate = {
  machine: MachineInfo;
  groupKey: string;
  score: number[];
  region: string;
  variantTags: string[];
  included: boolean;
};

export type CurationResult = {
  accepted: Candidate[];
  rejected: Record<string, string>;
  duplicateGroups: Array<{
    groupKey: string;
    selected: string;
    discarded: string[];
  }>;
  missingFromDat: string[];
};

type LinkResult = "linked" | "copied" | "existing" | "missing" | "conflict";
type Stats = Record<string, number>;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    dat: null,
    dryRun: false,
    allowPreliminary: false,
    keepVariants: false,
    include: [],
    exclude: [],
  };
  let positionalSource: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--allow-preliminary") {
      args.allowPreliminary = true;
      continue;
    }
    if (arg === "--keep-variants") {
      args.keepVariants = true;
      continue;
    }
    if (["--output-root", "--dat", "--include", "--exclude"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) die(`${arg} requires a value`);
      if (arg === "--output-root") args.outputRoot = value;
      if (arg === "--dat") args.dat = value;
      if (arg === "--include") args.include.push(value);
      if (arg === "--exclude") args.exclude.push(value);
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg.startsWith("--")) die(`unknown argument: ${arg}`);
    if (positionalSource !== null) die("only one source root may be provided");
    positionalSource = arg;
  }

  if (positionalSource !== null) args.sourceRoot = positionalSource;
  args.sourceRoot = resolvePath(args.sourceRoot);
  args.outputRoot = resolvePath(args.outputRoot);
  args.dat = resolvePath(args.dat ?? join(args.sourceRoot, "mame.dat"));
  return args;
}

function printUsage() {
  console.log(`Usage: ops/curate-arcade-library.ts [options] [SOURCE_ROOT]

Creates a smaller cabinet-playable Karlo MAME library from a staged library.

Options:
  --output-root PATH
  --dat PATH
  --dry-run
  --allow-preliminary
  --keep-variants
  --include MACHINE
  --exclude MACHINE
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

async function sameFile(left: string, right: string) {
  try {
    const [leftStat, rightStat] = await Promise.all([stat(left), stat(right)]);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

async function ensureDir(path: string, dryRun: boolean) {
  if (!dryRun) await mkdir(path, { recursive: true });
}

async function collectGlob(pattern: string, cwd: string) {
  const entries: string[] = [];
  for await (const entry of new Bun.Glob(pattern).scan(cwd)) entries.push(entry);
  return entries;
}

export async function listRomNames(sourceRoot: string) {
  const romRoot = join(sourceRoot, "roms", "mame");
  if (!(await isDirectory(romRoot))) die(`missing ROM directory: ${romRoot}`);
  const names: string[] = [];
  for (const entry of await collectGlob("*.zip", romRoot)) {
    const path = join(romRoot, entry);
    if (await isFile(path)) names.push(basename(entry, ".zip"));
  }
  return names.sort();
}

export async function parseMameDat(datPath: string) {
  if (!(await isFile(datPath))) die(`missing MAME DAT: ${datPath}`);
  return parseMameDatXml(await Bun.file(datPath).text());
}

export function parseMameDatXml(xml: string): Record<string, MachineInfo> {
  const machines: Record<string, MachineInfo> = {};
  let current: MachineInfo | null = null;

  for (const rawLine of xml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("<machine ")) {
      const name = extractAttribute(line, "name");
      if (name === null) continue;
      current = {
        name,
        title: name,
        year: null,
        manufacturer: null,
        runnable: extractAttribute(line, "runnable") !== "no",
        isBios: extractAttribute(line, "isbios") === "yes",
        isDevice: extractAttribute(line, "isdevice") === "yes",
        isMechanical: extractAttribute(line, "ismechanical") === "yes",
        cloneOf: extractAttribute(line, "cloneof"),
        romOf: extractAttribute(line, "romof"),
        sourceFile: extractAttribute(line, "sourcefile"),
        driverStatus: null,
        emulationStatus: null,
        controls: [],
        displays: [],
      };
      continue;
    }

    if (current === null) continue;

    if (line.startsWith("<description>")) {
      current.title = extractTagText(line, "description") ?? current.name;
      continue;
    }
    if (line.startsWith("<year>")) {
      current.year = extractTagText(line, "year");
      continue;
    }
    if (line.startsWith("<manufacturer>")) {
      current.manufacturer = extractTagText(line, "manufacturer");
      continue;
    }
    const displayTags = tagsNamed(line, "display");
    if (displayTags.length > 0) {
      for (const tag of displayTags) {
        current.displays.push({
          type: extractAttribute(tag, "type") ?? "unknown",
          rotate: extractAttribute(tag, "rotate"),
          width: extractAttribute(tag, "width"),
          height: extractAttribute(tag, "height"),
          refresh: extractAttribute(tag, "refresh"),
        });
      }
      continue;
    }
    const controlTags = tagsNamed(line, "control");
    if (controlTags.length > 0) {
      for (const tag of controlTags) {
        current.controls.push({
          type: extractAttribute(tag, "type") ?? "unknown",
          player: extractAttribute(tag, "player"),
          buttons: extractAttribute(tag, "buttons"),
          ways: extractAttribute(tag, "ways"),
        });
      }
      continue;
    }
    const driverTag = tagsNamed(line, "driver")[0];
    if (driverTag) {
      current.driverStatus = extractAttribute(driverTag, "status");
      current.emulationStatus = extractAttribute(driverTag, "emulation");
      continue;
    }
    if (line.startsWith("</machine>")) {
      machines[current.name] = current;
      current = null;
    }
  }

  return machines;
}

function extractAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1] ?? null;
}

function tagsNamed(line: string, name: string) {
  return [...line.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((match) => match[0]);
}

function extractTagText(line: string, tag: string) {
  const match = line.match(new RegExp(`<${tag}>(.*)</${tag}>`));
  return match ? unescapeXml(match[1]) : null;
}

function unescapeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function rejectReason(machine: MachineInfo, allowPreliminary: boolean) {
  if (!machine.runnable) return "not_runnable";
  if (machine.isBios) return "bios";
  if (machine.isDevice) return "device";
  if (machine.isMechanical) return "mechanical";
  if (machine.displays.length === 0) return "no_display";
  if (!allowPreliminary && (machine.driverStatus === "preliminary" || machine.emulationStatus === "preliminary")) {
    return "preliminary";
  }

  const controlTypes = new Set(machine.controls.map((control) => control.type));
  const rejected = [...controlTypes].filter((control) => REJECTED_CONTROLS.has(control)).sort();
  if (rejected.length > 0) return `unsupported_control:${rejected.join(",")}`;
  const unsupported = [...controlTypes].filter((control) => !ALLOWED_CONTROLS.has(control)).sort();
  if (unsupported.length > 0) return `unsupported_control:${unsupported.join(",")}`;
  return null;
}

export function curateMachines(options: {
  romNames: string[];
  machines: Record<string, MachineInfo>;
  allowPreliminary?: boolean;
  keepVariants?: boolean;
  include?: string[];
  exclude?: string[];
}): CurationResult {
  const include = new Set((options.include ?? []).map((name) => name.trim()).filter(Boolean));
  const exclude = new Set((options.exclude ?? []).map((name) => name.trim()).filter(Boolean));
  const rejected: Record<string, string> = {};
  const missingFromDat: string[] = [];
  const candidates: Candidate[] = [];

  for (const name of [...new Set(options.romNames)].sort()) {
    if (exclude.has(name)) {
      rejected[name] = "manual_exclude";
      continue;
    }

    const machine = options.machines[name];
    if (!machine) {
      rejected[name] = "missing_dat";
      missingFromDat.push(name);
      continue;
    }

    const included = include.has(name);
    const reason = included ? null : rejectReason(machine, options.allowPreliminary ?? false);
    if (reason !== null) {
      rejected[name] = reason;
      continue;
    }

    candidates.push(buildCandidate(machine, included));
  }

  if (options.keepVariants) {
    return {
      accepted: candidates.sort(compareCandidateName),
      rejected,
      duplicateGroups: [],
      missingFromDat,
    };
  }

  const [accepted, duplicateGroups] = collapseVariants(candidates);
  for (const group of duplicateGroups) {
    for (const machineName of group.discarded) rejected[machineName] = "duplicate_variant";
  }
  return { accepted, rejected, duplicateGroups, missingFromDat };
}

function buildCandidate(machine: MachineInfo, included: boolean): Candidate {
  const region = regionPreference(machine.title);
  const variantTags = variantMarkers(machine.title);
  return {
    machine,
    groupKey: normalizedTitleFamily(machine.title),
    score: variantScore(machine, region, variantTags, included),
    region,
    variantTags,
    included,
  };
}

function collapseVariants(candidates: Candidate[]): [Candidate[], CurationResult["duplicateGroups"]] {
  const grouped = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    grouped.set(candidate.groupKey, [...(grouped.get(candidate.groupKey) ?? []), candidate]);
  }

  const accepted: Candidate[] = [];
  const duplicateGroups: CurationResult["duplicateGroups"] = [];
  for (const [groupKey, group] of grouped.entries()) {
    if (group.length === 1) {
      accepted.push(group[0]);
      continue;
    }

    const ranked = [...group].sort(compareCandidateRank);
    const selected = ranked[0];
    const discarded = ranked.slice(1).map((candidate) => candidate.machine.name).sort();
    accepted.push(selected);
    duplicateGroups.push({ groupKey, selected: selected.machine.name, discarded });
  }

  return [
    accepted.sort(compareCandidateName),
    duplicateGroups.sort((left, right) => left.selected.localeCompare(right.selected)),
  ];
}

function compareCandidateName(left: Candidate, right: Candidate) {
  return left.machine.name.localeCompare(right.machine.name);
}

function compareCandidateRank(left: Candidate, right: Candidate) {
  for (let index = 0; index < Math.max(left.score.length, right.score.length); index += 1) {
    const diff = (right.score[index] ?? 0) - (left.score[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.machine.name.localeCompare(right.machine.name);
}

export function normalizedTitleFamily(title: string) {
  let base = title.includes("(") ? title.slice(0, title.indexOf("(")).trim() : title;
  base = base.replace(/\b(rev(?:ision)?|ver(?:sion)?|set)\s*[a-z0-9.:-]+\b/gi, "");
  base = base.replace(/\b(first|older|newer|old|new)\s+(version|set)\b/gi, "");
  const normalized = base.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return normalized || title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function regionPreference(title: string) {
  const tokens = parentheticalTokens(title);
  if (["usa", "u.s.a.", "us", "u.s."].some((token) => tokens.has(token))) return "usa";
  if (tokens.has("world")) return "world";
  if (tokens.has("euro") || tokens.has("europe")) return "europe";
  if (tokens.has("japan")) return "japan";
  if (tokens.size === 0) return "untagged";
  return "other";
}

function variantMarkers(title: string) {
  const lowerTitle = title.toLowerCase();
  const tokens = parentheticalTokens(title);
  const markers = new Set<string>();
  for (const marker of BAD_VARIANT_MARKERS) {
    if (lowerTitle.includes(marker)) markers.add(marker);
  }
  for (const token of tokens) {
    if (/\bset\s+[2-9]\b/.test(token)) markers.add("later_set");
    if (/\b(rev|revision|ver|version)\b/.test(token)) markers.add("revision");
    if (NON_ENGLISH_REGION_MARKERS.has(token)) markers.add("non_english_region");
  }
  return [...markers].sort();
}

function variantScore(machine: MachineInfo, region: string, tags: string[], included: boolean) {
  const regionScores: Record<string, number> = {
    usa: 60,
    world: 55,
    europe: 50,
    untagged: 45,
    other: 30,
    japan: 20,
  };
  return [
    included ? 1000 : 0,
    regionScores[region] ?? 0,
    machine.cloneOf === null ? 20 : 0,
    tags.includes("bootleg") ? -30 : 0,
    tags.includes("hack") ? -30 : 0,
    tags.includes("prototype") ? -25 : 0,
    tags.includes("later_set") ? -15 : 0,
    tags.includes("non_english_region") ? -10 : 0,
    /\b(rev|revision)\s+[a-z0-9]+\b/i.test(machine.title) ? 3 : 0,
  ];
}

function parentheticalTokens(title: string) {
  const tokens = new Set<string>();
  for (const match of title.toLowerCase().matchAll(/\(([^)]*)\)/g)) {
    for (const token of match[1].split(/[,/;]/)) {
      const normalized = token.replace(/[^a-z0-9. ]+/g, " ").trim();
      if (!normalized) continue;
      tokens.add(normalized);
      for (const piece of normalized.split(/\s+/)) tokens.add(piece);
    }
  }
  return tokens;
}

async function hardlinkOrCopy(source: string, target: string, dryRun: boolean): Promise<LinkResult> {
  if (!(await isFile(source))) return "missing";
  if (await pathExists(target)) {
    if (await sameFile(source, target)) return "existing";
    if (dryRun) return "conflict";
    throw new Error(`refusing to overwrite existing file: ${target}`);
  }

  if (dryRun) return "linked";
  await ensureDir(dirname(target), false);
  try {
    await link(source, target);
    return "linked";
  } catch {
    await copyFile(source, target);
    return "copied";
  }
}

function increment(stats: Stats, key: string) {
  stats[key] = (stats[key] ?? 0) + 1;
}

export async function stageCuratedLibrary(
  sourceRoot: string,
  outputRoot: string,
  accepted: Candidate[],
  dryRun: boolean,
) {
  const stats: Record<string, Stats> = { roms: {}, videos: {}, artwork: {} };
  const inventory = [];

  for (const candidate of accepted) {
    const machineName = candidate.machine.name;
    increment(
      stats.roms,
      await hardlinkOrCopy(
        join(sourceRoot, "roms", "mame", `${machineName}.zip`),
        join(outputRoot, "roms", "mame", `${machineName}.zip`),
        dryRun,
      ),
    );

    const videoResult = await hardlinkOrCopy(
      join(sourceRoot, "media", "mame", "videos", `${machineName}.mp4`),
      join(outputRoot, "media", "mame", "videos", `${machineName}.mp4`),
      dryRun,
    );
    increment(stats.videos, videoResult);

    const artwork: Record<string, string | null> = {};
    for (const artworkSet of ARTWORK_SETS) {
      const source = await findMediaFile(join(sourceRoot, "media", "mame", "artwork", artworkSet), machineName);
      if (source === null) {
        increment(stats.artwork, `${artworkSet}:missing`);
        artwork[artworkSet] = null;
        continue;
      }

      const target = join(outputRoot, "media", "mame", "artwork", artworkSet, `${machineName}${extname(source).toLowerCase()}`);
      const result = await hardlinkOrCopy(source, target, dryRun);
      increment(stats.artwork, `${artworkSet}:${result}`);
      artwork[artworkSet] = `media/mame/artwork/${artworkSet}/${machineName}${extname(source).toLowerCase()}`;
    }

    inventory.push({
      machineName,
      rom: `roms/mame/${machineName}.zip`,
      video: videoResult === "missing" ? null : `media/mame/videos/${machineName}.mp4`,
      artwork,
    });
  }

  return { inventory, stats };
}

export async function prepareOutputRoot(outputRoot: string, dryRun: boolean) {
  if (dryRun) return;
  for (const managedPath of [
    join(outputRoot, "roms", "mame"),
    join(outputRoot, "media", "mame"),
    join(outputRoot, "manifests"),
  ]) {
    await rm(managedPath, { recursive: true, force: true });
  }
}

async function findMediaFile(root: string, machineName: string) {
  for (const suffix of [".png", ".jpg", ".jpeg"]) {
    const path = join(root, `${machineName}${suffix}`);
    if (await isFile(path)) return path;
  }
  return null;
}

function machineReport(candidate: Candidate) {
  const machine = candidate.machine;
  return {
    machineName: machine.name,
    title: machine.title,
    year: machine.year,
    manufacturer: machine.manufacturer,
    region: candidate.region,
    variantTags: candidate.variantTags,
    cloneOf: machine.cloneOf,
    sourceFile: machine.sourceFile,
    driver: {
      status: machine.driverStatus,
      emulation: machine.emulationStatus,
    },
    controls: machine.controls,
    displays: machine.displays,
  };
}

async function writeOutputs(options: {
  sourceRoot: string;
  outputRoot: string;
  datPath: string;
  result: CurationResult;
  inventory: Array<Record<string, unknown>>;
  stats: Record<string, Stats>;
  dryRun: boolean;
}) {
  const generatedAt = new Date().toISOString();
  const rejectedByReason: Stats = {};
  for (const reason of Object.values(options.result.rejected)) increment(rejectedByReason, reason);
  const manifest = {
    generatedAt,
    sourceRoot: options.sourceRoot,
    outputRoot: options.outputRoot,
    machineCount: options.inventory.length,
    counts: options.stats,
    inventory: options.inventory,
  };
  const report = {
    generatedAt,
    sourceRoot: options.sourceRoot,
    outputRoot: options.outputRoot,
    mameDat: options.datPath,
    acceptedCount: options.result.accepted.length,
    rejectedCount: Object.keys(options.result.rejected).length,
    rejectedByReason: Object.fromEntries(Object.entries(rejectedByReason).sort()),
    accepted: options.result.accepted.map(machineReport),
    rejected: Object.entries(options.result.rejected)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([machineName, reason]) => ({ machineName, reason })),
    duplicateGroups: options.result.duplicateGroups,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({
      generatedAt,
      sourceRoot: options.sourceRoot,
      outputRoot: options.outputRoot,
      mameDat: options.datPath,
      acceptedCount: options.result.accepted.length,
      rejectedCount: Object.keys(options.result.rejected).length,
      rejectedByReason: report.rejectedByReason,
      duplicateGroupCount: options.result.duplicateGroups.length,
      counts: options.stats,
    }, null, 2));
    return;
  }

  const manifestDir = join(options.outputRoot, "manifests");
  await ensureDir(manifestDir, false);
  await writeFile(join(manifestDir, "inventory.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(manifestDir, "curation-report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(await isDirectory(args.sourceRoot))) die(`source root not found: ${args.sourceRoot}`);
  if (args.outputRoot === args.sourceRoot) die("output root must be separate from source root");

  const romNames = await listRomNames(args.sourceRoot);
  const machines = await parseMameDat(args.dat ?? join(args.sourceRoot, "mame.dat"));
  const result = curateMachines({
    romNames,
    machines,
    allowPreliminary: args.allowPreliminary,
    keepVariants: args.keepVariants,
    include: args.include,
    exclude: args.exclude,
  });
  await prepareOutputRoot(args.outputRoot, args.dryRun);
  const { inventory, stats } = await stageCuratedLibrary(
    args.sourceRoot,
    args.outputRoot,
    result.accepted,
    args.dryRun,
  );
  await writeOutputs({
    sourceRoot: args.sourceRoot,
    outputRoot: args.outputRoot,
    datPath: args.dat ?? join(args.sourceRoot, "mame.dat"),
    result,
    inventory,
    stats,
    dryRun: args.dryRun,
  });

  if (!args.dryRun) {
    console.log(`accepted: ${result.accepted.length}`);
    console.log(`rejected: ${Object.keys(result.rejected).length}`);
    console.log(`inventory: ${join(args.outputRoot, "manifests", "inventory.json")}`);
    console.log(`report: ${join(args.outputRoot, "manifests", "curation-report.json")}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
