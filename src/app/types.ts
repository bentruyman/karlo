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
}

export interface CabinetConfig {
  displayProfile: string;
  paths: CabinetPaths;
  attractTimeoutSeconds: number;
  displayCalibration: DisplayCalibration;
}

export type ConfigValueKind =
  | "path"
  | "optionalPath"
  | "pathList"
  | "seconds"
  | "calibration";

export interface ConfigKeyDefinition {
  key: string;
  purpose: string;
  kind: ConfigValueKind;
  required: boolean;
}

export interface SettingsContract {
  table: string;
  owner: string;
  requiredKeys: ConfigKeyDefinition[];
}

export interface ImportedCatalogContract {
  table: string;
  identityField: string;
  romAvailabilityField: string;
  mediaFields: string[];
  curationBoundary: string;
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
  attractCaption?: string;
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
  attractCaption?: string;
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

export interface CurationContract {
  importedCatalogTable: string;
  curatedLibraryTable: string;
  recentHistoryTable: string;
  visibleLibraryRule: string;
  favoritesFallbackRule: string;
  browseViews: BrowseView[];
}

export interface RuntimeContract {
  settings: SettingsContract;
  importedCatalog: ImportedCatalogContract;
  curation: CurationContract;
}

export interface FrontendBootstrap {
  defaultView: BrowseViewId;
  cabinetConfig: CabinetConfig;
  curation: CurationContract;
}

export interface LibrarySnapshot {
  importedGames: ImportedGameRecord[];
  libraryEntries: LibraryEntryRecord[];
  recentGames: RecentGameRecord[];
}
