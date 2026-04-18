import type { BrowseView, BrowseViewId, GameRecord } from "./types";

export const browseViews: BrowseView[] = [
  { id: "favorites", label: "Favorites", description: "Cabinet keepers" },
  { id: "recent", label: "Recent", description: "Last touched" },
  { id: "genre", label: "Genre", description: "Sorted by genre" },
  { id: "year", label: "Year", description: "Sorted by release" },
  { id: "manufacturer", label: "Maker", description: "Sorted by studio" },
];

export const mockGames: GameRecord[] = [
  { id: "1942", title: "1942", machineName: "1942", year: 1984, manufacturer: "Capcom", genre: "Vertical Shooter" },
  { id: "asteroid", title: "Asteroids", machineName: "asteroid", year: 1979, manufacturer: "Atari", genre: "Vector Shooter", isFavorite: true, attractCaption: "Rock the vectors. Hold the center." },
  { id: "bzone", title: "Battlezone", machineName: "bzone", year: 1980, manufacturer: "Atari", genre: "Vector Tank" },
  { id: "berzerk", title: "Berzerk", machineName: "berzerk", year: 1980, manufacturer: "Stern", genre: "Maze Shooter" },
  { id: "bublbobl", title: "Bubble Bobble", machineName: "bublbobl", year: 1986, manufacturer: "Taito", genre: "Platform", isFavorite: true, attractCaption: "Bubble the dragons. Clear the room." },
  { id: "btime", title: "Burger Time", machineName: "btime", year: 1982, manufacturer: "Data East", genre: "Action" },
  { id: "centiped", title: "Centipede", machineName: "centiped", year: 1980, manufacturer: "Atari", genre: "Fixed Shooter", wasRecentlyPlayed: true },
  { id: "defender", title: "Defender", machineName: "defender", year: 1981, manufacturer: "Williams", genre: "Side Shooter" },
  { id: "digdug", title: "Dig Dug", machineName: "digdug", year: 1982, manufacturer: "Namco", genre: "Action", isFavorite: true },
  { id: "dkong", title: "Donkey Kong", machineName: "dkong", year: 1981, manufacturer: "Nintendo", genre: "Platform", isFavorite: true, wasRecentlyPlayed: true, attractCaption: "Climb the girders. Save the Pauline." },
  { id: "dkong3", title: "Donkey Kong 3", machineName: "dkong3", year: 1983, manufacturer: "Nintendo", genre: "Platform Shooter" },
  { id: "dkongjr", title: "Donkey Kong Jr.", machineName: "dkongjr", year: 1982, manufacturer: "Nintendo", genre: "Platform", wasRecentlyPlayed: true },
  { id: "ddragon", title: "Double Dragon", machineName: "ddragon", year: 1987, manufacturer: "Technos", genre: "Beat 'em Up" },
  { id: "dlair", title: "Dragon's Lair", machineName: "dlair", year: 1983, manufacturer: "Cinematronics", genre: "Laserdisc" },
  { id: "frogger", title: "Frogger", machineName: "frogger", year: 1981, manufacturer: "Konami", genre: "Action", isFavorite: true, attractCaption: "Cross the road. Mind the log." },
  { id: "galaga", title: "Galaga", machineName: "galaga", year: 1981, manufacturer: "Namco", genre: "Fixed Shooter", isFavorite: true, wasRecentlyPlayed: true, attractCaption: "Bait the tractor beam." },
  { id: "galaxian", title: "Galaxian", machineName: "galaxian", year: 1979, manufacturer: "Namco", genre: "Fixed Shooter" },
  { id: "gauntlet", title: "Gauntlet", machineName: "gauntlet", year: 1985, manufacturer: "Atari", genre: "Dungeon", attractCaption: "Elf needs food badly." },
  { id: "gyruss", title: "Gyruss", machineName: "gyruss", year: 1983, manufacturer: "Konami", genre: "Tube Shooter" },
  { id: "joust", title: "Joust", machineName: "joust", year: 1982, manufacturer: "Williams", genre: "Platform Combat", wasRecentlyPlayed: true },
  { id: "jrpacman", title: "Jr. Pac-Man", machineName: "jrpacman", year: 1983, manufacturer: "Midway", genre: "Maze" },
  { id: "kungfum", title: "Kung-Fu Master", machineName: "kungfum", year: 1984, manufacturer: "Irem", genre: "Beat 'em Up" },
  { id: "marble", title: "Marble Madness", machineName: "marble", year: 1984, manufacturer: "Atari", genre: "Maze" },
  { id: "mrdo", title: "Mr. Do!", machineName: "mrdo", year: 1982, manufacturer: "Universal", genre: "Maze" },
  { id: "mspacman", title: "Ms. Pac-Man", machineName: "mspacman", year: 1982, manufacturer: "Midway", genre: "Maze", isFavorite: true, attractCaption: "Corner routes and tunnel escapes." },
  { id: "pacman", title: "Pac-Man", machineName: "pacman", year: 1980, manufacturer: "Midway", genre: "Maze", isFavorite: true, wasRecentlyPlayed: true },
  { id: "paperboy", title: "Paperboy", machineName: "paperboy", year: 1985, manufacturer: "Atari", genre: "Action" },
  { id: "pengo", title: "Pengo", machineName: "pengo", year: 1982, manufacturer: "Sega", genre: "Maze" },
  { id: "polepos", title: "Pole Position", machineName: "polepos", year: 1982, manufacturer: "Namco", genre: "Racing" },
  { id: "qbert", title: "Q*bert", machineName: "qbert", year: 1982, manufacturer: "Gottlieb", genre: "Action", attractCaption: "Hop the cubes. Dodge the snake." },
  { id: "rallyx", title: "Rally-X", machineName: "rallyx", year: 1980, manufacturer: "Namco", genre: "Racing" },
  { id: "robotron", title: "Robotron: 2084", machineName: "robotron", year: 1982, manufacturer: "Williams", genre: "Arena Shooter", isFavorite: true, attractCaption: "Save the last human family." },
  { id: "invaders", title: "Space Invaders", machineName: "invaders", year: 1978, manufacturer: "Taito", genre: "Fixed Shooter", isFavorite: true },
  { id: "spyhunt", title: "Spy Hunter", machineName: "spyhunt", year: 1983, manufacturer: "Bally Midway", genre: "Racing", wasRecentlyPlayed: true },
  { id: "starwars", title: "Star Wars", machineName: "starwars", year: 1983, manufacturer: "Atari", genre: "Vector Shooter" },
  { id: "tapper", title: "Tapper", machineName: "tapper", year: 1983, manufacturer: "Bally Midway", genre: "Action" },
  { id: "tempest", title: "Tempest", machineName: "tempest", year: 1981, manufacturer: "Atari", genre: "Tube Shooter", isFavorite: true },
  { id: "timeplt", title: "Time Pilot", machineName: "timeplt", year: 1982, manufacturer: "Konami", genre: "Shooter" },
  { id: "tron", title: "Tron", machineName: "tron", year: 1982, manufacturer: "Bally Midway", genre: "Action" },
  { id: "tutankhm", title: "Tutankham", machineName: "tutankhm", year: 1982, manufacturer: "Konami", genre: "Maze" },
  { id: "xevious", title: "Xevious", machineName: "xevious", year: 1982, manufacturer: "Namco", genre: "Vertical Shooter" },
  { id: "zaxxon", title: "Zaxxon", machineName: "zaxxon", year: 1982, manufacturer: "Sega", genre: "Isometric Shooter" },
];

function compareByTitle(left: GameRecord, right: GameRecord) {
  return left.title.localeCompare(right.title);
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
