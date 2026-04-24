import type { CabinetConfigDraft } from "./cabinet-config";

export type CalibrationEdgeKey =
  | "topInsetPercent"
  | "rightInsetPercent"
  | "bottomInsetPercent"
  | "leftInsetPercent";

export type CalibrationActionId = "back" | "defaults" | "save";

export type CalibrationFocusTarget =
  | { zone: "edges"; index: number }
  | { zone: "actions"; action: CalibrationActionId };

export type CalibrationMoveDirection = "up" | "down" | "left" | "right";

export const CALIBRATION_MIN_PERCENT = 0;
export const CALIBRATION_MAX_PERCENT = 25;

export const CALIBRATION_EDGES: Array<{
  key: CalibrationEdgeKey;
  label: string;
  detail: string;
}> = [
  {
    key: "topInsetPercent",
    label: "TOP",
    detail: "Keep the mode bar clear of the cabinet bezel.",
  },
  {
    key: "rightInsetPercent",
    label: "RIGHT",
    detail: "Keep preview art and edge labels inside the panel bounds.",
  },
  {
    key: "bottomInsetPercent",
    label: "BOTTOM",
    detail: "Keep control hints and footer labels clear of the bezel.",
  },
  {
    key: "leftInsetPercent",
    label: "LEFT",
    detail: "Keep the library list and markers fully visible.",
  },
];

const CALIBRATION_ACTIONS: CalibrationActionId[] = ["back", "defaults", "save"];

export function moveCalibrationFocus(
  current: CalibrationFocusTarget,
  direction: CalibrationMoveDirection,
): CalibrationFocusTarget {
  if (current.zone === "edges") {
    if (direction === "up") {
      return current.index === 0
        ? current
        : { zone: "edges", index: current.index - 1 };
    }

    if (direction === "down") {
      return current.index === CALIBRATION_EDGES.length - 1
        ? { zone: "actions", action: "back" }
        : { zone: "edges", index: current.index + 1 };
    }

    return current;
  }

  const currentIndex = CALIBRATION_ACTIONS.indexOf(current.action);
  if (currentIndex === -1) return { zone: "actions", action: "back" };

  if (direction === "up") {
    return { zone: "edges", index: CALIBRATION_EDGES.length - 1 };
  }

  if (direction === "left") {
    return currentIndex === 0
      ? { zone: "edges", index: CALIBRATION_EDGES.length - 1 }
      : { zone: "actions", action: CALIBRATION_ACTIONS[currentIndex - 1] };
  }

  if (direction === "right") {
    return currentIndex === CALIBRATION_ACTIONS.length - 1
      ? current
      : { zone: "actions", action: CALIBRATION_ACTIONS[currentIndex + 1] };
  }

  return current;
}

export function getCalibrationEdgeValue(
  draft: CabinetConfigDraft,
  edgeKey: CalibrationEdgeKey,
) {
  const parsed = Number(draft[edgeKey].trim());
  return clampCalibrationValue(Number.isFinite(parsed) ? Math.round(parsed) : 0);
}

export function adjustCalibrationDraft(
  draft: CabinetConfigDraft,
  edgeKey: CalibrationEdgeKey,
  delta: number,
): CabinetConfigDraft {
  const currentValue = getCalibrationEdgeValue(draft, edgeKey);
  const nextValue = clampCalibrationValue(currentValue + delta);
  return { ...draft, [edgeKey]: String(nextValue) };
}

export function getCalibrationPreviewInsets(draft: CabinetConfigDraft) {
  return {
    topInsetPercent: getCalibrationEdgeValue(draft, "topInsetPercent"),
    rightInsetPercent: getCalibrationEdgeValue(draft, "rightInsetPercent"),
    bottomInsetPercent: getCalibrationEdgeValue(draft, "bottomInsetPercent"),
    leftInsetPercent: getCalibrationEdgeValue(draft, "leftInsetPercent"),
  };
}

function clampCalibrationValue(value: number) {
  return Math.max(CALIBRATION_MIN_PERCENT, Math.min(CALIBRATION_MAX_PERCENT, value));
}
