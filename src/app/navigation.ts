import type { CabinetConfigDraft } from "./cabinet-config";

export type BrowseFocusZone = "modeBar" | "gameList";

export type ServiceSectionId = "launch" | "media" | "display" | "storage";

export type ServiceActionId = "defaults" | "save";

export type ServicePanelActionId =
  | "importCatalog"
  | "scanRoms"
  | "openCalibration";

export type ServiceFieldKey = keyof CabinetConfigDraft;

export type ServiceFocusTarget =
  | { zone: "close" }
  | { zone: "sections"; index: number }
  | { zone: "field"; key: ServiceFieldKey }
  | { zone: "panelActions"; action: ServicePanelActionId }
  | { zone: "actions"; action: ServiceActionId };

export type ServiceMoveDirection = "up" | "down" | "left" | "right" | "enter";

export const SERVICE_SECTIONS: Array<{
  id: ServiceSectionId;
  label: string;
  detail: string;
}> = [
  { id: "launch", label: "Launch", detail: "MAME runtime paths" },
  { id: "media", label: "Library", detail: "ROM and media scan roots" },
  { id: "display", label: "Display", detail: "CRT timing and safe area" },
  { id: "storage", label: "Storage", detail: "SQLite boundary summary" },
];

const SERVICE_SECTION_FIELDS: Record<
  Exclude<ServiceSectionId, "storage">,
  ServiceFieldKey[]
> = {
  launch: ["mameExecutablePath", "mameIniPath"],
  media: [
    "romRootsText",
    "mediaRootsText",
    "previewVideoRoot",
    "artworkRoot",
  ],
  display: ["attractTimeoutSeconds"],
};

const SERVICE_SECTION_PANEL_ACTIONS: Partial<
  Record<ServiceSectionId, ServicePanelActionId[]>
> = {
  launch: ["importCatalog"],
  media: ["scanRoms"],
  display: ["openCalibration"],
};

export function getServiceSectionIndex(sectionId: ServiceSectionId) {
  return SERVICE_SECTIONS.findIndex((section) => section.id === sectionId);
}

export function getServiceFieldKeys(sectionId: ServiceSectionId): ServiceFieldKey[] {
  if (sectionId === "storage") return [];
  return SERVICE_SECTION_FIELDS[sectionId];
}

export function getServicePanelActions(
  sectionId: ServiceSectionId,
): ServicePanelActionId[] {
  return SERVICE_SECTION_PANEL_ACTIONS[sectionId] ?? [];
}

export function moveServiceFocus(
  current: ServiceFocusTarget,
  direction: ServiceMoveDirection,
  activeSection: ServiceSectionId,
): ServiceFocusTarget {
  const activeSectionIndex = getServiceSectionIndex(activeSection);
  const visibleFields = getServiceFieldKeys(activeSection);
  const visiblePanelActions = getServicePanelActions(activeSection);

  function firstSectionTarget(sectionId: ServiceSectionId): ServiceFocusTarget {
    const sectionFields = getServiceFieldKeys(sectionId);
    const sectionPanelActions = getServicePanelActions(sectionId);

    if (sectionFields.length > 0) {
      return { zone: "field", key: sectionFields[0] };
    }

    if (sectionPanelActions.length > 0) {
      return { zone: "panelActions", action: sectionPanelActions[0] };
    }

    return { zone: "actions", action: "defaults" };
  }

  if (current.zone === "close") {
    if (direction === "right" || direction === "down") {
      return { zone: "sections", index: activeSectionIndex };
    }
    return current;
  }

  if (current.zone === "sections") {
    const sectionId = SERVICE_SECTIONS[current.index]?.id ?? activeSection;

    if (direction === "left") return { zone: "close" };

    if (direction === "up") {
      return current.index === 0
        ? { zone: "close" }
        : { zone: "sections", index: current.index - 1 };
    }

    if (direction === "down") {
      if (current.index < SERVICE_SECTIONS.length - 1) {
        return { zone: "sections", index: current.index + 1 };
      }
      return firstSectionTarget(sectionId);
    }

    if (direction === "right" || direction === "enter") {
      return firstSectionTarget(sectionId);
    }

    return current;
  }

  if (current.zone === "field") {
    const currentIndex = visibleFields.indexOf(current.key);
    if (currentIndex === -1) {
      return visibleFields.length > 0
        ? { zone: "field", key: visibleFields[0] }
        : { zone: "sections", index: activeSectionIndex };
    }

    if (direction === "left") {
      return { zone: "sections", index: activeSectionIndex };
    }

    if (direction === "right") {
      return visiblePanelActions.length > 0
        ? { zone: "panelActions", action: visiblePanelActions[0] }
        : { zone: "actions", action: "defaults" };
    }

    if (direction === "up") {
      return currentIndex === 0
        ? { zone: "sections", index: activeSectionIndex }
        : { zone: "field", key: visibleFields[currentIndex - 1] };
    }

    if (direction === "down") {
      return currentIndex === visibleFields.length - 1
        ? visiblePanelActions.length > 0
          ? { zone: "panelActions", action: visiblePanelActions[0] }
          : { zone: "actions", action: "defaults" }
        : { zone: "field", key: visibleFields[currentIndex + 1] };
    }

    return current;
  }

  if (current.zone === "panelActions") {
    const currentIndex = visiblePanelActions.indexOf(current.action);
    if (currentIndex === -1) {
      return visiblePanelActions.length > 0
        ? { zone: "panelActions", action: visiblePanelActions[0] }
        : { zone: "sections", index: activeSectionIndex };
    }

    if (direction === "left") {
      return visibleFields.length > 0
        ? { zone: "field", key: visibleFields[visibleFields.length - 1] }
        : { zone: "sections", index: activeSectionIndex };
    }

    if (direction === "right") {
      return { zone: "actions", action: "defaults" };
    }

    if (direction === "up") {
      return visibleFields.length > 0
        ? { zone: "field", key: visibleFields[visibleFields.length - 1] }
        : { zone: "sections", index: activeSectionIndex };
    }

    if (direction === "down") {
      return currentIndex === visiblePanelActions.length - 1
        ? { zone: "actions", action: "defaults" }
        : { zone: "panelActions", action: visiblePanelActions[currentIndex + 1] };
    }

    return current;
  }

  if (direction === "left") {
    if (current.action === "save") return { zone: "actions", action: "defaults" };
    if (visiblePanelActions.length > 0) {
      return {
        zone: "panelActions",
        action: visiblePanelActions[visiblePanelActions.length - 1],
      };
    }
    if (visibleFields.length > 0) {
      return { zone: "field", key: visibleFields[visibleFields.length - 1] };
    }
    return { zone: "sections", index: activeSectionIndex };
  }

  if (direction === "right") {
    return current.action === "defaults"
      ? { zone: "actions", action: "save" }
      : current;
  }

  if (direction === "up") {
    if (visiblePanelActions.length > 0) {
      return {
        zone: "panelActions",
        action: visiblePanelActions[visiblePanelActions.length - 1],
      };
    }
    if (visibleFields.length > 0) {
      return { zone: "field", key: visibleFields[visibleFields.length - 1] };
    }
    return { zone: "sections", index: activeSectionIndex };
  }

  return current;
}
