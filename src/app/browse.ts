import type { GameRecord } from "./types";

export const TITLE_BUCKETS = ["0-9", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return clamp(index, 0, length - 1);
}

export function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function getTitleBucket(title: string) {
  const ch = title.trimStart()[0]?.toUpperCase() ?? "";
  return /[A-Z]/.test(ch) ? ch : "0-9";
}

export function jumpLetter(
  games: GameRecord[],
  current: number,
  direction: 1 | -1,
) {
  if (games.length === 0) return 0;

  const start = clampIndex(current, games.length);
  const currentBucket = getTitleBucket(games[start].title);
  let targetBucket: string | undefined;
  let targetIndex = start;

  for (let step = 1; step <= games.length; step += 1) {
    const index = wrapIndex(start + step * direction, games.length);
    const bucket = getTitleBucket(games[index].title);

    if (bucket === currentBucket) continue;

    if (targetBucket === undefined) {
      targetBucket = bucket;
      targetIndex = index;

      if (direction === 1) return targetIndex;
      continue;
    }

    if (bucket !== targetBucket) return targetIndex;

    targetIndex = index;
  }

  return targetBucket === undefined ? start : targetIndex;
}
