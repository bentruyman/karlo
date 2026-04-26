import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  curateMachines,
  parseMameDatXml,
  prepareOutputRoot,
  stageCuratedLibrary,
} from "./curate-arcade-library";

function machineXml(
  name: string,
  description = name,
  options: {
    attrs?: string;
    controls?: string[];
    displays?: boolean;
    driver?: string;
  } = {},
) {
  const controls = options.controls ?? ["joy"];
  const displayXml = options.displays === false
    ? ""
    : '<display type="raster" rotate="0" width="320" height="240" refresh="60.0"/>';
  const controlXml = controls.map((control) => `<control type="${control}" buttons="1"/>`).join("");
  const inputXml = `<input players="2">${controlXml}</input>`;
  const driver = options.driver ?? '<driver status="good" emulation="good" savestate="supported"/>';
  return `
    <machine name="${name}" ${options.attrs ?? ""}>
      <description>${description}</description>
      <year>1982</year>
      <manufacturer>Example</manufacturer>
      ${displayXml}
      ${inputXml}
      ${driver}
    </machine>
  `;
}

function parseSample(body: string) {
  return parseMameDatXml(`<mame>${body}</mame>`);
}

describe("curate arcade library", () => {
  test("parses MAME metadata", () => {
    const machines = parseSample(
      machineXml("galaga", "Galaga (US)", {
        attrs: 'cloneof="galagao"',
        controls: ["trackball", "dial"],
      }),
    );

    expect(machines.galaga.title).toBe("Galaga (US)");
    expect(machines.galaga.year).toBe("1982");
    expect(machines.galaga.manufacturer).toBe("Example");
    expect(machines.galaga.cloneOf).toBe("galagao");
    expect(machines.galaga.controls.map((control) => control.type)).toEqual(["trackball", "dial"]);
    expect(machines.galaga.displays[0].width).toBe("320");
  });

  test("rejects screenless, mechanical, and preliminary games", () => {
    const machines = parseSample(
      machineXml("screenless", "Screenless", { displays: false }) +
        machineXml("mechanical", "Mechanical", { attrs: 'ismechanical="yes"' }) +
        machineXml("prelim", "Prelim", {
          driver: '<driver status="preliminary" emulation="preliminary" savestate="unsupported"/>',
        }),
    );

    const result = curateMachines({ romNames: ["screenless", "mechanical", "prelim"], machines });

    expect(result.rejected.screenless).toBe("no_display");
    expect(result.rejected.mechanical).toBe("mechanical");
    expect(result.rejected.prelim).toBe("preliminary");
  });

  test("keeps spinner, trackball, and twin-stick games but rejects pedals", () => {
    const machines = parseSample(
      machineXml("arkanoid", "Arkanoid", { controls: ["dial"] }) +
        machineXml("centiped", "Centipede", { controls: ["trackball"] }) +
        machineXml("robotron", "Robotron", { controls: ["doublejoy"] }) +
        machineXml("racer", "Racer", { controls: ["paddle", "pedal"] }),
    );

    const result = curateMachines({
      romNames: ["arkanoid", "centiped", "robotron", "racer"],
      machines,
    });

    expect(result.accepted.map((candidate) => candidate.machine.name).sort()).toEqual([
      "arkanoid",
      "centiped",
      "robotron",
    ]);
    expect(result.rejected.racer).toBe("unsupported_control:pedal");
  });

  test("prefers US or World variants over Japanese duplicates", () => {
    const machines = parseSample(
      machineXml("fightj", "Fighter (Japan)") +
        machineXml("fightw", "Fighter (World)") +
        machineXml("fightu", "Fighter (USA)"),
    );

    const result = curateMachines({ romNames: ["fightj", "fightw", "fightu"], machines });

    expect(result.accepted.map((candidate) => candidate.machine.name)).toEqual(["fightu"]);
    expect(result.rejected.fightj).toBe("duplicate_variant");
    expect(result.rejected.fightw).toBe("duplicate_variant");
    expect(result.duplicateGroups[0].selected).toBe("fightu");
  });

  test("penalizes bootlegs, later sets, and non-English revisions", () => {
    const machines = parseSample(
      machineXml("clean", "Shooter (USA)") +
        machineXml("boot", "Shooter (USA bootleg)") +
        machineXml("set2", "Shooter (USA, set 2)") +
        machineXml("rev", "Shooter (Japan, Rev B)"),
    );

    const result = curateMachines({ romNames: ["clean", "boot", "set2", "rev"], machines });

    expect(result.accepted.map((candidate) => candidate.machine.name)).toEqual(["clean"]);
    expect(result.rejected.boot).toBe("duplicate_variant");
    expect(result.rejected.set2).toBe("duplicate_variant");
    expect(result.rejected.rev).toBe("duplicate_variant");
  });

  test("stages inventory with media paths", async () => {
    const machines = parseSample(machineXml("1942", "1942 (USA)"));
    const result = curateMachines({ romNames: ["1942"], machines });
    const root = await mkdtemp(join(tmpdir(), "karlo-curate-test-"));
    const source = join(root, "library");
    const output = join(root, "curated");

    await mkdir(join(source, "roms", "mame"), { recursive: true });
    await mkdir(join(source, "media", "mame", "videos"), { recursive: true });
    await mkdir(join(source, "media", "mame", "artwork", "title"), { recursive: true });
    await writeFile(join(source, "roms", "mame", "1942.zip"), "rom");
    await writeFile(join(source, "media", "mame", "videos", "1942.mp4"), "video");
    await writeFile(join(source, "media", "mame", "artwork", "title", "1942.png"), "title");

    const { inventory, stats } = await stageCuratedLibrary(source, output, result.accepted, false);

    expect(inventory[0].machineName).toBe("1942");
    expect(inventory[0].rom).toBe("roms/mame/1942.zip");
    expect(inventory[0].video).toBe("media/mame/videos/1942.mp4");
    expect(inventory[0].artwork.title).toBe("media/mame/artwork/title/1942.png");
    expect((stats.roms.linked ?? 0) + (stats.roms.copied ?? 0)).toBe(1);
  });

  test("prepares output by pruning managed library paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "karlo-curate-prune-test-"));
    const output = join(root, "curated");
    await mkdir(join(output, "roms", "mame"), { recursive: true });
    await mkdir(join(output, "media", "mame", "videos"), { recursive: true });
    await mkdir(join(output, "manifests"), { recursive: true });
    await writeFile(join(output, "roms", "mame", "stale.zip"), "stale");
    await writeFile(join(output, "media", "mame", "videos", "stale.mp4"), "stale");
    await writeFile(join(output, "manifests", "inventory.json"), "{}");

    await prepareOutputRoot(output, false);

    await expect(Bun.file(join(output, "roms", "mame", "stale.zip")).exists()).resolves.toBe(false);
    await expect(Bun.file(join(output, "media", "mame", "videos", "stale.mp4")).exists()).resolves.toBe(false);
    await expect(Bun.file(join(output, "manifests", "inventory.json")).exists()).resolves.toBe(false);
  });
});
