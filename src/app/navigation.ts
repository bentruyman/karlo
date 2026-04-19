import type { CabinetConfigDraft } from "./cabinet-config";

export type BrowseFocusZone = "modeBar" | "gameList";

export type ServiceSectionId = "launch" | "media" | "display" | "storage";

export type ServiceActionId = "defaults" | "save";

export type ServiceFieldKey = keyof CabinetConfigDraft;

export type ServiceFocusTarget =
  | { zone: "close" }
  | { zone: "sections"; index: number }
  | { zone: "field"; key: ServiceFieldKey }
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
  display: [
    "attractTimeoutSeconds",
    "topInsetPercent",
    "rightInsetPercent",
    "bottomInsetPercent",
    "leftInsetPercent",
  ],
};

export function getServiceSectionIndex(sectionId: ServiceSectionId) {
  return SERVICE_SECTIONS.findIndex((section) => section.id === sectionId);
}

export function getServiceFieldKeys(sectionId: ServiceSectionId): ServiceFieldKey[] {
  if (sectionId === "storage") return [];
  return SERVICE_SECTION_FIELDS[sectionId];
}

export function moveServiceFocus(
  current: ServiceFocusTarget,
  direction: ServiceMoveDirection,
  activeSection: ServiceSectionId,
): ServiceFocusTarget {
  const activeSectionIndex = getServiceSectionIndex(activeSection);
  const visibleFields = getServiceFieldKeys(activeSection);

  if (current.zone === "close") {
    if (direction === "right" || direction === "down") {
      return { zone: "sections", index: activeSectionIndex };
    }
    return current;
  }

  if (current.zone === "sections") {
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
      return visibleFields.length > 0
        ? { zone: "field", key: visibleFields[0] }
        : { zone: "actions", action: "defaults" };
    }

    if (direction === "right" || direction === "enter") {
      return visibleFields.length > 0
        ? { zone: "field", key: visibleFields[0] }
        : { zone: "actions", action: "defaults" };
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
      return { zone: "actions", action: "defaults" };
    }

    if (direction === "up") {
      return currentIndex === 0
        ? { zone: "sections", index: activeSectionIndex }
        : { zone: "field", key: visibleFields[currentIndex - 1] };
    }

    if (direction === "down") {
      return currentIndex === visibleFields.length - 1
        ? { zone: "actions", action: "defaults" }
        : { zone: "field", key: visibleFields[currentIndex + 1] };
    }

    return current;
  }

  if (direction === "left") {
    if (current.action === "save") return { zone: "actions", action: "defaults" };
    return visibleFields.length > 0
      ? { zone: "field", key: visibleFields[visibleFields.length - 1] }
      : { zone: "sections", index: activeSectionIndex };
  }

  if (direction === "right") {
    return current.action === "defaults"
      ? { zone: "actions", action: "save" }
      : current;
  }

  if (direction === "up") {
    return visibleFields.length > 0
      ? { zone: "field", key: visibleFields[visibleFields.length - 1] }
      : { zone: "sections", index: activeSectionIndex };
  }

  return current;
}
