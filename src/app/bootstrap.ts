import { invoke } from "@tauri-apps/api/core";

import type {
  BrowseView,
  CabinetConfig,
  FrontendBootstrap,
  LibraryMaintenanceResult,
  LibrarySnapshot,
  RuntimeContract,
} from "./types";
import {
  mockImportedGames,
  mockLibraryEntries,
  mockRecentGames,
} from "./mock-data";

export const DEFAULT_BROWSE_VIEWS: BrowseView[] = [
  { id: "favorites", label: "Favorites", description: "Cabinet keepers" },
  { id: "recent", label: "Recent", description: "Last touched" },
  { id: "genre", label: "Genre", description: "Sorted by genre" },
  { id: "year", label: "Year", description: "Sorted by release" },
  { id: "manufacturer", label: "Maker", description: "Sorted by studio" },
];

export const DEFAULT_RUNTIME_CONTRACT: RuntimeContract = {
  settings: {
    table: "settings",
    owner: "rust",
    requiredKeys: [
      {
        key: "mame_executable_path",
        purpose: "MAME launcher executable used for cabinet launches.",
        kind: "path",
        required: true,
      },
      {
        key: "mame_ini_path",
        purpose: "Optional mame.ini path used to align cabinet runtime behavior.",
        kind: "optionalPath",
        required: false,
      },
      {
        key: "rom_roots_json",
        purpose: "Configured ROM roots scanned during manual import.",
        kind: "pathList",
        required: true,
      },
      {
        key: "media_roots_json",
        purpose: "Configured media roots scanned during reconciliation.",
        kind: "pathList",
        required: true,
      },
      {
        key: "preview_video_root",
        purpose: "Preferred preview-video root used for cabinet playback.",
        kind: "path",
        required: true,
      },
      {
        key: "artwork_root",
        purpose: "Preferred artwork root used for marquees and flyers.",
        kind: "path",
        required: true,
      },
      {
        key: "attract_timeout_seconds",
        purpose: "Idle timeout before attract mode starts cycling.",
        kind: "seconds",
        required: true,
      },
      {
        key: "display_calibration_json",
        purpose: "CRT-safe inset and overscan calibration values.",
        kind: "calibration",
        required: true,
      },
    ],
  },
  importedCatalog: {
    table: "games",
    identityField: "machine_name",
    romAvailabilityField: "rom_available",
    mediaFields: ["video_path", "artwork_paths_json"],
    curationBoundary:
      "Imported MAME metadata remains separate from cabinet-visible library entries.",
  },
  curation: {
    importedCatalogTable: "games",
    curatedLibraryTable: "library_entries",
    recentHistoryTable: "recent_games",
    visibleLibraryRule:
      "Browse views operate on visible curated library entries, not the full imported catalog.",
    favoritesFallbackRule:
      "If no favorites exist, the cabinet falls back to the visible library.",
    browseViews: DEFAULT_BROWSE_VIEWS,
  },
};

export const DEFAULT_FRONTEND_BOOTSTRAP: FrontendBootstrap = {
  defaultView: "favorites",
  cabinetConfig: {
    displayProfile: "crt-480i-4:3",
    paths: {
      mameExecutablePath: "",
      mameIniPath: null,
      romRoots: [],
      mediaRoots: [],
      previewVideoRoot: "",
      artworkRoot: "",
    },
    attractTimeoutSeconds: 12,
    displayCalibration: {
      topInsetPercent: 5,
      rightInsetPercent: 5,
      bottomInsetPercent: 5,
      leftInsetPercent: 5,
    },
  },
  curation: DEFAULT_RUNTIME_CONTRACT.curation,
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

export async function loadRuntimeContract(): Promise<RuntimeContract> {
  try {
    return await invoke<RuntimeContract>("get_runtime_contract");
  } catch {
    return DEFAULT_RUNTIME_CONTRACT;
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

export async function recordRecentGame(
  machineName: string,
): Promise<LibrarySnapshot> {
  return await invoke<LibrarySnapshot>("record_recent_game", { machineName });
}

export async function importMameCatalog(): Promise<LibraryMaintenanceResult> {
  return await invoke<LibraryMaintenanceResult>("import_mame_catalog");
}

export async function scanRomRoots(): Promise<LibraryMaintenanceResult> {
  return await invoke<LibraryMaintenanceResult>("scan_rom_roots");
}
