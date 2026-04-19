import { describe, expect, test } from "bun:test";

import {
  getServiceFieldKeys,
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
    expect(getServiceFieldKeys("storage")).toEqual([]);
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
    let current: ServiceFocusTarget = { zone: "field", key: "topInsetPercent" };

    current = moveServiceFocus(current, "down", "display");
    expect(current).toEqual({ zone: "field", key: "rightInsetPercent" });

    current = moveServiceFocus(current, "down", "display");
    expect(current).toEqual({ zone: "field", key: "bottomInsetPercent" });

    current = moveServiceFocus(current, "down", "display");
    expect(current).toEqual({ zone: "field", key: "leftInsetPercent" });

    current = moveServiceFocus(current, "down", "display");
    expect(current).toEqual({ zone: "actions", action: "defaults" });
  });

  test("moves back from footer actions into fields or the current section", () => {
    expect(
      moveServiceFocus({ zone: "actions", action: "defaults" }, "left", "launch"),
    ).toEqual({
      zone: "field",
      key: "mameIniPath",
    });

    expect(
      moveServiceFocus({ zone: "actions", action: "defaults" }, "left", "storage"),
    ).toEqual({
      zone: "sections",
      index: 3,
    });
  });
});
