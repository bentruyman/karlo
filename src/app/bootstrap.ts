import { invoke } from "@tauri-apps/api/core";

import type {
  BrowseView,
  CabinetConfig,
  FrontendBootstrap,
  LibraryMaintenanceResult,
  LibrarySnapshot,
} from "./types";
import {
  mockImportedGames,
  mockLibraryEntries,
  mockRecentGames,
} from "./mock-data";

export const BROWSE_VIEWS: BrowseView[] = [
  { id: "favorites", label: "Favorites", description: "Cabinet keepers" },
  { id: "recent", label: "Recent", description: "Last touched" },
  { id: "genre", label: "Genre", description: "Sorted by genre" },
  { id: "year", label: "Year", description: "Sorted by release" },
  { id: "manufacturer", label: "Maker", description: "Sorted by studio" },
];

export const DEFAULT_FRONTEND_BOOTSTRAP: FrontendBootstrap = {
  defaultView: "favorites",
  cabinetConfig: {
    displayProfile: "lcd-1440p-16:9",
    paths: {
      mameExecutablePath: "",
      mameIniPath: null,
      romRoots: [],
      mediaRoots: [],
      previewVideoRoot: "",
      artworkRoot: "",
      categoryIniPath: "/srv/karlo/library/metadata/Category.ini",
    },
    attractTimeoutSeconds: 12,
    displayCalibration: {
      topInsetPercent: 1,
      rightInsetPercent: 1,
      bottomInsetPercent: 1,
      leftInsetPercent: 1,
    },
  },
  mediaHttpBaseUrl: null,
};

export const DEFAULT_LIBRARY_SNAPSHOT: LibrarySnapshot = {
  importedGames: mockImportedGames,
  libraryEntries: mockLibraryEntries,
  recentGames: mockRecentGames,
};

export async function loadFrontendBootstrap(): Promise<FrontendBootstrap> {
  try {
    return await invoke<FrontendBootstrap>("get_frontend_bootstrap");
  } catch {
    return DEFAULT_FRONTEND_BOOTSTRAP;
  }
}

export async function loadCabinetConfig(): Promise<CabinetConfig> {
  try {
    return await invoke<CabinetConfig>("get_cabinet_config");
  } catch {
    return DEFAULT_FRONTEND_BOOTSTRAP.cabinetConfig;
  }
}

export async function saveCabinetConfig(
  cabinetConfig: CabinetConfig,
): Promise<CabinetConfig> {
  return await invoke<CabinetConfig>("save_cabinet_config", { cabinetConfig });
}

export async function loadLibrarySnapshot(): Promise<LibrarySnapshot> {
  try {
    return await invoke<LibrarySnapshot>("get_library_snapshot");
  } catch {
    return DEFAULT_LIBRARY_SNAPSHOT;
  }
}

export async function toggleGameFavorite(
  machineName: string,
): Promise<LibrarySnapshot> {
  return await invoke<LibrarySnapshot>("toggle_game_favorite", { machineName });
}

export async function launchMameGame(
  machineName: string,
): Promise<LibrarySnapshot> {
  return await invoke<LibrarySnapshot>("launch_mame_game", { machineName });
}

export async function scanRomRoots(): Promise<LibraryMaintenanceResult> {
  return await invoke<LibraryMaintenanceResult>("scan_rom_roots");
}

export async function reportFrontendDiagnostic(
  event: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await invoke("report_frontend_diagnostic", {
      event,
      details: JSON.stringify(details),
    });
  } catch {
    // Diagnostics must never interrupt cabinet browsing.
  }
}
