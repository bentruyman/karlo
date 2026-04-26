import { describe, expect, test } from "bun:test";

import type { CabinetConfigDraft } from "./cabinet-config";
import {
  adjustCalibrationDraft,
  CALIBRATION_EDGES,
  getCalibrationEdgeValue,
  moveCalibrationFocus,
} from "./calibration";

const baseDraft: CabinetConfigDraft = {
  mameExecutablePath: "/usr/local/bin/mame",
  mameIniPath: "",
  romRootsText: "/roms",
  mediaRootsText: "/media",
  previewVideoRoot: "/videos",
  artworkRoot: "/artwork",
  categoryIniPath: "/metadata/Category.ini",
  attractTimeoutSeconds: "12",
  topInsetPercent: "5",
  rightInsetPercent: "6",
  bottomInsetPercent: "7",
  leftInsetPercent: "8",
};

describe("calibration metadata", () => {
  test("keeps edge order stable", () => {
    expect(CALIBRATION_EDGES.map((edge) => edge.key)).toEqual([
      "topInsetPercent",
      "rightInsetPercent",
      "bottomInsetPercent",
      "leftInsetPercent",
    ]);
  });
});

describe("moveCalibrationFocus", () => {
  test("moves from edges into footer actions", () => {
    expect(moveCalibrationFocus({ zone: "edges", index: 3 }, "down")).toEqual({
      zone: "actions",
      action: "back",
    });
  });

  test("moves between footer actions and back to edges", () => {
    expect(
      moveCalibrationFocus({ zone: "actions", action: "back" }, "right"),
    ).toEqual({
      zone: "actions",
      action: "defaults",
    });

    expect(
      moveCalibrationFocus({ zone: "actions", action: "defaults" }, "right"),
    ).toEqual({
      zone: "actions",
      action: "save",
    });

    expect(
      moveCalibrationFocus({ zone: "actions", action: "back" }, "left"),
    ).toEqual({
      zone: "edges",
      index: 3,
    });
  });
});

describe("adjustCalibrationDraft", () => {
  test("nudges inset values and clamps at bounds", () => {
    expect(
      adjustCalibrationDraft(baseDraft, "leftInsetPercent", 2).leftInsetPercent,
    ).toBe("10");

    expect(
      adjustCalibrationDraft(baseDraft, "topInsetPercent", -99).topInsetPercent,
    ).toBe("0");

    expect(
      adjustCalibrationDraft(baseDraft, "rightInsetPercent", 99).rightInsetPercent,
    ).toBe("25");
  });

  test("normalizes invalid draft values before adjusting", () => {
    const brokenDraft = { ...baseDraft, bottomInsetPercent: "bad" };
    expect(getCalibrationEdgeValue(brokenDraft, "bottomInsetPercent")).toBe(0);
    expect(
      adjustCalibrationDraft(brokenDraft, "bottomInsetPercent", 1)
        .bottomInsetPercent,
    ).toBe("1");
  });
});
