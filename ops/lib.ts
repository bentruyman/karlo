import { access, link, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function resolvePath(path: string) {
  if (path === "~") return process.env.HOME ?? path;
  if (path.startsWith("~/")) return resolve(process.env.HOME ?? ".", path.slice(2));
  return resolve(path);
}

export function die(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

export async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function sameFile(left: string, right: string) {
  try {
    const [leftStat, rightStat] = await Promise.all([stat(left), stat(right)]);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

export async function ensureDir(path: string, dryRun: boolean) {
  if (!dryRun) await mkdir(path, { recursive: true });
}

export async function collectGlob(pattern: string, cwd: string) {
  const entries: string[] = [];
  for await (const entry of new Bun.Glob(pattern).scan(cwd)) entries.push(entry);
  return entries;
}

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Hardlinks source onto target, treating an identical existing file as a no-op. */
export async function hardlinkFile(
  source: string,
  target: string,
  dryRun: boolean,
) {
  if (await pathExists(target)) {
    if (await sameFile(source, target)) return "existing";
    throw new Error(`refusing to overwrite existing file: ${target}`);
  }

  if (dryRun) return "linked";

  await ensureDir(dirname(target), false);
  await link(source, target);
  return "linked";
}
