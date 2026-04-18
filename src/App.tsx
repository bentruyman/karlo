import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  clampIndex,
  getTitleBucket,
  jumpLetter,
  TITLE_BUCKETS,
  wrapIndex,
} from "./app/browse";
import {
  DEFAULT_FRONTEND_BOOTSTRAP,
  loadCabinetConfig,
  loadFrontendBootstrap,
  saveCabinetConfig,
} from "./app/bootstrap";
import {
  cabinetConfigToDraft,
  parseCabinetConfigDraft,
  type CabinetConfigDraft,
} from "./app/cabinet-config";
import {
  buildGameRecords,
  getGamesForView,
  mockImportedGames,
  mockLibraryEntries,
  mockRecentGames,
} from "./app/mock-data";
import type { BrowseView, BrowseViewId, CabinetConfig, GameRecord } from "./app/types";

const ATTRACT_MODE_STEP_MS = 3_600;
const VISIBLE_ROWS = 14;
const SERVICE_CODE_WINDOW_MS = 1_400;
const HANDLED_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "enter",
  "1",
  "z",
  "x",
  "c",
  " ",
  "v",
  "b",
  "5",
  "escape",
]);

export default function App() {
  const [bootstrap, setBootstrap] = useState(DEFAULT_FRONTEND_BOOTSTRAP);
  const [importedGames] = useState(mockImportedGames);
  const [libraryEntries, setLibraryEntries] = useState(mockLibraryEntries);
  const [recentGames] = useState(mockRecentGames);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<ServiceSectionId>("launch");
  const [settingsDraft, setSettingsDraft] = useState<CabinetConfigDraft>(() =>
    cabinetConfigToDraft(DEFAULT_FRONTEND_BOOTSTRAP.cabinetConfig),
  );
  const [settingsStatus, setSettingsStatus] =
    useState<ServiceMenuStatus>("idle");
  const [viewIndex, setViewIndex] = useState(() =>
    Math.max(
      DEFAULT_FRONTEND_BOOTSTRAP.curation.browseViews.findIndex(
        (view) => view.id === DEFAULT_FRONTEND_BOOTSTRAP.defaultView,
      ),
      0,
    ),
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAttractMode, setIsAttractMode] = useState(false);
  const lastInteractionAtRef = useRef(Date.now());
  const serviceCodePressesRef = useRef<number[]>([]);

  const browseViews = bootstrap.curation.browseViews;
  const games = useMemo(
    () => buildGameRecords(importedGames, libraryEntries, recentGames),
    [importedGames, libraryEntries, recentGames],
  );
  const activeView =
    browseViews[viewIndex] ?? DEFAULT_FRONTEND_BOOTSTRAP.curation.browseViews[0];
  const visibleState = useMemo(
    () => getGamesForView(activeView.id, games),
    [activeView.id, games],
  );
  const visibleGames = visibleState.games;
  const attractTimeoutMs = bootstrap.cabinetConfig.attractTimeoutSeconds * 1_000;
  const displayCalibration = bootstrap.cabinetConfig.displayCalibration;

  const bucketsPresent = useMemo(() => {
    const present = new Set<string>();
    for (const g of visibleGames) present.add(getTitleBucket(g.title));
    return present;
  }, [visibleGames]);

  useEffect(() => {
    let cancelled = false;

    void loadFrontendBootstrap().then((nextBootstrap) => {
      if (!cancelled) setBootstrap(nextBootstrap);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setViewIndex((current) => clampIndex(current, browseViews.length));
  }, [browseViews.length]);

  useEffect(() => {
    setSelectedIndex((current) => clampIndex(current, visibleGames.length));
  }, [visibleGames.length]);

  const activeSelectedIndex = clampIndex(selectedIndex, visibleGames.length);
  const selectedGame = visibleGames[activeSelectedIndex] ?? visibleGames[0];
  const activeCabinetConfig = bootstrap.cabinetConfig;

  function noteInteraction() {
    lastInteractionAtRef.current = Date.now();
    if (isAttractMode) setIsAttractMode(false);
  }

  function cycleView(direction: 1 | -1) {
    startTransition(() => {
      setViewIndex((current) => wrapIndex(current + direction, browseViews.length));
      setSelectedIndex(0);
    });
  }

  function jumpToView(viewId: BrowseViewId) {
    const idx = browseViews.findIndex((v) => v.id === viewId);
    if (idx === -1) return;

    startTransition(() => {
      setViewIndex(idx);
      setSelectedIndex(0);
    });
  }

  function stepSelection(delta: number) {
    if (visibleGames.length === 0) return;

    startTransition(() => {
      setSelectedIndex((current) =>
        wrapIndex(current + delta, visibleGames.length),
      );
    });
  }

  function setSelection(index: number) {
    startTransition(() => {
      setSelectedIndex(clampIndex(index, visibleGames.length));
    });
  }

  function nextLetter(direction: 1 | -1) {
    setSelection(jumpLetter(visibleGames, activeSelectedIndex, direction));
  }

  function toggleFavorite() {
    const gameId = selectedGame?.id;
    if (!gameId) return;

    setLibraryEntries((current) =>
      current.map((entry) =>
        entry.machineName === gameId
          ? { ...entry, isFavorite: !entry.isFavorite }
          : entry,
      ),
    );
  }

  const openSettings = useEffectEvent(async () => {
    noteInteraction();
    setIsAttractMode(false);
    setSettingsStatus("idle");
    setSettingsSection("launch");
    setIsSettingsOpen(true);

    const cabinetConfig = await loadCabinetConfig();
    setBootstrap((current) => ({ ...current, cabinetConfig }));
    setSettingsDraft(cabinetConfigToDraft(cabinetConfig));
  });

  function closeSettings() {
    setIsSettingsOpen(false);
    setSettingsStatus("idle");
  }

  function resetSettingsDraft() {
    setSettingsDraft(cabinetConfigToDraft(DEFAULT_FRONTEND_BOOTSTRAP.cabinetConfig));
    setSettingsStatus("idle");
  }

  const commitSettings = useEffectEvent(async () => {
    const parsed = parseCabinetConfigDraft(settingsDraft, activeCabinetConfig);
    if (!parsed.ok) {
      setSettingsStatus({ kind: "error", message: parsed.message });
      return;
    }

    setSettingsStatus("saving");

    try {
      const savedConfig = await saveCabinetConfig(parsed.value);
      setBootstrap((current) => ({ ...current, cabinetConfig: savedConfig }));
      setSettingsDraft(cabinetConfigToDraft(savedConfig));
      setSettingsStatus({
        kind: "saved",
        message: "Cabinet settings saved to SQLite.",
      });
    } catch (error) {
      setSettingsStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not save cabinet settings.",
      });
    }
  });

  function registerServiceCodePress() {
    const now = Date.now();
    const recent = serviceCodePressesRef.current.filter(
      (timestamp) => now - timestamp <= SERVICE_CODE_WINDOW_MS,
    );
    recent.push(now);
    serviceCodePressesRef.current = recent;

    return recent.length >= 3;
  }

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const target = event.target;
    const isEditableTarget =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);

    if (isSettingsOpen) {
      if (key === "escape") {
        event.preventDefault();
        closeSettings();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        void commitSettings();
        return;
      }

      if (isEditableTarget) return;
      return;
    }

    if (key === "5" && registerServiceCodePress()) {
      event.preventDefault();
      void openSettings();
      return;
    }

    if (!HANDLED_KEYS.has(key)) return;

    switch (key) {
      case "arrowup":
        event.preventDefault();
        noteInteraction();
        stepSelection(-1);
        return;
      case "arrowdown":
        event.preventDefault();
        noteInteraction();
        stepSelection(1);
        return;
      case "arrowleft":
        event.preventDefault();
        noteInteraction();
        nextLetter(-1);
        return;
      case "arrowright":
        event.preventDefault();
        noteInteraction();
        nextLetter(1);
        return;
      case "enter":
      case "1":
      case "z":
        noteInteraction();
        return;
      case "x":
        event.preventDefault();
        noteInteraction();
        toggleFavorite();
        return;
      case "c":
      case " ":
        event.preventDefault();
        noteInteraction();
        cycleView(1);
        return;
      case "v":
        event.preventDefault();
        noteInteraction();
        cycleView(-1);
        return;
      case "b":
      case "5":
        event.preventDefault();
        noteInteraction();
        jumpToView("favorites");
        return;
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isSettingsOpen) return;
      if (Date.now() - lastInteractionAtRef.current >= attractTimeoutMs) {
        setIsAttractMode(true);
      }
    }, 1_000);
    return () => window.clearInterval(id);
  }, [attractTimeoutMs, isSettingsOpen]);

  useEffect(() => {
    if (!isAttractMode || isSettingsOpen || visibleGames.length <= 1) return;
    const id = window.setInterval(() => {
      setSelectedIndex((current) => wrapIndex(current + 1, visibleGames.length));
    }, ATTRACT_MODE_STEP_MS);
    return () => window.clearInterval(id);
  }, [isAttractMode, isSettingsOpen, visibleGames.length]);

  if (!selectedGame) return null;

  const currentBucket = getTitleBucket(selectedGame.title);

  return (
    <div
      className="isolate grid h-screen w-screen place-items-center overflow-hidden bg-black text-cab-ink antialiased"
      data-attract={isAttractMode || undefined}
    >
      <div
        className="relative bg-black"
        data-display-profile={bootstrap.cabinetConfig.displayProfile}
        style={{
          width: "min(100vw, calc(100vh * 4 / 3))",
          height: "min(100vh, calc(100vw * 3 / 4))",
          containerType: "size",
        }}
      >
        <div
          className="absolute grid grid-rows-[auto_1fr_auto] gap-[2.4cqh]"
          style={{
            top: `${displayCalibration.topInsetPercent}%`,
            right: `${displayCalibration.rightInsetPercent}%`,
            bottom: `${displayCalibration.bottomInsetPercent}%`,
            left: `${displayCalibration.leftInsetPercent}%`,
          }}
        >
          <ModeBar
            browseViews={browseViews}
            activeIndex={viewIndex}
            onSelect={jumpToView}
          />

          <div className="grid grid-cols-[44%_1fr] gap-[3cqw] min-h-0">
            <ListColumn
              games={visibleGames}
              selectedIndex={activeSelectedIndex}
              currentBucket={currentBucket}
              bucketsPresent={bucketsPresent}
              onSelect={setSelection}
              fallbackLabel={visibleState.fallbackLabel}
            />

            <PreviewColumn game={selectedGame} isAttract={isAttractMode} />
          </div>

          <ControlHints />
        </div>

        {isSettingsOpen && (
          <ServiceMenu
            cabinetConfig={activeCabinetConfig}
            settingsDraft={settingsDraft}
            settingsSection={settingsSection}
            status={settingsStatus}
            onClose={closeSettings}
            onReset={resetSettingsDraft}
            onSave={() => void commitSettings()}
            onSectionChange={setSettingsSection}
            onChange={(field, value) => {
              setSettingsDraft((current) => ({ ...current, [field]: value }));
              setSettingsStatus("idle");
            }}
          />
        )}
      </div>
    </div>
  );
}

