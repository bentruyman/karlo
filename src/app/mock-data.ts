import type { BrowseView, BrowseViewId, GameRecord } from "./types";

export const browseViews: BrowseView[] = [
  {
    id: "favorites",
    label: "Favorites",
    description: "Default home shelf for the cabinet's keepers.",
  },
  {
    id: "recent",
    label: "Recently Played",
    description: "Quick return lane for the games touched last.",
  },
  {
    id: "genre",
    label: "By Genre",
    description: "Curated ordering to keep the library readable on a CRT.",
  },
  {
    id: "year",
    label: "By Year",
    description: "Timeline view for era-hopping without dense metadata.",
  },
  {
    id: "manufacturer",
    label: "By Maker",
    description: "Grouping by cabinet lineage and studio identity.",
  },
];

export const mockGames: GameRecord[] = [
  {
    id: "dkong3",
    title: "Donkey Kong 3",
    machineName: "dkong3",
    year: 1983,
    manufacturer: "Nintendo",
    genre: "Platform Shooter",
    description:
      "Fast, bright, and readable. A strong fit for a favorites-first showcase shelf.",
    marqueeText: "Dommy / Donkey Kong 3",
    attractCaption: "Spray the vines, hold the ladder lane, and keep the swarm off the garden.",
    isFavorite: true,
    wasRecentlyPlayed: true,
    accentPrimary: "#f34a3f",
    accentSecondary: "#f8d84f",
    cabinetColor: "#d61a24",
  },
  {
    id: "galaga",
    title: "Galaga",
    machineName: "galaga",
    year: 1981,
    manufacturer: "Namco",
    genre: "Fixed Shooter",
    description:
      "Clear silhouettes, large sprites, and strong attract motion make it ideal cabinet material.",
    marqueeText: "Challenge Stage",
    attractCaption: "Rack the fighter, bait the tractor beam, and cash in the challenge stage.",
    isFavorite: true,
    wasRecentlyPlayed: true,
    accentPrimary: "#1fd4ff",
    accentSecondary: "#f3ff65",
    cabinetColor: "#0f92d4",
  },
  {
    id: "mspacman",
    title: "Ms. Pac-Man",
    machineName: "mspacman",
    year: 1982,
    manufacturer: "Midway",
    genre: "Maze",
    description:
      "A cabinet staple with bold contrast and a preview loop that reads instantly at a distance.",
    marqueeText: "Ms. Pac-Man",
    attractCaption: "Corner routes, tunnel escapes, and fast pattern reads still hold up.",
    isFavorite: true,
    wasRecentlyPlayed: false,
    accentPrimary: "#ff6ab4",
    accentSecondary: "#ffe05a",
    cabinetColor: "#f64a93",
  },
  {
    id: "robotron",
    title: "Robotron: 2084",
    machineName: "robotron",
    year: 1982,
    manufacturer: "Williams",
    genre: "Arena Shooter",
    description:
      "Dense and violent, but still legible with the right focus framing and oversized UI chrome.",
    marqueeText: "Save the Last Human Family",
    attractCaption: "High panic, high clarity. The perfect test case for seamless launch and return.",
    isFavorite: false,
    wasRecentlyPlayed: true,
    accentPrimary: "#ff7a00",
    accentSecondary: "#fef08a",
    cabinetColor: "#ff5f1f",
  },
  {
    id: "joust",
    title: "Joust",
    machineName: "joust",
    year: 1982,
    manufacturer: "Williams",
    genre: "Platform Combat",
    description:
      "Strong cabinet identity and excellent side art potential without cluttering the selection flow.",
    marqueeText: "Flap Hard / Land Higher",
    attractCaption: "Keep the skyline open, own the top lane, and ride the egg cycle.",
    isFavorite: false,
    wasRecentlyPlayed: false,
    accentPrimary: "#7bff61",
    accentSecondary: "#f9f871",
    cabinetColor: "#4ecb39",
  },
  {
    id: "bublbobl",
    title: "Bubble Bobble",
    machineName: "bublbobl",
    year: 1986,
    manufacturer: "Taito",
    genre: "Platform",
    description:
      "Cheerful, readable, and useful for testing softer palettes against the CRT target.",
    marqueeText: "Bubble Bobble",
    attractCaption: "Bubble traps, route chains, and just enough chaos for attract mode.",
    isFavorite: true,
    wasRecentlyPlayed: false,
    accentPrimary: "#59c8ff",
    accentSecondary: "#ffb6ff",
    cabinetColor: "#23a5f6",
  },
  {
    id: "1942",
    title: "1942",
    machineName: "1942",
    year: 1984,
    manufacturer: "Capcom",
    genre: "Vertical Shooter",
    description:
      "Not the first-class layout target, but a good reminder that vertical cabinets still need graceful treatment later.",
    marqueeText: "Loop / Roll / Return",
    attractCaption: "Clipped here on purpose. Vertical support is deferred, not forgotten.",
    isFavorite: false,
    wasRecentlyPlayed: false,
    accentPrimary: "#27d2c4",
    accentSecondary: "#b9ff5b",
    cabinetColor: "#1d9f8d",
  },
  {
    id: "tapper",
    title: "Tapper",
    machineName: "tapper",
    year: 1983,
    manufacturer: "Bally Midway",
    genre: "Action",
    description:
      "A strong manufacturer and year browse candidate with very different cabinet personality.",
    marqueeText: "Rush the Bar / Catch the Mug",
    attractCaption: "Dense crowd motion, readable lanes, and bright cabinet branding.",
    isFavorite: false,
    wasRecentlyPlayed: true,
    accentPrimary: "#ffb84d",
    accentSecondary: "#ffdca8",
    cabinetColor: "#d98022",
  },
];

function compareByTitle(left: GameRecord, right: GameRecord) {
  return left.title.localeCompare(right.title);
}

export function getGamesForView(
  viewId: BrowseViewId,
  games: GameRecord[],
): { games: GameRecord[]; fallbackLabel?: string } {
  if (viewId === "favorites") {
    const favorites = games.filter((game) => game.isFavorite).sort(compareByTitle);

    if (favorites.length > 0) {
      return { games: favorites };
    }

    return {
      games: [...games].sort(compareByTitle),
      fallbackLabel: "Favorites are empty. Showing the full library instead.",
    };
  }

  if (viewId === "recent") {
    const recent = games
      .filter((game) => game.wasRecentlyPlayed)
      .sort((left, right) => left.title.localeCompare(right.title));

    return {
      games: recent.length > 0 ? recent : [...games].sort(compareByTitle),
      fallbackLabel:
        recent.length > 0 ? undefined : "No recent history yet. Showing the full library.",
    };
  }

  if (viewId === "genre") {
    return {
      games: [...games].sort((left, right) => {
        const genreMatch = left.genre.localeCompare(right.genre);
        return genreMatch === 0 ? compareByTitle(left, right) : genreMatch;
      }),
    };
  }

  if (viewId === "year") {
    return {
      games: [...games].sort((left, right) => {
        const yearMatch = left.year - right.year;
        return yearMatch === 0 ? compareByTitle(left, right) : yearMatch;
      }),
    };
  }

  return {
    games: [...games].sort((left, right) => {
      const makerMatch = left.manufacturer.localeCompare(right.manufacturer);
      return makerMatch === 0 ? compareByTitle(left, right) : makerMatch;
    }),
  };
}
