import { clampIndex, getTitleBucket, jumpLetter, wrapIndex } from "./browse";
import type {
  BrowseViewId,
  GameRecord,
  ImportedGameRecord,
  LibraryEntryRecord,
  RecentGameRecord,
} from "./types";

export interface BrowseGroupState {
  currentLabel: string;
  labels: string[];
  mode: "titleBucket" | "facet";
}

export interface BrowseViewSummary {
  statLabel: string;
  statValue: number;
}

const TRAILING_TITLE_METADATA_PATTERN = /\s*(?:\(([^()]*)\)|\[([^\]]*)\])\s*$/;
const TITLE_METADATA_MARKERS = [
  /\b(?:rev(?:ision)?|set|ver(?:sion)?|proto(?:type)?|bootleg|hack)\b/i,
  /\b(?:u\.?s\.?a?|japan(?:ese)?|world|euro(?:pe|pean)?|asia(?:n)?|korea(?:n)?|taiwan(?:ese)?|china|chinese|hong kong|brazil(?:ian)?|canada|canadian|australia(?:n)?|new zealand|nz|italy|italian|france|french|germany|german|spain|spanish|uk)\b/i,
  /\b(?:[a-z]{2,4}\d{2,}|\d{6,})\b/i,
];

function compareByTitle(left: GameRecord, right: GameRecord) {
  return left.title.localeCompare(right.title);
}

export function formatGameTitleForDisplay(title: string) {
  const fallback = title.trim();
  let displayTitle = fallback.replace(/\s+/g, " ");

  while (displayTitle.length > 0) {
    const match = displayTitle.match(TRAILING_TITLE_METADATA_PATTERN);
    if (!match?.index) break;

    const metadata = match[1] ?? match[2] ?? "";
    if (!TITLE_METADATA_MARKERS.some((marker) => marker.test(metadata))) break;

    displayTitle = displayTitle.slice(0, match.index).trim();
  }

  return displayTitle || fallback;
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
      if (!libraryEntry?.isVisible || !game.romAvailable) return [];

      return [
        {
          id: game.machineName,
          ...game,
          title: formatGameTitleForDisplay(game.title),
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

export function getBrowseGroupLabel(viewId: BrowseViewId, game: GameRecord) {
  if (viewId === "genre") return game.genre;
  if (viewId === "year") return String(game.year);
  if (viewId === "manufacturer") return game.manufacturer;
  return getTitleBucket(game.title);
}

export function getBrowseGroupState(
  viewId: BrowseViewId,
  games: GameRecord[],
  selectedIndex: number,
): BrowseGroupState {
  if (games.length === 0) {
    return {
      currentLabel: "",
      labels: [],
      mode: isTitleBucketView(viewId) ? "titleBucket" : "facet",
    };
  }

  const activeIndex = clampIndex(selectedIndex, games.length);
  const labels = orderedDistinctLabels(
    games.map((game) => getBrowseGroupLabel(viewId, game)),
  );

  return {
    currentLabel: getBrowseGroupLabel(viewId, games[activeIndex]),
    labels,
    mode: isTitleBucketView(viewId) ? "titleBucket" : "facet",
  };
}

export function jumpBrowseGroup(
  viewId: BrowseViewId,
  games: GameRecord[],
  current: number,
  direction: 1 | -1,
) {
  if (isTitleBucketView(viewId)) {
    return jumpLetter(games, current, direction);
  }

  if (games.length === 0) return 0;

  const start = clampIndex(current, games.length);
  const currentLabel = getBrowseGroupLabel(viewId, games[start]);
  let targetLabel: string | undefined;
  let targetIndex = start;

  for (let step = 1; step <= games.length; step += 1) {
    const index = wrapIndex(start + step * direction, games.length);
    const label = getBrowseGroupLabel(viewId, games[index]);

    if (label === currentLabel) continue;

    if (targetLabel === undefined) {
      targetLabel = label;
      targetIndex = index;

      if (direction === 1) return targetIndex;
      continue;
    }

    if (label !== targetLabel) return targetIndex;

    targetIndex = index;
  }

  return targetLabel === undefined ? start : targetIndex;
}

export function getBrowseViewSummary(
  viewId: BrowseViewId,
  games: GameRecord[],
): BrowseViewSummary {
  if (viewId === "favorites") {
    return {
      statLabel: "KEEPERS",
      statValue: games.filter((game) => game.isFavorite).length,
    };
  }

  if (viewId === "recent") {
    return {
      statLabel: "PLAYED",
      statValue: games.filter((game) => game.wasRecentlyPlayed).length,
    };
  }

  if (viewId === "genre") {
    return {
      statLabel: "GENRES",
      statValue: orderedDistinctLabels(games.map((game) => game.genre)).length,
    };
  }

  if (viewId === "year") {
    return {
      statLabel: "YEARS",
      statValue: orderedDistinctLabels(games.map((game) => String(game.year))).length,
    };
  }

  return {
    statLabel: "MAKERS",
    statValue: orderedDistinctLabels(games.map((game) => game.manufacturer)).length,
  };
}

function orderedDistinctLabels(labels: string[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const label of labels) {
    if (seen.has(label)) continue;
    seen.add(label);
    ordered.push(label);
  }

  return ordered;
}

function isTitleBucketView(viewId: BrowseViewId) {
  return viewId === "favorites" || viewId === "recent";
}