type ServiceSectionId = "launch" | "media" | "display" | "storage";

type ServiceMenuStatus =
  | "idle"
  | "saving"
  | { kind: "saved"; message: string }
  | { kind: "error"; message: string };

function ModeBar({
  browseViews,
  activeIndex,
  onSelect,
}: {
  browseViews: BrowseView[];
  activeIndex: number;
  onSelect: (id: BrowseViewId) => void;
}) {
  return (
    <div className="flex items-end gap-[3cqw] border-b-[0.4cqh] border-cab-rule pb-[1.2cqh]">
      <ul className="flex items-end gap-[2.6cqw]">
        {browseViews.map((view, index) => {
          const isActive = index === activeIndex;
          return (
            <li key={view.id} className="relative">
              <button
                type="button"
                onClick={() => onSelect(view.id)}
                className="font-display leading-none transition-colors"
                style={{
                  fontSize: "3.6cqh",
                  color: isActive ? "var(--color-cab-ink)" : "var(--color-cab-mute)",
                }}
              >
                {view.label}
              </button>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -bottom-[1.6cqh] left-0 right-0 h-[0.6cqh] bg-cab-accent"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ListColumn({
  games,
  selectedIndex,
  currentBucket,
  bucketsPresent,
  onSelect,
  fallbackLabel,
}: {
  games: GameRecord[];
  selectedIndex: number;
  currentBucket: string;
  bucketsPresent: Set<string>;
  onSelect: (index: number) => void;
  fallbackLabel?: string;
}) {
  if (games.length === 0) {
    return (
      <div className="flex items-center justify-center font-display text-cab-mute" style={{ fontSize: "3cqh" }}>
        NO GAMES
      </div>
    );
  }

  const windowStart = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(VISIBLE_ROWS / 2),
      Math.max(0, games.length - VISIBLE_ROWS),
    ),
  );
  const windowEnd = Math.min(games.length, windowStart + VISIBLE_ROWS);
  const rows = games.slice(windowStart, windowEnd);

  return (
    <div className="flex flex-col gap-[1.6cqh] min-h-0">
      {fallbackLabel && (
        <div
          className="font-sans text-cab-mute uppercase tracking-[0.14em]"
          style={{ fontSize: "1.8cqh" }}
        >
          {fallbackLabel}
        </div>
      )}

      <ul className="flex-1 flex flex-col justify-start gap-[0.8cqh] min-h-0 overflow-hidden">
        {rows.map((game, i) => {
          const absoluteIndex = windowStart + i;
          const isActive = absoluteIndex === selectedIndex;
          return (
            <li key={game.id} className="flex items-center gap-[1cqw]">
              <span
                aria-hidden
                className="font-display leading-none"
                style={{
                  fontSize: "3.2cqh",
                  color: isActive ? "var(--color-cab-accent)" : "transparent",
                  width: "2.4cqw",
                }}
              >
                ▸
              </span>
              <button
                type="button"
                onClick={() => onSelect(absoluteIndex)}
                className="flex-1 flex items-baseline gap-[1cqw] font-display text-left leading-[0.95] tracking-[0.01em]"
                style={{
                  fontSize: isActive ? "3.6cqh" : "2.6cqh",
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? "var(--color-cab-ink)" : "var(--color-cab-mute)",
                }}
              >
                <span className="truncate">{game.title}</span>
                {game.isFavorite && (
                  <span
                    aria-hidden
                    style={{
                      fontSize: "2cqh",
                      color: "var(--color-cab-accent)",
                    }}
                  >
                    ★
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <LetterRibbon current={currentBucket} present={bucketsPresent} />

      <div
        className="flex items-baseline justify-between font-display tracking-[0.2em] text-cab-mute"
        style={{ fontSize: "2cqh" }}
      >
        <span>
          <span className="text-cab-ink">{String(selectedIndex + 1).padStart(3, "0")}</span>
          <span> / {String(games.length).padStart(3, "0")}</span>
        </span>
        <span>GROUP {currentBucket}</span>
      </div>
    </div>
  );
}

function LetterRibbon({
  current,
  present,
}: {
  current: string;
  present: Set<string>;
}) {
  return (
    <div
      className="grid items-center font-display tracking-[0.1em]"
      style={{
        gridTemplateColumns: `repeat(${TITLE_BUCKETS.length}, minmax(0, 1fr))`,
        fontSize: "2.4cqh",
      }}
    >
      {TITLE_BUCKETS.map((bucket) => {
        const isPresent = present.has(bucket);
        const isCurrent = bucket === current;
        return (
          <div key={bucket} className="relative flex justify-center leading-none">
            <span
              style={{
                color: isCurrent
                  ? "var(--color-cab-accent)"
                  : isPresent
                    ? "var(--color-cab-ink)"
                    : "var(--color-cab-dim)",
                fontWeight: isCurrent ? 700 : 400,
              }}
            >
              {bucket}
            </span>
            {isCurrent && (
              <span
                aria-hidden
                className="absolute -bottom-[1cqh] left-0 right-0 mx-auto rounded-full"
                style={{
                  width: "0.8cqh",
                  height: "0.8cqh",
                  background: "var(--color-cab-accent)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PreviewColumn({ game, isAttract }: { game: GameRecord; isAttract: boolean }) {
  return (
    <div className="flex flex-col gap-[2cqh] min-h-0">
      <div className="relative flex-1 min-h-0 overflow-hidden bg-cab-surface border-[0.4cqh] border-cab-rule">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--color-cab-accent) 14%, #000) 0%, #000 70%)",
            opacity: isAttract ? 1 : 0.8,
          }}
        />
        <div className="absolute inset-[3%] flex flex-col justify-between">
          <div className="flex items-start justify-between font-display tracking-[0.25em] text-cab-mute" style={{ fontSize: "1.9cqh" }}>
            <span>PREVIEW</span>
            <span>{game.machineName.toUpperCase()}</span>
          </div>

          {game.attractCaption && (
            <p
              className="font-sans leading-[1.2] text-cab-ink max-w-[80%]"
              style={{ fontSize: "2.4cqh" }}
            >
              {game.attractCaption}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[1cqh]">
        <h1
          className="font-display leading-[0.9] tracking-[0.01em] text-cab-ink"
          style={{ fontSize: "6.4cqh" }}
        >
          {game.title}
        </h1>

        <div
          className="flex items-center gap-[1.6cqw] font-display tracking-[0.18em] text-cab-ink"
          style={{ fontSize: "2.4cqh" }}
        >
          <span>{game.year}</span>
          <Dot />
          <span>{game.manufacturer.toUpperCase()}</span>
          <Dot />
          <span>{game.genre.toUpperCase()}</span>
        </div>

        <div className="flex items-center gap-[1.6cqw]">
          {game.isFavorite && (
            <Badge color="var(--color-cab-accent)">★ FAVORITE</Badge>
          )}
          {game.wasRecentlyPlayed && <Badge>● RECENT</Badge>}
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="inline-block rounded-full bg-cab-mute"
      style={{ width: "0.7cqh", height: "0.7cqh" }}
    />
  );
}

function Badge({
  children,
  color,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="font-display tracking-[0.22em]"
      style={{
        fontSize: "2cqh",
        color: color ?? "var(--color-cab-mute)",
      }}
    >
      {children}
    </span>
  );
}

function ControlHints() {
  const hints: Array<[string, string]> = [
    ["▴▾", "SELECT"],
    ["◂▸", "LETTER"],
    ["Ⓐ", "LAUNCH"],
    ["Ⓑ", "FAVORITE"],
    ["Ⓒ", "MODE"],
    ["↩", "BACK"],
  ];
  return (
    <div
      className="flex items-center justify-between font-display tracking-[0.18em] text-cab-mute border-t-[0.4cqh] border-cab-rule pt-[1.2cqh]"
      style={{ fontSize: "2cqh" }}
    >
      {hints.map(([glyph, label], i) => (
        <span key={label} className="flex items-center gap-[0.7cqw]">
          <span className="text-cab-ink" style={{ fontSize: "2.6cqh" }}>{glyph}</span>
          <span>{label}</span>
          {i < hints.length - 1 && (
            <span aria-hidden className="ml-[0.7cqw] text-cab-rule">│</span>
          )}
        </span>
      ))}
    </div>
  );
}

function ServiceMenu({
  cabinetConfig,
  settingsDraft,
  settingsSection,
  status,
  onClose,
  onReset,
  onSave,
  onSectionChange,
  onChange,
}: {
  cabinetConfig: CabinetConfig;
  settingsDraft: CabinetConfigDraft;
  settingsSection: ServiceSectionId;
  status: ServiceMenuStatus;
  onClose: () => void;
  onReset: () => void;
  onSave: () => void;
  onSectionChange: (section: ServiceSectionId) => void;
  onChange: (field: keyof CabinetConfigDraft, value: string) => void;
}) {
  const sections: Array<{
    id: ServiceSectionId;
    label: string;
    detail: string;
  }> = [
    { id: "launch", label: "Launch", detail: "MAME runtime paths" },
    { id: "media", label: "Library", detail: "ROM and media scan roots" },
    { id: "display", label: "Display", detail: "CRT timing and safe area" },
    { id: "storage", label: "Storage", detail: "SQLite boundary summary" },
  ];

  const statusBadge =
    status === "idle"
      ? { label: "Ready", tone: "var(--color-cab-mute)" }
      : status === "saving"
        ? { label: "Saving", tone: "var(--color-cab-accent)" }
        : {
            label: status.kind === "saved" ? "Saved" : "Error",
            tone:
              status.kind === "saved"
                ? "var(--color-cab-ok)"
                : "var(--color-cab-danger)",
          };

  return (
    <div className="absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(3,5,9,0.72),rgba(0,0,0,0.94))]">
      <div className="absolute inset-[3.2%] overflow-hidden border-[0.4cqh] border-cab-rule bg-[#05070b]/96">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(248,216,79,0.08) 48%, transparent 100%), repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 7px)",
          }}
        />

        <div className="relative grid h-full grid-rows-[auto_1fr_auto] gap-[2.2cqh] px-[2.6cqw] py-[2.6cqh]">
          <div className="flex items-start justify-between gap-[2cqw] border-b-[0.4cqh] border-cab-rule pb-[1.8cqh]">
            <div className="flex flex-col gap-[1cqh]">
              <div
                className="font-display tracking-[0.3em] text-cab-accent"
                style={{ fontSize: "1.9cqh" }}
              >
                SERVICE MODE
              </div>
              <div className="flex flex-col gap-[0.8cqh]">
                <h2
                  className="font-display text-cab-ink"
                  style={{ fontSize: "5.2cqh" }}
                >
                  HIDDEN CABINET SETTINGS
                </h2>
                <p
                  className="max-w-[74ch] font-sans text-cab-mute"
                  style={{ fontSize: "2.1cqh", lineHeight: 1.25 }}
                >
                  Launcher paths, scan roots, attract timing, and CRT safe-area
                  values now persist through the Rust-owned SQLite settings
                  store. Triple <strong>COIN</strong> opens this panel.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-[1.1cqh]">
              <div
                className="rounded-full border-[0.28cqh] px-[1.2cqw] py-[0.55cqh] font-display tracking-[0.22em]"
                style={{
                  fontSize: "1.8cqh",
                  color: statusBadge.tone,
                  borderColor: statusBadge.tone,
                }}
              >
                {statusBadge.label}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-none bg-transparent px-[1.2cqw] py-[0.7cqh] font-display text-cab-mute ring-1 ring-cab-rule"
                style={{ fontSize: "1.9cqh" }}
              >
                CLOSE
              </button>
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-[13fr_29fr] gap-[2.4cqw]">
            <aside className="flex min-h-0 flex-col gap-[1.2cqh] border-r-[0.4cqh] border-cab-rule pr-[1.7cqw]">
              <ul role="list" className="flex flex-col gap-[0.8cqh]">
                {sections.map((section, index) => {
                  const isActive = section.id === settingsSection;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => onSectionChange(section.id)}
                        className="w-full rounded-none px-[1.2cqw] py-[1.15cqh] text-left ring-1 ring-cab-rule"
                        style={{
                          background: isActive
                            ? "linear-gradient(90deg, rgba(248,216,79,0.16), rgba(248,216,79,0.03))"
                            : "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div
                          className="font-display text-cab-ink"
                          style={{ fontSize: "2.5cqh" }}
                        >
                          {String(index + 1).padStart(2, "0")} {section.label}
                        </div>
                        <div
                          className="font-sans text-cab-mute"
                          style={{ fontSize: "1.8cqh", lineHeight: 1.2 }}
                        >
                          {section.detail}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-auto rounded-none bg-[#0a0e14] px-[1.2cqw] py-[1.2cqh] ring-1 ring-cab-rule">
                <div
                  className="font-display text-cab-ink"
                  style={{ fontSize: "2.1cqh" }}
                >
                  SERVICE CODE
                </div>
                <div
                  className="mt-[0.6cqh] font-sans text-cab-mute"
                  style={{ fontSize: "1.8cqh", lineHeight: 1.25 }}
                >
                  Tap <span className="text-cab-ink">5</span> three times from the
                  browse screen. Press <span className="text-cab-ink">Esc</span>{" "}
                  to back out.
                </div>
              </div>
            </aside>

            <section className="min-h-0 overflow-y-auto pr-[0.6cqw]">
              {settingsSection === "launch" && (
                <SettingsSection
                  title="Launch Runtime"
                  subtitle="Define where Karlo finds MAME and how the cabinet runtime boots."
                >
                  <FieldGroup>
                    <TextInputField
                      id="mameExecutablePath"
                      label="MAME executable path"
                      name="mameExecutablePath"
                      value={settingsDraft.mameExecutablePath}
                      placeholder="/usr/local/bin/mame"
                      onChange={(value) => onChange("mameExecutablePath", value)}
                    />
                    <TextInputField
                      id="mameIniPath"
                      label="Optional mame.ini path"
                      name="mameIniPath"
                      value={settingsDraft.mameIniPath}
                      placeholder="/etc/mame.ini"
                      onChange={(value) => onChange("mameIniPath", value)}
                    />
                  </FieldGroup>
                </SettingsSection>
              )}

              {settingsSection === "media" && (
                <SettingsSection
                  title="Library and Media Roots"
                  subtitle="Manual scans only run against these persisted roots."
                >
                  <FieldGroup>
                    <TextAreaField
                      id="romRootsText"
                      label="ROM roots"
                      name="romRootsText"
                      value={settingsDraft.romRootsText}
                      placeholder={"/roms/main\n/roms/overflow"}
                      onChange={(value) => onChange("romRootsText", value)}
                    />
                    <TextAreaField
                      id="mediaRootsText"
                      label="Media roots"
                      name="mediaRootsText"
                      value={settingsDraft.mediaRootsText}
                      placeholder={"/media/cabinet\n/media/import"}
                      onChange={(value) => onChange("mediaRootsText", value)}
                    />
                    <TextInputField
                      id="previewVideoRoot"
                      label="Preview video root"
                      name="previewVideoRoot"
                      value={settingsDraft.previewVideoRoot}
                      placeholder="/media/cabinet/videos"
                      onChange={(value) => onChange("previewVideoRoot", value)}
                    />
                    <TextInputField
                      id="artworkRoot"
                      label="Artwork root"
                      name="artworkRoot"
                      value={settingsDraft.artworkRoot}
                      placeholder="/media/cabinet/artwork"
                      onChange={(value) => onChange("artworkRoot", value)}
                    />
                  </FieldGroup>
                </SettingsSection>
              )}

              {settingsSection === "display" && (
                <SettingsSection
                  title="Display and Timing"
                  subtitle="Tune idle behavior and the current CRT safe-area offsets."
                >
                  <FieldGroup>
                    <NumberInputField
                      id="attractTimeoutSeconds"
                      label="Attract timeout (seconds)"
                      name="attractTimeoutSeconds"
                      min={5}
                      max={600}
                      value={settingsDraft.attractTimeoutSeconds}
                      onChange={(value) =>
                        onChange("attractTimeoutSeconds", value)
                      }
                    />

                    <div className="grid grid-cols-2 gap-[1.1cqw]">
                      <NumberInputField
                        id="topInsetPercent"
                        label="Top inset %"
                        name="topInsetPercent"
                        min={0}
                        max={25}
                        value={settingsDraft.topInsetPercent}
                        onChange={(value) => onChange("topInsetPercent", value)}
                      />
                      <NumberInputField
                        id="rightInsetPercent"
                        label="Right inset %"
                        name="rightInsetPercent"
                        min={0}
                        max={25}
                        value={settingsDraft.rightInsetPercent}
                        onChange={(value) => onChange("rightInsetPercent", value)}
                      />
                      <NumberInputField
                        id="bottomInsetPercent"
                        label="Bottom inset %"
                        name="bottomInsetPercent"
                        min={0}
                        max={25}
                        value={settingsDraft.bottomInsetPercent}
                        onChange={(value) => onChange("bottomInsetPercent", value)}
                      />
                      <NumberInputField
                        id="leftInsetPercent"
                        label="Left inset %"
                        name="leftInsetPercent"
                        min={0}
                        max={25}
                        value={settingsDraft.leftInsetPercent}
                        onChange={(value) => onChange("leftInsetPercent", value)}
                      />
                    </div>

                    <InfoPanel
                      title="Active display profile"
                      body={`${cabinetConfig.displayProfile} remains fixed at the runtime layer while overscan and safe-area values are persisted here.`}
                    />
                  </FieldGroup>
                </SettingsSection>
              )}

              {settingsSection === "storage" && (
                <SettingsSection
                  title="Persistence Boundary"
                  subtitle="This service surface only edits cabinet configuration, not the curated library."
                >
                  <div className="grid gap-[1cqh]">
                    <StorageRow
                      label="settings"
                      value="Launcher paths, media roots, attract timeout, calibration"
                    />
                    <StorageRow
                      label="games"
                      value="Imported MAME truth and resolved media pointers"
                    />
                    <StorageRow
                      label="library_entries"
                      value="Cabinet-facing visibility, favorites, and browse ordering"
                    />
                    <StorageRow
                      label="recent_games"
                      value="Last-played history for launch return and recents"
                    />
                  </div>
                </SettingsSection>
              )}
            </section>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-center gap-[2cqw] border-t-[0.4cqh] border-cab-rule pt-[1.6cqh]">
            <div
              className="font-sans text-cab-mute"
              style={{ fontSize: "1.9cqh", lineHeight: 1.25 }}
            >
              {status === "idle"
                ? "Save writes the current draft into the Rust-owned SQLite settings table."
                : status === "saving"
                  ? "Persisting cabinet settings."
                  : status.message}
            </div>

            <div className="flex items-center gap-[1cqw]">
              <button
                type="button"
                onClick={onReset}
                className="rounded-none bg-transparent px-[1.2cqw] py-[0.85cqh] font-display text-cab-mute ring-1 ring-cab-rule"
                style={{ fontSize: "1.9cqh" }}
              >
                DEFAULTS
              </button>
              <button
                type="button"
                onClick={onSave}
                className="rounded-none bg-cab-accent px-[1.4cqw] py-[0.85cqh] font-display text-black ring-1 ring-cab-accent"
                style={{ fontSize: "2cqh" }}
              >
                SAVE TO SQLITE
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[1.5cqh]">
      <div className="flex flex-col gap-[0.6cqh]">
        <h3 className="font-display text-cab-ink" style={{ fontSize: "4cqh" }}>
          {title}
        </h3>
        <p
          className="max-w-[68ch] font-sans text-cab-mute"
          style={{ fontSize: "2cqh", lineHeight: 1.25 }}
        >
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}

function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="grid gap-[1.2cqh]">{children}</div>;
}

function TextInputField({
  id,
  label,
  name,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="grid gap-[0.55cqh]">
      <span className="font-display text-cab-ink" style={{ fontSize: "2.2cqh" }}>
        {label}
      </span>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="w-full rounded-none bg-[#090d13] px-[1.1cqw] py-[1cqh] font-sans text-cab-ink ring-1 ring-cab-rule outline-none placeholder:text-cab-dim focus:ring-[0.35cqh] focus:ring-cab-accent/55"
        style={{ fontSize: "2.05cqh" }}
      />
    </label>
  );
}

function NumberInputField({
  id,
  label,
  name,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="grid gap-[0.55cqh]">
      <span className="font-display text-cab-ink" style={{ fontSize: "2.2cqh" }}>
        {label}
      </span>
      <input
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="w-full rounded-none bg-[#090d13] px-[1.1cqw] py-[1cqh] font-sans text-cab-ink ring-1 ring-cab-rule outline-none focus:ring-[0.35cqh] focus:ring-cab-accent/55"
        style={{ fontSize: "2.05cqh" }}
      />
    </label>
  );
}

function TextAreaField({
  id,
  label,
  name,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="grid gap-[0.55cqh]">
      <span className="font-display text-cab-ink" style={{ fontSize: "2.2cqh" }}>
        {label}
      </span>
      <textarea
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-[12cqh] w-full resize-none rounded-none bg-[#090d13] px-[1.1cqw] py-[1cqh] font-sans text-cab-ink ring-1 ring-cab-rule outline-none placeholder:text-cab-dim focus:ring-[0.35cqh] focus:ring-cab-accent/55"
        style={{ fontSize: "2.05cqh", lineHeight: 1.25 }}
      />
    </label>
  );
}

function InfoPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[#0a0e14] px-[1.2cqw] py-[1.1cqh] ring-1 ring-cab-rule">
      <div className="font-display text-cab-ink" style={{ fontSize: "2.15cqh" }}>
        {title}
      </div>
      <p
        className="mt-[0.6cqh] max-w-[66ch] font-sans text-cab-mute"
        style={{ fontSize: "1.95cqh", lineHeight: 1.25 }}
      >
        {body}
      </p>
    </div>
  );
}

function StorageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[12fr_28fr] gap-[1.2cqw] bg-[#0a0e14] px-[1.2cqw] py-[1.05cqh] ring-1 ring-cab-rule">
      <div className="font-display text-cab-accent" style={{ fontSize: "2.05cqh" }}>
        {label}
      </div>
      <div className="font-sans text-cab-mute" style={{ fontSize: "1.95cqh", lineHeight: 1.25 }}>
        {value}
      </div>
    </div>
  );
}
