import { describe, expect, test } from "bun:test";

import {
  getServiceFieldKeys,
  getServicePanelActions,
  getServiceSectionIndex,
  moveServiceFocus,
  SERVICE_SECTIONS,
  type ServiceFocusTarget,
} from "./navigation";

describe("service navigation metadata", () => {
  test("keeps section order stable", () => {
    expect(SERVICE_SECTIONS.map((section) => section.id)).toEqual([
      "launch",
      "media",
      "display",
      "storage",
    ]);
    expect(getServiceSectionIndex("display")).toBe(2);
    expect(getServicePanelActions("launch")).toEqual(["importCatalog"]);
    expect(getServicePanelActions("media")).toEqual(["scanRoms"]);
    expect(getServiceFieldKeys("storage")).toEqual([]);
    expect(getServicePanelActions("display")).toEqual(["openCalibration"]);
  });
});

describe("moveServiceFocus", () => {
  test("moves between close control and section list", () => {
    expect(moveServiceFocus({ zone: "close" }, "right", "launch")).toEqual({
      zone: "sections",
      index: 0,
    });
    expect(
      moveServiceFocus({ zone: "sections", index: 0 }, "up", "launch"),
    ).toEqual({ zone: "close" });
  });

  test("moves from section list into the current section fields", () => {
    expect(
      moveServiceFocus({ zone: "sections", index: 1 }, "right", "media"),
    ).toEqual({
      zone: "field",
      key: "romRootsText",
    });
  });

  test("falls through to footer actions when a section has no editable fields", () => {
    expect(
      moveServiceFocus({ zone: "sections", index: 3 }, "right", "storage"),
    ).toEqual({
      zone: "actions",
      action: "defaults",
    });
  });

  test("moves through editable fields and into footer actions", () => {
    let current: ServiceFocusTarget = {
      zone: "field",
      key: "attractTimeoutSeconds",
    };

    current = moveServiceFocus(current, "down", "display");
    expect(current).toEqual({ zone: "panelActions", action: "openCalibration" });

    current = moveServiceFocus(current, "down", "display");
    expect(current).toEqual({ zone: "actions", action: "defaults" });
  });

  test("moves from launch and media fields into panel actions", () => {
    expect(
      moveServiceFocus({ zone: "field", key: "mameIniPath" }, "right", "launch"),
    ).toEqual({
      zone: "panelActions",
      action: "importCatalog",
    });

    expect(
      moveServiceFocus({ zone: "field", key: "artworkRoot" }, "right", "media"),
    ).toEqual({
      zone: "panelActions",
      action: "scanRoms",
    });
  });

  test("moves back from footer actions into fields or the current section", () => {
    expect(
      moveServiceFocus({ zone: "actions", action: "defaults" }, "left", "launch"),
    ).toEqual({
      zone: "panelActions",
      action: "importCatalog",
    });

    expect(
      moveServiceFocus({ zone: "actions", action: "defaults" }, "left", "storage"),
    ).toEqual({
      zone: "sections",
      index: 3,
    });

    expect(
      moveServiceFocus({ zone: "actions", action: "defaults" }, "left", "display"),
    ).toEqual({
      zone: "panelActions",
      action: "openCalibration",
    });
  });
});
