import type {
  BrowseViewId,
  GameRecord,
  ImportedGameRecord,
  LibraryEntryRecord,
  RecentGameRecord,
} from "./types";

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

const rawCatalog: MockCatalogSeed[] = [
  { machineName: "1942", title: "1942", year: 1984, manufacturer: "Capcom", genre: "Vertical Shooter" },
  { machineName: "asteroid", title: "Asteroids", year: 1979, manufacturer: "Atari", genre: "Vector Shooter", isFavorite: true, attractCaption: "Rock the vectors. Hold the center." },
  { machineName: "bzone", title: "Battlezone", year: 1980, manufacturer: "Atari", genre: "Vector Tank" },
  { machineName: "berzerk", title: "Berzerk", year: 1980, manufacturer: "Stern", genre: "Maze Shooter" },
  { machineName: "bublbobl", title: "Bubble Bobble", year: 1986, manufacturer: "Taito", genre: "Platform", isFavorite: true, attractCaption: "Bubble the dragons. Clear the room." },
  { machineName: "btime", title: "Burger Time", year: 1982, manufacturer: "Data East", genre: "Action" },
  { machineName: "centiped", title: "Centipede", year: 1980, manufacturer: "Atari", genre: "Fixed Shooter", wasRecentlyPlayed: true },
  { machineName: "defender", title: "Defender", year: 1981, manufacturer: "Williams", genre: "Side Shooter" },
  { machineName: "digdug", title: "Dig Dug", year: 1982, manufacturer: "Namco", genre: "Action", isFavorite: true },
  { machineName: "dkong", title: "Donkey Kong", year: 1981, manufacturer: "Nintendo", genre: "Platform", isFavorite: true, wasRecentlyPlayed: true, attractCaption: "Climb the girders. Save the Pauline." },
  { machineName: "dkong3", title: "Donkey Kong 3", year: 1983, manufacturer: "Nintendo", genre: "Platform Shooter" },
  { machineName: "dkongjr", title: "Donkey Kong Jr.", year: 1982, manufacturer: "Nintendo", genre: "Platform", wasRecentlyPlayed: true },
  { machineName: "ddragon", title: "Double Dragon", year: 1987, manufacturer: "Technos", genre: "Beat 'em Up" },
  { machineName: "dlair", title: "Dragon's Lair", year: 1983, manufacturer: "Cinematronics", genre: "Laserdisc" },
  { machineName: "frogger", title: "Frogger", year: 1981, manufacturer: "Konami", genre: "Action", isFavorite: true, attractCaption: "Cross the road. Mind the log." },
  { machineName: "galaga", title: "Galaga", year: 1981, manufacturer: "Namco", genre: "Fixed Shooter", isFavorite: true, wasRecentlyPlayed: true, attractCaption: "Bait the tractor beam." },
  { machineName: "galaxian", title: "Galaxian", year: 1979, manufacturer: "Namco", genre: "Fixed Shooter" },
  { machineName: "gauntlet", title: "Gauntlet", year: 1985, manufacturer: "Atari", genre: "Dungeon", attractCaption: "Elf needs food badly." },
  { machineName: "gyruss", title: "Gyruss", year: 1983, manufacturer: "Konami", genre: "Tube Shooter" },
  { machineName: "joust", title: "Joust", year: 1982, manufacturer: "Williams", genre: "Platform Combat", wasRecentlyPlayed: true },
  { machineName: "jrpacman", title: "Jr. Pac-Man", year: 1983, manufacturer: "Midway", genre: "Maze" },
  { machineName: "kungfum", title: "Kung-Fu Master", year: 1984, manufacturer: "Irem", genre: "Beat 'em Up" },
  { machineName: "marble", title: "Marble Madness", year: 1984, manufacturer: "Atari", genre: "Maze" },
  { machineName: "mrdo", title: "Mr. Do!", year: 1982, manufacturer: "Universal", genre: "Maze" },
  { machineName: "mspacman", title: "Ms. Pac-Man", year: 1982, manufacturer: "Midway", genre: "Maze", isFavorite: true, attractCaption: "Corner routes and tunnel escapes." },
  { machineName: "pacman", title: "Pac-Man", year: 1980, manufacturer: "Midway", genre: "Maze", isFavorite: true, wasRecentlyPlayed: true },
  { machineName: "paperboy", title: "Paperboy", year: 1985, manufacturer: "Atari", genre: "Action" },
  { machineName: "pengo", title: "Pengo", year: 1982, manufacturer: "Sega", genre: "Maze" },
  { machineName: "polepos", title: "Pole Position", year: 1982, manufacturer: "Namco", genre: "Racing" },
  { machineName: "qbert", title: "Q*bert", year: 1982, manufacturer: "Gottlieb", genre: "Action", attractCaption: "Hop the cubes. Dodge the snake." },
  { machineName: "rallyx", title: "Rally-X", year: 1980, manufacturer: "Namco", genre: "Racing" },
  { machineName: "robotron", title: "Robotron: 2084", year: 1982, manufacturer: "Williams", genre: "Arena Shooter", isFavorite: true, attractCaption: "Save the last human family." },
  { machineName: "invaders", title: "Space Invaders", year: 1978, manufacturer: "Taito", genre: "Fixed Shooter", isFavorite: true },
  { machineName: "spyhunt", title: "Spy Hunter", year: 1983, manufacturer: "Bally Midway", genre: "Racing", wasRecentlyPlayed: true },
  { machineName: "starwars", title: "Star Wars", year: 1983, manufacturer: "Atari", genre: "Vector Shooter" },
  { machineName: "tapper", title: "Tapper", year: 1983, manufacturer: "Bally Midway", genre: "Action" },
  { machineName: "tempest", title: "Tempest", year: 1981, manufacturer: "Atari", genre: "Tube Shooter", isFavorite: true },
  { machineName: "timeplt", title: "Time Pilot", year: 1982, manufacturer: "Konami", genre: "Shooter" },
  { machineName: "tron", title: "Tron", year: 1982, manufacturer: "Bally Midway", genre: "Action" },
  { machineName: "tutankhm", title: "Tutankham", year: 1982, manufacturer: "Konami", genre: "Maze" },
  { machineName: "xevious", title: "Xevious", year: 1982, manufacturer: "Namco", genre: "Vertical Shooter" },
  { machineName: "zaxxon", title: "Zaxxon", year: 1982, manufacturer: "Sega", genre: "Isometric Shooter" },
];

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
    lastPlayedAt: new Date(Date.UTC(2026, 3, 18, 0, index)).toISOString(),
  }));

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
