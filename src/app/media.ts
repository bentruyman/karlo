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
      src: toMediaSrc(game.videoPath),
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

/** Device media goes over the loopback server; packaged relative media stays as-is. */
export function toMediaSrc(path: string) {
  if (!mediaHttpBaseUrl || !isDeviceFilePath(path)) return path;

  try {
    const url = new URL("/media", mediaHttpBaseUrl);
    url.searchParams.set("path", path);
    return url.toString();
  } catch {
    return path;
  }
}

function isDeviceFilePath(path: string) {
  return (
    path.startsWith("/") ||
    path.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(path)
  );
}
