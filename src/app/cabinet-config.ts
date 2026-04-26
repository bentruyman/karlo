import type { CabinetConfig } from "./types";

export interface CabinetConfigDraft {
  mameExecutablePath: string;
  mameIniPath: string;
  romRootsText: string;
  mediaRootsText: string;
  previewVideoRoot: string;
  artworkRoot: string;
  categoryIniPath: string;
  attractTimeoutSeconds: string;
  topInsetPercent: string;
  rightInsetPercent: string;
  bottomInsetPercent: string;
  leftInsetPercent: string;
}

export function cabinetConfigToDraft(
  cabinetConfig: CabinetConfig,
): CabinetConfigDraft {
  return {
    mameExecutablePath: cabinetConfig.paths.mameExecutablePath,
    mameIniPath: cabinetConfig.paths.mameIniPath ?? "",
    romRootsText: cabinetConfig.paths.romRoots.join("\n"),
    mediaRootsText: cabinetConfig.paths.mediaRoots.join("\n"),
    previewVideoRoot: cabinetConfig.paths.previewVideoRoot,
    artworkRoot: cabinetConfig.paths.artworkRoot,
    categoryIniPath: cabinetConfig.paths.categoryIniPath ?? "",
    attractTimeoutSeconds: String(cabinetConfig.attractTimeoutSeconds),
    topInsetPercent: String(cabinetConfig.displayCalibration.topInsetPercent),
    rightInsetPercent: String(cabinetConfig.displayCalibration.rightInsetPercent),
    bottomInsetPercent: String(cabinetConfig.displayCalibration.bottomInsetPercent),
    leftInsetPercent: String(cabinetConfig.displayCalibration.leftInsetPercent),
  };
}

export function parseCabinetConfigDraft(
  draft: CabinetConfigDraft,
  baseConfig: CabinetConfig,
  options: {
    requireMameExecutablePath?: boolean;
    requireLibraryRoots?: boolean;
  } = {},
): { ok: true; value: CabinetConfig } | { ok: false; message: string } {
  const mameExecutablePath = options.requireMameExecutablePath
    ? requiredPath(draft.mameExecutablePath, "MAME executable path")
    : { ok: true as const, value: draft.mameExecutablePath.trim() };
  if (!mameExecutablePath.ok) return mameExecutablePath;

  const romRoots = parseRootList(
    draft.romRootsText,
    "ROM roots",
    Boolean(options.requireLibraryRoots),
  );
  if (!romRoots.ok) return romRoots;

  const mediaRoots = parseRootList(
    draft.mediaRootsText,
    "Media roots",
    Boolean(options.requireLibraryRoots),
  );
  if (!mediaRoots.ok) return mediaRoots;

  const attractTimeoutSeconds = parseIntegerField(
    draft.attractTimeoutSeconds,
    "Attract timeout",
    5,
    600,
  );
  if (!attractTimeoutSeconds.ok) return attractTimeoutSeconds;

  const topInsetPercent = parseIntegerField(
    draft.topInsetPercent,
    "Top inset",
    0,
    25,
  );
  if (!topInsetPercent.ok) return topInsetPercent;

  const rightInsetPercent = parseIntegerField(
    draft.rightInsetPercent,
    "Right inset",
    0,
    25,
  );
  if (!rightInsetPercent.ok) return rightInsetPercent;

  const bottomInsetPercent = parseIntegerField(
    draft.bottomInsetPercent,
    "Bottom inset",
    0,
    25,
  );
  if (!bottomInsetPercent.ok) return bottomInsetPercent;

  const leftInsetPercent = parseIntegerField(
    draft.leftInsetPercent,
    "Left inset",
    0,
    25,
  );
  if (!leftInsetPercent.ok) return leftInsetPercent;

  return {
    ok: true,
    value: {
      ...baseConfig,
      paths: {
        ...baseConfig.paths,
        mameExecutablePath: mameExecutablePath.value,
        mameIniPath: optionalValue(draft.mameIniPath),
        romRoots: romRoots.value,
        mediaRoots: mediaRoots.value,
        previewVideoRoot: draft.previewVideoRoot.trim(),
        artworkRoot: draft.artworkRoot.trim(),
        categoryIniPath: optionalValue(draft.categoryIniPath),
      },
      attractTimeoutSeconds: attractTimeoutSeconds.value,
      displayCalibration: {
        topInsetPercent: topInsetPercent.value,
        rightInsetPercent: rightInsetPercent.value,
        bottomInsetPercent: bottomInsetPercent.value,
        leftInsetPercent: leftInsetPercent.value,
      },
    },
  };
}

function splitRoots(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function requiredPath(
  value: string,
  label: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: `${label} is required.` };
  }
  return { ok: true, value: trimmed };
}

function parseRootList(
  value: string,
  label: string,
  required: boolean,
): { ok: true; value: string[] } | { ok: false; message: string } {
  const roots = splitRoots(value);
  if (required && roots.length === 0) {
    return { ok: false, message: `${label} require at least one path.` };
  }
  return { ok: true, value: roots };
}

function optionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseIntegerField(
  value: string,
  label: string,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: `${label} is required.` };
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return { ok: false, message: `${label} must be a whole number.` };
  }

  if (parsed < min || parsed > max) {
    return {
      ok: false,
      message: `${label} must be between ${min} and ${max}.`,
    };
  }

  return { ok: true, value: parsed };
}
