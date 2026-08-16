export const TITLE_BUCKETS = ["0-9", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

export function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

export function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function getTitleBucket(title: string) {
  const ch = title.trimStart()[0]?.toUpperCase() ?? "";
  return /[A-Z]/.test(ch) ? ch : "0-9";
}
