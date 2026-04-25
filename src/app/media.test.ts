import { describe, expect, test } from "bun:test";

import { getPreviewMedia, toMediaSrc } from "./media";
import type { GameRecord } from "./types";

const baseGame: GameRecord = {
  id: "1942",
  title: "1942",
  machineName: "1942",
  year: 1984,
  manufacturer: "Capcom",
  genre: "Vertical Shooter",
  romAvailable: true,
  artworkPaths: [],
  isFavorite: false,
  wasRecentlyPlayed: false,
};

describe("getPreviewMedia", () => {
  test("prefers preview video over artwork", () => {
    expect(
      getPreviewMedia({
        ...baseGame,
        videoPath: "/srv/karlo/library/media/mame/videos/1942.mp4",
        artworkPaths: ["/srv/karlo/library/media/mame/artwork/title/1942.png"],
      }),
    ).toMatchObject({
      kind: "video",
      path: "/srv/karlo/library/media/mame/videos/1942.mp4",
    });
  });

  test("falls back to the first artwork path", () => {
    expect(
      getPreviewMedia({
        ...baseGame,
        artworkPaths: [
          "/srv/karlo/library/media/mame/artwork/title/1942.png",
          "/srv/karlo/library/media/mame/artwork/marquee/1942.png",
        ],
      }),
    ).toMatchObject({
      kind: "image",
      path: "/srv/karlo/library/media/mame/artwork/title/1942.png",
    });
  });

  test("skips unavailable media paths", () => {
    expect(
      getPreviewMedia(
        {
          ...baseGame,
          videoPath: "/srv/karlo/library/media/mame/videos/1942.mp4",
          artworkPaths: [
            "/srv/karlo/library/media/mame/artwork/title/1942.png",
            "/srv/karlo/library/media/mame/artwork/marquee/1942.png",
          ],
        },
        new Set([
          "/srv/karlo/library/media/mame/videos/1942.mp4",
          "/srv/karlo/library/media/mame/artwork/title/1942.png",
        ]),
      ),
    ).toMatchObject({
      kind: "image",
      path: "/srv/karlo/library/media/mame/artwork/marquee/1942.png",
    });
  });

  test("returns none when no media exists", () => {
    expect(getPreviewMedia(baseGame)).toEqual({ kind: "none" });
  });
});

describe("toMediaSrc", () => {
  test("leaves relative paths unchanged outside Tauri", () => {
    expect(toMediaSrc("media/previews/1942.mp4")).toBe("media/previews/1942.mp4");
  });
});
