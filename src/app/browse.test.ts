import { describe, expect, test } from "bun:test";

import { getGamesForView } from "./mock-data";
import { getTitleBucket, jumpLetter, wrapIndex } from "./browse";
import type { GameRecord } from "./types";

const sampleGames: GameRecord[] = [
  {
    id: "delta",
    title: "Delta",
    machineName: "delta",
    year: 1983,
    manufacturer: "Bravo",
    genre: "Maze",
  },
  {
    id: "alpha",
    title: "Alpha",
    machineName: "alpha",
    year: 1981,
    manufacturer: "Acme",
    genre: "Action",
    isFavorite: true,
    wasRecentlyPlayed: true,
  },
  {
    id: "charlie",
    title: "Charlie",
    machineName: "charlie",
    year: 1981,
    manufacturer: "Acme",
    genre: "Action",
    isFavorite: true,
  },
  {
    id: "bravo",
    title: "Bravo",
    machineName: "bravo",
    year: 1982,
    manufacturer: "Bravo",
    genre: "Shooter",
    wasRecentlyPlayed: true,
  },
];

const jumpGames: GameRecord[] = [
  {
    id: "1942",
    title: "1942",
    machineName: "1942",
    year: 1984,
    manufacturer: "Capcom",
    genre: "Vertical Shooter",
  },
  {
    id: "arkanoid",
    title: "Arkanoid",
    machineName: "arkanoid",
    year: 1986,
    manufacturer: "Taito",
    genre: "Breakout",
  },
  {
    id: "asteroids",
    title: "Asteroids",
    machineName: "asteroids",
    year: 1979,
    manufacturer: "Atari",
    genre: "Vector Shooter",
  },
  {
    id: "bubble",
    title: "Bubble Bobble",
    machineName: "bubble",
    year: 1986,
    manufacturer: "Taito",
    genre: "Platform",
  },
  {
    id: "burger",
    title: "Burger Time",
    machineName: "burger",
    year: 1982,
    manufacturer: "Data East",
    genre: "Action",
  },
  {
    id: "centipede",
    title: "Centipede",
    machineName: "centipede",
    year: 1980,
    manufacturer: "Atari",
    genre: "Fixed Shooter",
  },
];

function titlesFor(games: GameRecord[]) {
  return games.map((game) => game.title);
}

describe("getGamesForView", () => {
  test("returns favorites sorted by title", () => {
    const visible = getGamesForView("favorites", sampleGames);

    expect(titlesFor(visible.games)).toEqual(["Alpha", "Charlie"]);
    expect(visible.fallbackLabel).toBeUndefined();
  });

  test("falls back to the full library when favorites are empty", () => {
    const visible = getGamesForView(
      "favorites",
      sampleGames.map((game) => ({ ...game, isFavorite: false })),
    );

    expect(titlesFor(visible.games)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
    expect(visible.fallbackLabel).toBe("No favorites yet — showing full library");
  });

  test("returns recents sorted by title and falls back when history is empty", () => {
    const recent = getGamesForView("recent", sampleGames);
    const fallback = getGamesForView(
      "recent",
      sampleGames.map((game) => ({ ...game, wasRecentlyPlayed: false })),
    );

    expect(titlesFor(recent.games)).toEqual(["Alpha", "Bravo"]);
    expect(recent.fallbackLabel).toBeUndefined();
    expect(titlesFor(fallback.games)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
    expect(fallback.fallbackLabel).toBe("No recent history — showing full library");
  });

  test("sorts the remaining browse views deterministically", () => {
    expect(titlesFor(getGamesForView("genre", sampleGames).games)).toEqual([
      "Alpha",
      "Charlie",
      "Delta",
      "Bravo",
    ]);
    expect(titlesFor(getGamesForView("year", sampleGames).games)).toEqual([
      "Alpha",
      "Charlie",
      "Bravo",
      "Delta",
    ]);
    expect(titlesFor(getGamesForView("manufacturer", sampleGames).games)).toEqual([
      "Alpha",
      "Charlie",
      "Bravo",
      "Delta",
    ]);
  });
});

describe("getTitleBucket", () => {
  test("groups numeric titles into a 0-9 bucket", () => {
    expect(getTitleBucket("1942")).toBe("0-9");
    expect(getTitleBucket("Asteroids")).toBe("A");
  });
});

describe("wrapIndex", () => {
  test("wraps in both directions", () => {
    expect(wrapIndex(-1, 6)).toBe(5);
    expect(wrapIndex(6, 6)).toBe(0);
  });
});

describe("jumpLetter", () => {
  test("skips within the current bucket and advances to the next one", () => {
    expect(jumpLetter(jumpGames, 1, 1)).toBe(3);
    expect(jumpLetter(jumpGames, 4, -1)).toBe(1);
  });

  test("wraps around in both directions", () => {
    expect(jumpLetter(jumpGames, 5, 1)).toBe(0);
    expect(jumpLetter(jumpGames, 0, -1)).toBe(5);
  });

  test("lands on the top of the previous bucket when moving backward", () => {
    expect(jumpLetter(jumpGames, 3, -1)).toBe(1);
    expect(jumpLetter(jumpGames, 4, -1)).toBe(1);
  });
});
