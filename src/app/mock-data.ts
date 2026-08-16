import type {
  ImportedGameRecord,
  LibraryEntryRecord,
  RecentGameRecord,
} from "./types";
import rawCatalogData from "./mock-catalog.json";

type MockCatalogSeed = {
  machineName: string;
  title: string;
  year: number;
  manufacturer: string;
  genre: string;
  hasMedia?: boolean;
  isFavorite?: boolean;
  wasRecentlyPlayed?: boolean;
};

const rawCatalog: MockCatalogSeed[] = rawCatalogData;

export const mockImportedGames: ImportedGameRecord[] = rawCatalog.map((game) => ({
  machineName: game.machineName,
  title: game.title,
  year: game.year,
  manufacturer: game.manufacturer,
  genre: game.genre,
  romAvailable: true,
  videoPath: game.hasMedia
    ? `media/previews/${game.machineName}.mp4`
    : undefined,
  artworkPaths: game.hasMedia
    ? [`media/artwork/${game.machineName}.png`]
    : [],
}));

export const mockLibraryEntries: LibraryEntryRecord[] = rawCatalog.map(
  (game, index) => ({
    machineName: game.machineName,
    isVisible: true,
    isFavorite: Boolean(game.isFavorite),
    browseSortOrder: index,
    attractSortOrder: index,
    includeInAttractMode: true,
  }),
);

export const mockRecentGames: RecentGameRecord[] = rawCatalog
  .filter((game) => game.wasRecentlyPlayed)
  .map((game, index) => ({
    machineName: game.machineName,
    lastPlayedAt: String(1776470400 + index),
  }));
