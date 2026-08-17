import { describe, expect, test } from "bun:test";

import {
  batchCurlConfig,
  findMameDirs,
  ftpUrl,
  groupArtworkArchives,
  parseEnvFile,
  parseFtpListing,
  planDownloads,
} from "./download-arcade-assets";

describe("parseFtpListing", () => {
  test("parses unix listing lines with spaces and parens in names", () => {
    const listing = [
      "total 12",
      "drwxr-xr-x   2 ftp      ftp          4096 Jan 22  2018 MAME (Video Snaps)(HQ)(EM 20161025)",
      "-rw-r--r--   1 ftp      ftp       1234567 Mar  4 10:30 1942.mp4",
      "lrwxrwxrwx   1 ftp      ftp            11 Jan 22  2018 link -> target",
      "",
    ].join("\r\n");

    expect(parseFtpListing(listing)).toEqual([
      {
        name: "MAME (Video Snaps)(HQ)(EM 20161025)",
        size: 4096,
        isDir: true,
      },
      { name: "1942.mp4", size: 1234567, isDir: false },
    ]);
  });

  test("parses DOS-style listing lines", () => {
    const listing = [
      "10-29-25  12:13PM       <DIR>          Official",
      "01-22-18  10:30AM              1234567 MAME (Marquees)(MAME .278).part1.rar",
    ].join("\n");

    expect(parseFtpListing(listing)).toEqual([
      { name: "Official", size: 0, isDir: true },
      {
        name: "MAME (Marquees)(MAME .278).part1.rar",
        size: 1234567,
        isDir: false,
      },
    ]);
  });

  test("returns nothing for unrecognized text", () => {
    expect(parseFtpListing("530 Login incorrect.\n")).toEqual([]);
  });
});

describe("parseEnvFile", () => {
  test("reads keys, skips comments, strips quotes", () => {
    const values = parseEnvFile(
      [
        "# comment",
        "",
        "EMUMOVIES_USER=ben",
        'EMUMOVIES_PASSWORD="p a=ss"',
        "EMUMOVIES_HOST='files.example.com'",
      ].join("\n"),
    );

    expect(values).toEqual({
      EMUMOVIES_USER: "ben",
      EMUMOVIES_PASSWORD: "p a=ss",
      EMUMOVIES_HOST: "files.example.com",
    });
  });
});

describe("ftpUrl", () => {
  test("encodes each segment", () => {
    expect(
      ftpUrl("files.emumovies.com", ["Official", "Video Snaps (HQ)"], true),
    ).toBe("ftp://files.emumovies.com/Official/Video%20Snaps%20(HQ)/");
    expect(ftpUrl("host", ["a", "1942.mp4"])).toBe("ftp://host/a/1942.mp4");
  });
});

describe("findMameDirs", () => {
  test("returns only directories starting with MAME", () => {
    expect(
      findMameDirs([
        { name: "MAME (Video Snaps)(HQ)", size: 0, isDir: true },
        { name: "MAME notes.txt", size: 10, isDir: false },
        { name: "C64 (Video Snaps)", size: 0, isDir: true },
      ]),
    ).toEqual(["MAME (Video Snaps)(HQ)"]);
  });
});

describe("groupArtworkArchives", () => {
  test("sorts multipart rars numerically", () => {
    const group = groupArtworkArchives(
      [
        "MAME (Flyers)(MAME .278).part10.rar",
        "MAME (Flyers)(MAME .278).part1.rar",
        "MAME (Flyers)(MAME .278).part02.rar",
      ],
      "MAME (Flyers)",
    );

    expect(group?.parts).toEqual([
      "MAME (Flyers)(MAME .278).part1.rar",
      "MAME (Flyers)(MAME .278).part02.rar",
      "MAME (Flyers)(MAME .278).part10.rar",
    ]);
  });

  test("picks the newest version when several exist", () => {
    const group = groupArtworkArchives(
      [
        "MAME (Title Snaps)(MAME .201).part1.rar",
        "MAME (Title Snaps)(MAME .201).part2.rar",
        "MAME (Title Snaps)(MAME .278).zip",
      ],
      "MAME (Title Snaps)",
    );

    expect(group).toEqual({
      base: "MAME (Title Snaps)(MAME .278)",
      parts: ["MAME (Title Snaps)(MAME .278).zip"],
    });
  });

  test("ignores other packs and returns null when nothing matches", () => {
    const names = ["MAME (Marquees)(MAME .201).zip"];
    expect(groupArtworkArchives(names, "MAME (Cabinets)")).toBeNull();
    expect(groupArtworkArchives(names, "MAME (Marquees)")?.parts).toEqual(names);
  });

  test("unclosed prefix matches renamed singular pack", () => {
    const names = ["MAME (Artwork Preview)(MAME)(EM .267).zip"];
    expect(groupArtworkArchives(names, "MAME (Artwork Preview")?.parts).toEqual(names);
  });
});

describe("batchCurlConfig", () => {
  test("emits url/output pairs after credentials, escaping quotes", () => {
    const config = batchCurlConfig('user = "ben:pass"\n', [
      { url: "ftp://host/a%20b.mp4", output: '/dest/"odd" name.mp4' },
    ]);

    expect(config).toBe(
      [
        'user = "ben:pass"',
        'url = "ftp://host/a%20b.mp4"',
        'output = "/dest/\\"odd\\" name.mp4"',
        "",
      ].join("\n"),
    );
  });
});

describe("planDownloads", () => {
  test("splits wanted names into download, skip, and missing", () => {
    const remote = new Map([
      ["1942.mp4", 100],
      ["sf2.mp4", 200],
      ["galaga.mp4", 300],
    ]);
    const local = new Map([
      ["1942.mp4", 100],
      ["sf2.mp4", 50],
    ]);

    const plan = planDownloads(
      remote,
      ["1942.mp4", "sf2.mp4", "galaga.mp4", "dkong.mp4"],
      local,
    );

    expect(plan.skipped).toBe(1);
    expect(plan.download).toEqual([
      { name: "sf2.mp4", size: 200 },
      { name: "galaga.mp4", size: 300 },
    ]);
    expect(plan.missingRemote).toEqual(["dkong.mp4"]);
  });
});
