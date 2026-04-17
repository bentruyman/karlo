import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { clampIndex, getTitleBucket, jumpLetter, TITLE_BUCKETS } from "./app/browse";
import { browseViews, getGamesForView, mockGames } from "./app/mock-data";
import type { BrowseViewId, GameRecord } from "./app/types";

const ATTRACT_MODE_TIMEOUT_MS = 12_000;
const ATTRACT_MODE_STEP_MS = 3_600;
const VISIBLE_ROWS = 14;
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
]);

export default function App() {
  const [games, setGames] = useState(mockGames);
  const [viewIndex, setViewIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAttractMode, setIsAttractMode] = useState(false);
  const lastInteractionAtRef = useRef(Date.now());

  const activeView = browseViews[viewIndex];
  const visibleState = useMemo(
    () => getGamesForView(activeView.id, games),
    [activeView.id, games],
  );
  const visibleGames = visibleState.games;

  const bucketsPresent = useMemo(() => {
    const present = new Set<string>();
    for (const g of visibleGames) present.add(getTitleBucket(g.title));
    return present;
  }, [visibleGames]);

  useEffect(() => {
    setSelectedIndex((current) => clampIndex(current, visibleGames.length));
  }, [visibleGames.length]);

  const activeSelectedIndex = clampIndex(selectedIndex, visibleGames.length);
  const selectedGame = visibleGames[activeSelectedIndex] ?? visibleGames[0];

  function noteInteraction() {
    lastInteractionAtRef.current = Date.now();
    if (isAttractMode) setIsAttractMode(false);
  }

  function cycleView(direction: 1 | -1) {
    startTransition(() => {
      setViewIndex((c) => (c + direction + browseViews.length) % browseViews.length);
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
        clampIndex(current + delta, visibleGames.length),
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

    setGames((current) =>
      current.map((g) =>
        g.id === gameId ? { ...g, isFavorite: !g.isFavorite } : g,
      ),
    );
  }

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!HANDLED_KEYS.has(key)) return;

    event.preventDefault();
    noteInteraction();

    switch (key) {
      case "arrowup": stepSelection(-1); return;
      case "arrowdown": stepSelection(1); return;
      case "arrowleft": nextLetter(-1); return;
      case "arrowright": nextLetter(1); return;
      case "enter":
      case "1":
      case "z":
        return;
      case "x":
        toggleFavorite();
        return;
      case "c":
      case " ":
        cycleView(1);
        return;
      case "v":
        cycleView(-1);
        return;
      case "b":
      case "5":
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
      if (Date.now() - lastInteractionAtRef.current >= ATTRACT_MODE_TIMEOUT_MS) {
        setIsAttractMode(true);
      }
    }, 1_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAttractMode || visibleGames.length <= 1) return;
    const id = window.setInterval(() => {
      setSelectedIndex((c) => (c + 1) % visibleGames.length);
    }, ATTRACT_MODE_STEP_MS);
    return () => window.clearInterval(id);
  }, [isAttractMode, visibleGames.length]);

  if (!selectedGame) return null;

  const currentBucket = getTitleBucket(selectedGame.title);

  return (
    <div
      className="h-screen w-screen bg-black grid place-items-center overflow-hidden text-cab-ink"
      data-attract={isAttractMode || undefined}
    >
      <div
        className="relative bg-black"
        style={{
          width: "min(100vw, calc(100vh * 4 / 3))",
          height: "min(100vh, calc(100vw * 3 / 4))",
          containerType: "size",
        }}
      >
        <div className="absolute inset-[5%] grid grid-rows-[auto_1fr_auto] gap-[2.4cqh]">
          <ModeBar
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
      </div>
    </div>
  );
}

function ModeBar({
  activeIndex,
  onSelect,
}: {
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
                  fontWeight: isActive ? 700 : 500,
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
                fontWeight: isCurrent ? 700 : 500,
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
    ["¢", "BACK"],
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
