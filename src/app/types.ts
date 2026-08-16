export type BrowseViewId =
  | "favorites"
  | "recent"
  | "genre"
  | "year"
  | "manufacturer";

export interface BrowseView {
  id: BrowseViewId;
  label: string;
  description: string;
}

export interface DisplayCalibration {
  topInsetPercent: number;
  rightInsetPercent: number;
  bottomInsetPercent: number;
  leftInsetPercent: number;
}

export interface CabinetPaths {
  mameExecutablePath: string;
  mameIniPath: string | null;
  romRoots: string[];
  mediaRoots: string[];
  previewVideoRoot: string;
  artworkRoot: string;
  categoryIniPath: string | null;
}

export interface CabinetConfig {
  displayProfile: string;
  paths: CabinetPaths;
  attractTimeoutSeconds: number;
  displayCalibration: DisplayCalibration;
}

export interface GameRecord {
  id: string;
  title: string;
  machineName: string;
  year: number;
  manufacturer: string;
  genre: string;
  romAvailable: boolean;
  videoPath?: string;
  artworkPaths: string[];
  isFavorite: boolean;
  wasRecentlyPlayed: boolean;
}

export interface ImportedGameRecord {
  machineName: string;
  title: string;
  year: number;
  manufacturer: string;
  genre: string;
  romAvailable: boolean;
  videoPath?: string;
  artworkPaths: string[];
}

export interface LibraryEntryRecord {
  machineName: string;
  isVisible: boolean;
  isFavorite: boolean;
  browseSortOrder?: number;
  attractSortOrder?: number;
  includeInAttractMode: boolean;
}

export interface RecentGameRecord {
  machineName: string;
  lastPlayedAt: string;
}

export interface FrontendBootstrap {
  defaultView: BrowseViewId;
  cabinetConfig: CabinetConfig;
  mediaHttpBaseUrl: string | null;
}

export interface LibrarySnapshot {
  importedGames: ImportedGameRecord[];
  libraryEntries: LibraryEntryRecord[];
  recentGames: RecentGameRecord[];
}

export interface LibraryMaintenanceResult {
  snapshot: LibrarySnapshot;
  importedGamesCount: number;
  romAvailableCount: number;
  message: string;
}
