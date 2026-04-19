import type {
  BrowseViewId,
  GameRecord,
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
  attractCaption?: string;
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
  videoPath: game.attractCaption
    ? `media/previews/${game.machineName}.mp4`
    : undefined,
  artworkPaths: game.attractCaption
    ? [`media/artwork/${game.machineName}.png`]
    : [],
  attractCaption: game.attractCaption,
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
    lastPlayedAt: seedRecentTimestamp(index),
  }));

function seedRecentTimestamp(index: number) {
  return String(1776470400 + index);
}

function compareByTitle(left: GameRecord, right: GameRecord) {
  return left.title.localeCompare(right.title);
}

export function buildGameRecords(
  importedGames: ImportedGameRecord[],
  libraryEntries: LibraryEntryRecord[],
  recentGames: RecentGameRecord[],
): GameRecord[] {
  const libraryByMachine = new Map(
    libraryEntries.map((entry) => [entry.machineName, entry]),
  );
  const recentByMachine = new Set(
    recentGames.map((recentGame) => recentGame.machineName),
  );

  return importedGames
    .flatMap((game) => {
      const libraryEntry = libraryByMachine.get(game.machineName);
      if (!libraryEntry?.isVisible) return [];

      return [
        {
          id: game.machineName,
          ...game,
          isFavorite: libraryEntry.isFavorite,
          wasRecentlyPlayed: recentByMachine.has(game.machineName),
        },
      ];
    })
    .sort((left, right) => {
      const leftOrder =
        libraryByMachine.get(left.machineName)?.browseSortOrder ??
        Number.MAX_SAFE_INTEGER;
      const rightOrder =
        libraryByMachine.get(right.machineName)?.browseSortOrder ??
        Number.MAX_SAFE_INTEGER;
      return leftOrder === rightOrder
        ? compareByTitle(left, right)
        : leftOrder - rightOrder;
    });
}

export function getGamesForView(
  viewId: BrowseViewId,
  games: GameRecord[],
): { games: GameRecord[]; fallbackLabel?: string } {
  if (viewId === "favorites") {
    const favorites = games.filter((g) => g.isFavorite).sort(compareByTitle);
    if (favorites.length > 0) return { games: favorites };
    return {
      games: [...games].sort(compareByTitle),
      fallbackLabel: "No favorites yet — showing full library",
    };
  }

  if (viewId === "recent") {
    const recent = games.filter((g) => g.wasRecentlyPlayed).sort(compareByTitle);
    if (recent.length > 0) return { games: recent };
    return {
      games: [...games].sort(compareByTitle),
      fallbackLabel: "No recent history — showing full library",
    };
  }

  if (viewId === "genre") {
    return {
      games: [...games].sort((left, right) => {
        const genreComparison = left.genre.localeCompare(right.genre);
        return genreComparison === 0
          ? compareByTitle(left, right)
          : genreComparison;
      }),
    };
  }

  if (viewId === "year") {
    return {
      games: [...games].sort((left, right) => {
        const yearComparison = left.year - right.year;
        return yearComparison === 0
          ? compareByTitle(left, right)
          : yearComparison;
      }),
    };
  }

  return {
    games: [...games].sort((left, right) => {
      const manufacturerComparison = left.manufacturer.localeCompare(
        right.manufacturer,
      );
      return manufacturerComparison === 0
        ? compareByTitle(left, right)
        : manufacturerComparison;
    }),
  };
}
