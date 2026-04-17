import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
  type CSSProperties,
} from "react";

import { browseViews, getGamesForView, mockGames } from "./app/mock-data";
import type { BrowseViewId, FocusZone, GameRecord } from "./app/types";

const ATTRACT_MODE_TIMEOUT_MS = 12_000;
const ATTRACT_MODE_STEP_MS = 3_600;

function wrapIndex(index: number, length: number) {
  return (index + length) % length;
}

export default function App() {
  const [games, setGames] = useState(mockGames);
  const [viewIndex, setViewIndex] = useState(0);
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [focusZone, setFocusZone] = useState<FocusZone>("carousel");
  const [isAttractMode, setIsAttractMode] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());

  const activeView = browseViews[viewIndex];
  const visibleState = getGamesForView(activeView.id, games);
  const visibleGames = visibleState.games;

  useEffect(() => {
    if (selectedGameIndex >= visibleGames.length) {
      setSelectedGameIndex(0);
    }
  }, [selectedGameIndex, visibleGames.length]);

  const selectedGame = visibleGames[selectedGameIndex] ?? visibleGames[0];

  const noteInteraction = useEffectEvent(() => {
    setLastInteractionAt(Date.now());

    if (isAttractMode) {
      setIsAttractMode(false);
    }
  });

  const moveView = useEffectEvent((direction: -1 | 1) => {
    startTransition(() => {
      setViewIndex((current) => wrapIndex(current + direction, browseViews.length));
      setSelectedGameIndex(0);
    });
  });

  const moveGame = useEffectEvent((direction: -1 | 1) => {
    if (visibleGames.length === 0) {
      return;
    }

    startTransition(() => {
      setSelectedGameIndex((current) => wrapIndex(current + direction, visibleGames.length));
    });
  });

  const toggleFavorite = useEffectEvent(() => {
    const activeMachine = selectedGame?.machineName;

    if (!activeMachine) {
      return;
    }

    setGames((currentGames) =>
      currentGames.map((game) =>
        game.machineName === activeMachine
          ? { ...game, isFavorite: !game.isFavorite }
          : game,
      ),
    );
  });

  const enterView = useEffectEvent((viewId: BrowseViewId) => {
    const nextIndex = browseViews.findIndex((view) => view.id === viewId);

    if (nextIndex === -1) {
      return;
    }

    startTransition(() => {
      setViewIndex(nextIndex);
      setSelectedGameIndex(0);
      setFocusZone("carousel");
    });
  });

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const handledKeys = new Set([
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
      "enter",
      "f",
      "a",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);

    if (!handledKeys.has(key)) {
      return;
    }

    event.preventDefault();
    noteInteraction();

    if (key === "a") {
      setIsAttractMode((current) => !current);
      return;
    }

    if (key === "f") {
      toggleFavorite();
      return;
    }

    if (key === "enter") {
      setFocusZone("carousel");
      return;
    }

    if (key === "arrowup" || key === "arrowdown") {
      setFocusZone((current) => (current === "views" ? "carousel" : "views"));
      return;
    }

    if (key === "1") {
      enterView("favorites");
      return;
    }

    if (key === "2") {
      enterView("recent");
      return;
    }

    if (key === "3") {
      enterView("genre");
      return;
    }

    if (key === "4") {
      enterView("year");
      return;
    }

    if (key === "5") {
      enterView("manufacturer");
      return;
    }

    if (focusZone === "views") {
      moveView(key === "arrowleft" ? -1 : 1);
      return;
    }

    moveGame(key === "arrowleft" ? -1 : 1);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const timeoutId = window.setInterval(() => {
      if (Date.now() - lastInteractionAt >= ATTRACT_MODE_TIMEOUT_MS) {
        setIsAttractMode(true);
      }
    }, 1_000);

    return () => window.clearInterval(timeoutId);
  }, [lastInteractionAt]);

  useEffect(() => {
    if (!isAttractMode || visibleGames.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSelectedGameIndex((current) => wrapIndex(current + 1, visibleGames.length));
    }, ATTRACT_MODE_STEP_MS);

    return () => window.clearInterval(intervalId);
  }, [isAttractMode, visibleGames.length]);

  if (!selectedGame) {
    return null;
  }

  const themeStyle = {
    "--game-primary": selectedGame.accentPrimary,
    "--game-secondary": selectedGame.accentSecondary,
    "--cabinet-color": selectedGame.cabinetColor,
  } as CSSProperties;

  return (
    <div className="app-shell" data-attract-mode={isAttractMode} style={themeStyle}>
      <div className="crt-stage">
        <div className="safe-frame">
          <header className="top-bar">
            <div className="brand-block">
              <span className="eyebrow">Cabinet Mock / Milestone 0</span>
              <h1>Karlo</h1>
            </div>

            <div
              className="view-strip"
              aria-label="Browse views"
              data-focus-zone={focusZone === "views"}
            >
              {browseViews.map((view, index) => (
                <button
                  key={view.id}
                  type="button"
                  className="view-pill"
                  data-active={index === viewIndex}
                  onClick={() => enterView(view.id)}
                >
                  <span className="view-label">{view.label}</span>
                  <span className="view-description">{view.description}</span>
                </button>
              ))}
            </div>

            <div className="status-panel">
              <span className="status-chip">Target: 480i CRT</span>
              <span className="status-chip">Shell: Tauri</span>
              <span className="status-chip" data-live={isAttractMode}>
                {isAttractMode ? "Attract mode active" : "Idle demo armed"}
              </span>
            </div>
          </header>

          <main className="feature-grid">
            <section className="preview-column">
              <div className="preview-monitor">
                <div className="preview-scoreboard">
                  <span>1UP . . . 100</span>
                  <span>TOP . 12000</span>
                  <span>TIME 77</span>
                </div>

                <div className="preview-playfield">
                  <div className="preview-ladder" />
                  <div className="preview-ladder preview-ladder-right" />
                  <div className="preview-platform preview-platform-top" />
                  <div className="preview-platform preview-platform-middle" />
                  <div className="preview-platform preview-platform-bottom" />
                  <div className="preview-sprite preview-sprite-hero" />
                  <div className="preview-sprite preview-sprite-enemy" />
                  <div className="preview-sprite preview-sprite-support" />
                  <div className="preview-copy">
                    <p className="preview-machine">{selectedGame.machineName}</p>
                    <p>{selectedGame.attractCaption}</p>
                  </div>
                </div>

                <div className="preview-footer">
                  <span>{selectedGame.year}</span>
                  <span>{selectedGame.manufacturer}</span>
                  <span>{selectedGame.genre}</span>
                </div>
              </div>

              <div className="cabinet-card">
                <div className="cabinet-figure">
                  <div className="cabinet-marquee">{selectedGame.title}</div>
                  <div className="cabinet-screen" />
                  <div className="cabinet-controls" />
                </div>
                <div className="cabinet-copy">
                  <span className="card-kicker">Cabinet Accent</span>
                  <strong>{selectedGame.marqueeText}</strong>
                  <p>Artwork and preview video can hang off this lane later without changing the layout.</p>
                </div>
              </div>
            </section>

            <aside className="detail-column">
              <section className="logo-card">
                <span className="card-kicker">{selectedGame.manufacturer}</span>
                <h2>{selectedGame.title}</h2>
                <p>{selectedGame.description}</p>
              </section>

              <section className="metadata-card">
                <div className="metadata-row">
                  <span>Machine</span>
                  <strong>{selectedGame.machineName}</strong>
                </div>
                <div className="metadata-row">
                  <span>Genre</span>
                  <strong>{selectedGame.genre}</strong>
                </div>
                <div className="metadata-row">
                  <span>Year</span>
                  <strong>{selectedGame.year}</strong>
                </div>
                <div className="metadata-row">
                  <span>Status</span>
                  <strong>
                    {selectedGame.isFavorite ? "Favorite shelf" : "Library only"}
                  </strong>
                </div>
              </section>

              <section className="guide-card">
                <span className="card-kicker">Cabinet Controls</span>
                <ul>
                  <li>Stick Left / Right: Move in the active lane</li>
                  <li>Stick Up / Down: Swap between lane and carousel focus</li>
                  <li>P1 Start / Enter: Launch placeholder</li>
                  <li>P2 Start / F: Toggle favorite</li>
                  <li>Key 1-5: Jump between browse modes</li>
                </ul>
              </section>
            </aside>
          </main>

          <footer className="carousel-shell">
            <div className="carousel-header">
              <div>
                <span className="card-kicker">Current View</span>
                <strong>{activeView.label}</strong>
              </div>
              <p>{visibleState.fallbackLabel ?? activeView.description}</p>
            </div>

            <div className="carousel-track" data-focus-zone={focusZone === "carousel"}>
              {visibleGames.map((game: GameRecord, index) => (
                <button
                  key={game.id}
                  type="button"
                  className="game-card"
                  data-active={index === selectedGameIndex}
                  onClick={() => setSelectedGameIndex(index)}
                >
                  <span className="game-card-topline">
                    <span>{game.year}</span>
                    <span>{game.manufacturer}</span>
                  </span>
                  <strong>{game.title}</strong>
                  <span className="game-card-genre">{game.genre}</span>
                  <span className="game-card-status">
                    {game.isFavorite ? "Favorite" : "Library"}
                  </span>
                </button>
              ))}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
