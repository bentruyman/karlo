import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

import type { GameRecord } from "./types";

let mediaHttpBaseUrl: string | null = null;

export type PreviewMedia =
  | { kind: "video"; path: string; src: string }
  | { kind: "image"; path: string; src: string }
  | { kind: "none" };

export function setMediaHttpBaseUrl(baseUrl: string | null | undefined) {
  mediaHttpBaseUrl = baseUrl?.trim() || null;
}

export function getPreviewMedia(
  game: GameRecord,
  unavailablePaths: ReadonlySet<string> = new Set(),
): PreviewMedia {
  if (game.videoPath && !unavailablePaths.has(game.videoPath)) {
    return {
      kind: "video",
      path: game.videoPath,
      src: toVideoSrc(game.videoPath),
    };
  }

  const artworkPath = game.artworkPaths.find(
    (path) => !unavailablePaths.has(path),
  );
  if (artworkPath) {
    return {
      kind: "image",
      path: artworkPath,
      src: toMediaSrc(artworkPath),
    };
  }

  return { kind: "none" };
}

export function toMediaSrc(path: string) {
  if (!isDeviceFilePath(path) || !isTauri()) return path;

  try {
    return convertFileSrc(path);
  } catch {
    return toKarloMediaSrc(path);
  }
}

export function toVideoSrc(path: string) {
  const httpSrc = toMediaHttpSrc(path);
  if (httpSrc) return httpSrc;

  if (!isDeviceFilePath(path) || !isTauri()) return path;

  try {
    return convertFileSrc(path);
  } catch {
    return toKarloMediaSrc(path);
  }
}

function toKarloMediaSrc(path: string) {
  return `karlo-media://localhost/${encodeURIComponent(path)}`;
}

function toMediaHttpSrc(path: string) {
  if (!mediaHttpBaseUrl || !isDeviceFilePath(path)) return null;

  try {
    const url = new URL("/media", mediaHttpBaseUrl);
    url.searchParams.set("path", path);
    return url.toString();
  } catch {
    return null;
  }
}

function isDeviceFilePath(path: string) {
  return (
    path.startsWith("/") ||
    path.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(path)
  );
}
