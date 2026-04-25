import { describe, expect, test } from "bun:test";

import {
  cabinetConfigToDraft,
  parseCabinetConfigDraft,
} from "./cabinet-config";
import type { CabinetConfig } from "./types";

const baseConfig: CabinetConfig = {
  displayProfile: "lcd-1440p-16:9",
  paths: {
    mameExecutablePath: "/usr/local/bin/mame",
    mameIniPath: "/etc/mame.ini",
    romRoots: ["/roms/a", "/roms/b"],
    mediaRoots: ["/media"],
    previewVideoRoot: "/media/previews",
    artworkRoot: "/media/artwork",
  },
  attractTimeoutSeconds: 12,
  displayCalibration: {
    topInsetPercent: 5,
    rightInsetPercent: 4,
    bottomInsetPercent: 6,
    leftInsetPercent: 3,
  },
};

describe("cabinetConfigToDraft", () => {
  test("serializes roots as newline-delimited text", () => {
    expect(cabinetConfigToDraft(baseConfig)).toMatchObject({
      romRootsText: "/roms/a\n/roms/b",
      mediaRootsText: "/media",
      attractTimeoutSeconds: "12",
    });
  });
});

describe("parseCabinetConfigDraft", () => {
  test("round-trips a valid cabinet config draft", () => {
    const parsed = parseCabinetConfigDraft(cabinetConfigToDraft(baseConfig), baseConfig);

    expect(parsed).toEqual({
      ok: true,
      value: baseConfig,
    });
  });

  test("trims path fields and collapses empty optional values", () => {
    const parsed = parseCabinetConfigDraft(
      {
        ...cabinetConfigToDraft(baseConfig),
        mameExecutablePath: "  /usr/bin/mame  ",
        mameIniPath: "   ",
        romRootsText: "\n/roms/main\n\n/roms/extra\n",
      },
      baseConfig,
    );

    expect(parsed).toEqual({
      ok: true,
      value: {
        ...baseConfig,
        paths: {
          ...baseConfig.paths,
          mameExecutablePath: "/usr/bin/mame",
          mameIniPath: null,
          romRoots: ["/roms/main", "/roms/extra"],
        },
      },
    });
  });

  test("rejects invalid numeric inputs with a user-facing message", () => {
    expect(
      parseCabinetConfigDraft(
        {
          ...cabinetConfigToDraft(baseConfig),
          attractTimeoutSeconds: "3.5",
        },
        baseConfig,
      ),
    ).toEqual({
      ok: false,
      message: "Attract timeout must be a whole number.",
    });
  });

  test("allows a blank MAME executable path for non-import settings", () => {
    expect(
      parseCabinetConfigDraft(
        { ...cabinetConfigToDraft(baseConfig), mameExecutablePath: "   " },
        baseConfig,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        paths: {
          mameExecutablePath: "",
        },
      },
    });
  });

  test("rejects a blank MAME executable path when importing catalog metadata", () => {
    expect(
      parseCabinetConfigDraft(
        { ...cabinetConfigToDraft(baseConfig), mameExecutablePath: "   " },
        baseConfig,
        { requireMameExecutablePath: true },
      ),
    ).toEqual({
      ok: false,
      message: "MAME executable path is required.",
    });
  });

  test("allows empty library roots for partial settings saves", () => {
    expect(
      parseCabinetConfigDraft(
        {
          ...cabinetConfigToDraft(baseConfig),
          romRootsText: "\n  \n",
          mediaRootsText: "",
          previewVideoRoot: "",
          artworkRoot: "",
        },
        baseConfig,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        paths: {
          romRoots: [],
          mediaRoots: [],
          previewVideoRoot: "",
          artworkRoot: "",
        },
      },
    });
  });

  test("rejects empty ROM root lists when scanning the library", () => {
    expect(
      parseCabinetConfigDraft(
        { ...cabinetConfigToDraft(baseConfig), romRootsText: "\n  \n" },
        baseConfig,
        { requireLibraryRoots: true },
      ),
    ).toEqual({
      ok: false,
      message: "ROM roots require at least one path.",
    });
  });

  test("rejects empty media root lists when scanning the library", () => {
    expect(
      parseCabinetConfigDraft(
        { ...cabinetConfigToDraft(baseConfig), mediaRootsText: "\n  \n" },
        baseConfig,
        { requireLibraryRoots: true },
      ),
    ).toEqual({
      ok: false,
      message: "Media roots require at least one path.",
    });
  });
});
