import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

import {
  clampIndex,
  TITLE_BUCKETS,
  wrapIndex,
} from "./app/browse";
import {
  DEFAULT_LIBRARY_SNAPSHOT,
  DEFAULT_FRONTEND_BOOTSTRAP,
  importMameCatalog,
  loadCabinetConfig,
  loadFrontendBootstrap,
  loadLibrarySnapshot,
  recordRecentGame,
  saveCabinetConfig,
  scanRomRoots,
  toggleGameFavorite,
} from "./app/bootstrap";
import {
  adjustCalibrationDraft,
  CALIBRATION_EDGES,
  getCalibrationPreviewInsets,
  moveCalibrationFocus,
  type CalibrationActionId,
  type CalibrationEdgeKey,
  type CalibrationFocusTarget,
} from "./app/calibration";
import {
  cabinetConfigToDraft,
  parseCabinetConfigDraft,
  type CabinetConfigDraft,
} from "./app/cabinet-config";
import {
  getServiceSectionIndex,
  moveServiceFocus,
  SERVICE_SECTIONS,
  type BrowseFocusZone,
  type ServiceActionId,
  type ServiceFieldKey,
  type ServiceFocusTarget,
  type ServicePanelActionId,
  type ServiceSectionId,
} from "./app/navigation";
import {
  buildGameRecords,
  getBrowseGroupLabel,
  getBrowseGroupState,
  getBrowseViewSummary,
  getGamesForView,
  jumpBrowseGroup,
} from "./app/library";
import type {
  BrowseView,
  BrowseViewId,
  CabinetConfig,
  GameRecord,
  LibrarySnapshot,
} from "./app/types";

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
  const [importedGames, setImportedGames] = useState(
    DEFAULT_LIBRARY_SNAPSHOT.importedGames,
  );
  const [libraryEntries, setLibraryEntries] = useState(
    DEFAULT_LIBRARY_SNAPSHOT.libraryEntries,
  );
  const [recentGames, setRecentGames] = useState(
    DEFAULT_LIBRARY_SNAPSHOT.recentGames,
  );
  const [browseFocusZone, setBrowseFocusZone] =
    useState<BrowseFocusZone>("gameList");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<ServiceSectionId>("launch");
  const [serviceFocus, setServiceFocus] = useState<ServiceFocusTarget>({
    zone: "sections",
    index: getServiceSectionIndex("launch"),
  });
  const [calibrationFocus, setCalibrationFocus] =
    useState<CalibrationFocusTarget>({
      zone: "edges",
      index: 0,
    });
  const [editingField, setEditingField] = useState<ServiceFieldKey | null>(null);
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
  const browseFocusBeforeSettingsRef = useRef<BrowseFocusZone>("gameList");
  const fieldRefs = useRef<
    Partial<Record<ServiceFieldKey, HTMLInputElement | HTMLTextAreaElement | null>>
  >({});

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
  const activeSelectedIndex = clampIndex(selectedIndex, visibleGames.length);
  const selectedGame = visibleGames[activeSelectedIndex] ?? visibleGames[0];
  const attractTimeoutMs = bootstrap.cabinetConfig.attractTimeoutSeconds * 1_000;
  const displayCalibration = bootstrap.cabinetConfig.displayCalibration;
  const browseGroupState = useMemo(
    () => getBrowseGroupState(activeView.id, visibleGames, activeSelectedIndex),
    [activeView.id, activeSelectedIndex, visibleGames],
  );
  const viewSummaries = useMemo(
    () =>
      new Map(
        browseViews.map((view) => [view.id, getBrowseViewSummary(view.id, games)]),
      ),
    [browseViews, games],
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.all([loadFrontendBootstrap(), loadLibrarySnapshot()]).then(
      ([nextBootstrap, librarySnapshot]) => {
        if (cancelled) return;
        setBootstrap(nextBootstrap);
        applyLibrarySnapshot(librarySnapshot);
      },
    );

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

  useEffect(() => {
    if (!isSettingsOpen || serviceFocus.zone !== "field") return;

    const nextSection = SERVICE_SECTIONS.find(
      (section) => section.id === settingsSection,
    );
    if (!nextSection) return;

    const nextFocus = moveServiceFocus(serviceFocus, "enter", nextSection.id);
    if (nextFocus.zone === "field" && nextFocus.key === serviceFocus.key) return;

    setServiceFocus(nextFocus);
  }, [isSettingsOpen, serviceFocus, settingsSection]);

  const activeCabinetConfig = bootstrap.cabinetConfig;
  const isServiceOpen = isSettingsOpen || isCalibrationOpen;

  function noteInteraction() {
    lastInteractionAtRef.current = Date.now();
    if (isAttractMode) setIsAttractMode(false);
  }

  function applyLibrarySnapshot(snapshot: LibrarySnapshot) {
    setImportedGames(snapshot.importedGames);
    setLibraryEntries(snapshot.libraryEntries);
    setRecentGames(snapshot.recentGames);
  }

  function applyServiceFocus(nextFocus: ServiceFocusTarget) {
    setServiceFocus(nextFocus);

    if (nextFocus.zone === "sections") {
      setSettingsSection(SERVICE_SECTIONS[nextFocus.index].id);
    }
  }

  function stopEditingField() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setEditingField(null);
  }

  function startEditingField(fieldKey: ServiceFieldKey) {
    setServiceFocus({ zone: "field", key: fieldKey });
    setEditingField(fieldKey);

    requestAnimationFrame(() => {
      fieldRefs.current[fieldKey]?.focus();
      fieldRefs.current[fieldKey]?.select?.();
    });
  }

  function resetCalibrationDraft() {
    setSettingsDraft((current) => ({
      ...current,
      topInsetPercent: String(
        DEFAULT_FRONTEND_BOOTSTRAP.cabinetConfig.displayCalibration
          .topInsetPercent,
      ),
      rightInsetPercent: String(
        DEFAULT_FRONTEND_BOOTSTRAP.cabinetConfig.displayCalibration
          .rightInsetPercent,
      ),
      bottomInsetPercent: String(
        DEFAULT_FRONTEND_BOOTSTRAP.cabinetConfig.displayCalibration
          .bottomInsetPercent,
      ),
      leftInsetPercent: String(
        DEFAULT_FRONTEND_BOOTSTRAP.cabinetConfig.displayCalibration
          .leftInsetPercent,
      ),
    }));
    setSettingsStatus("idle");
  }

  function nudgeCalibration(edgeKey: CalibrationEdgeKey, delta: number) {
    setSettingsDraft((current) => adjustCalibrationDraft(current, edgeKey, delta));
    setSettingsStatus("idle");
  }

  function openCalibration() {
    noteInteraction();
    stopEditingField();
    setSettingsSection("display");
    setCalibrationFocus({ zone: "edges", index: 0 });
    setIsSettingsOpen(false);
    setIsCalibrationOpen(true);
  }

  function closeCalibration() {
    setIsCalibrationOpen(false);
    setIsSettingsOpen(true);
    setSettingsSection("display");
    applyServiceFocus({ zone: "panelActions", action: "openCalibration" });
  }

  function activateServicePanelAction(action: ServicePanelActionId) {
    if (action === "importCatalog") {
      void runCatalogImport();
      return;
    }

    if (action === "scanRoms") {
      void runRomScan();
      return;
    }

    if (action === "openCalibration") {
      openCalibration();
    }
  }

  function activateServiceAction(action: ServiceActionId) {
    if (action === "defaults") {
      resetSettingsDraft();
      return;
    }

    void commitSettings();
  }

  function activateCalibrationAction(action: CalibrationActionId) {
    if (action === "back") {
      closeCalibration();
      return;
    }

    if (action === "defaults") {
      resetCalibrationDraft();
      return;
    }

    void commitSettings();
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

  function nextGroup(direction: 1 | -1) {
    setSelection(
      jumpBrowseGroup(activeView.id, visibleGames, activeSelectedIndex, direction),
    );
  }

  const toggleFavorite = useEffectEvent(async () => {
    const gameId = selectedGame?.id;
    if (!gameId) return;

    try {
      applyLibrarySnapshot(await toggleGameFavorite(gameId));
    } catch {}
  });

  const recordSelectedGameAsRecent = useEffectEvent(async () => {
    const gameId = selectedGame?.id;
    if (!gameId) return;

    try {
      applyLibrarySnapshot(await recordRecentGame(gameId));
    } catch {}
  });

  const openSettings = useEffectEvent(async () => {
    noteInteraction();
    browseFocusBeforeSettingsRef.current = browseFocusZone;
    setIsAttractMode(false);
    setSettingsStatus("idle");
    setSettingsSection("launch");
    setServiceFocus({
      zone: "sections",
      index: getServiceSectionIndex("launch"),
    });
    setCalibrationFocus({ zone: "edges", index: 0 });
    setEditingField(null);
    setIsSettingsOpen(true);
    setIsCalibrationOpen(false);

    const cabinetConfig = await loadCabinetConfig();
    setBootstrap((current) => ({ ...current, cabinetConfig }));
    setSettingsDraft(cabinetConfigToDraft(cabinetConfig));
  });

  function closeSettings() {
    stopEditingField();
    setIsSettingsOpen(false);
    setIsCalibrationOpen(false);
    setSettingsStatus("idle");
    setBrowseFocusZone(browseFocusBeforeSettingsRef.current);
  }

  function resetSettingsDraft() {
    setSettingsDraft(cabinetConfigToDraft(DEFAULT_FRONTEND_BOOTSTRAP.cabinetConfig));
    setSettingsStatus("idle");
  }

  const persistSettingsDraft = useEffectEvent(
    async (options?: {
      requireMameExecutablePath?: boolean;
      requireLibraryRoots?: boolean;
    }) => {
      const parsed = parseCabinetConfigDraft(
        settingsDraft,
        activeCabinetConfig,
        options,
      );
      if (!parsed.ok) {
        setSettingsStatus({ kind: "error", message: parsed.message });
        return null;
      }

      setSettingsStatus("saving");

      try {
        const savedConfig = await saveCabinetConfig(parsed.value);
        setBootstrap((current) => ({ ...current, cabinetConfig: savedConfig }));
        setSettingsDraft(cabinetConfigToDraft(savedConfig));
        return savedConfig;
      } catch (error) {
        setSettingsStatus({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not save cabinet settings.",
        });
        return null;
      }
    },
  );

  const commitSettings = useEffectEvent(async () => {
    const savedConfig = await persistSettingsDraft();
    if (savedConfig) {
      setSettingsStatus({
        kind: "saved",
        message: "Cabinet settings saved to SQLite.",
      });
    }
  });

  const runCatalogImport = useEffectEvent(async () => {
    const savedConfig = await persistSettingsDraft({
      requireMameExecutablePath: true,
    });
    if (!savedConfig) return;

    setSettingsStatus("saving");

    try {
      const result = await importMameCatalog();
      applyLibrarySnapshot(result.snapshot);
      setSettingsStatus({ kind: "saved", message: result.message });
    } catch (error) {
      setSettingsStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not import the MAME catalog.",
      });
    }
  });

  const runRomScan = useEffectEvent(async () => {
    const savedConfig = await persistSettingsDraft({
      requireLibraryRoots: true,
    });
    if (!savedConfig) return;

    setSettingsStatus("saving");

    try {
      const result = await scanRomRoots();
      applyLibrarySnapshot(result.snapshot);
      setSettingsStatus({ kind: "saved", message: result.message });
    } catch (error) {
      setSettingsStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not scan ROM and media roots.",
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

    if (isCalibrationOpen) {
      if (key === "escape") {
        event.preventDefault();
        noteInteraction();
        closeCalibration();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        void commitSettings();
        return;
      }

      if (key === "arrowup") {
        event.preventDefault();
        noteInteraction();
        setCalibrationFocus((current) => moveCalibrationFocus(current, "up"));
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        noteInteraction();
        setCalibrationFocus((current) => moveCalibrationFocus(current, "down"));
        return;
      }

      if (key === "arrowleft") {
        event.preventDefault();
        noteInteraction();
        if (calibrationFocus.zone === "edges") {
          const edgeKey = CALIBRATION_EDGES[calibrationFocus.index]?.key;
          if (edgeKey) nudgeCalibration(edgeKey, -1);
          return;
        }

        setCalibrationFocus((current) => moveCalibrationFocus(current, "left"));
        return;
      }

      if (key === "arrowright") {
        event.preventDefault();
        noteInteraction();
        if (calibrationFocus.zone === "edges") {
          const edgeKey = CALIBRATION_EDGES[calibrationFocus.index]?.key;
          if (edgeKey) nudgeCalibration(edgeKey, 1);
          return;
        }

        setCalibrationFocus((current) => moveCalibrationFocus(current, "right"));
        return;
      }

      if (key === "enter" || key === "1" || key === "z") {
        event.preventDefault();
        noteInteraction();

        if (calibrationFocus.zone === "actions") {
          activateCalibrationAction(calibrationFocus.action);
        }
      }

      return;
    }

    if (isSettingsOpen) {
      if (editingField !== null) {
        if (key === "escape") {
          event.preventDefault();
          stopEditingField();
          return;
        }

        return;
      }

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

      if (key === "arrowup") {
        event.preventDefault();
        noteInteraction();
        applyServiceFocus(moveServiceFocus(serviceFocus, "up", settingsSection));
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        noteInteraction();
        applyServiceFocus(moveServiceFocus(serviceFocus, "down", settingsSection));
        return;
      }

      if (key === "arrowleft") {
        event.preventDefault();
        noteInteraction();
        applyServiceFocus(moveServiceFocus(serviceFocus, "left", settingsSection));
        return;
      }

      if (key === "arrowright") {
        event.preventDefault();
        noteInteraction();
        applyServiceFocus(moveServiceFocus(serviceFocus, "right", settingsSection));
        return;
      }

      if (key === "enter" || key === "1" || key === "z") {
        event.preventDefault();
        noteInteraction();

        if (serviceFocus.zone === "close") {
          closeSettings();
          return;
        }

        if (serviceFocus.zone === "sections") {
          applyServiceFocus(moveServiceFocus(serviceFocus, "enter", settingsSection));
          return;
        }

        if (serviceFocus.zone === "field") {
          startEditingField(serviceFocus.key);
          return;
        }

        if (serviceFocus.zone === "panelActions") {
          activateServicePanelAction(serviceFocus.action);
          return;
        }

        activateServiceAction(serviceFocus.action);
        return;
      }

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
        if (browseFocusZone === "modeBar" || activeSelectedIndex === 0) {
          setBrowseFocusZone("modeBar");
          return;
        }
        stepSelection(-1);
        return;
      case "arrowdown":
        event.preventDefault();
        noteInteraction();
        if (browseFocusZone === "modeBar") {
          setBrowseFocusZone("gameList");
          return;
        }
        stepSelection(1);
        return;
      case "arrowleft":
        event.preventDefault();
        noteInteraction();
        if (browseFocusZone === "modeBar") {
          cycleView(-1);
          return;
        }
        nextGroup(-1);
        return;
      case "arrowright":
        event.preventDefault();
        noteInteraction();
        if (browseFocusZone === "modeBar") {
          cycleView(1);
          return;
        }
        nextGroup(1);
        return;
      case "enter":
      case "1":
      case "z":
        noteInteraction();
        if (browseFocusZone === "modeBar") {
          setBrowseFocusZone("gameList");
          return;
        }
        void recordSelectedGameAsRecent();
        return;
      case "x":
        event.preventDefault();
        noteInteraction();
        void toggleFavorite();
        return;
      case "c":
      case " ":
        event.preventDefault();
        noteInteraction();
        setBrowseFocusZone("modeBar");
        cycleView(1);
        return;
      case "v":
        event.preventDefault();
        noteInteraction();
        setBrowseFocusZone("modeBar");
        cycleView(-1);
        return;
      case "b":
      case "5":
        event.preventDefault();
        noteInteraction();
        setBrowseFocusZone("modeBar");
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
      if (isServiceOpen) return;
      if (Date.now() - lastInteractionAtRef.current >= attractTimeoutMs) {
        setIsAttractMode(true);
      }
    }, 1_000);
    return () => window.clearInterval(id);
  }, [attractTimeoutMs, isServiceOpen]);

  useEffect(() => {
    if (!isAttractMode || isServiceOpen || visibleGames.length <= 1) return;
    const id = window.setInterval(() => {
      setSelectedIndex((current) => wrapIndex(current + 1, visibleGames.length));
    }, ATTRACT_MODE_STEP_MS);
    return () => window.clearInterval(id);
  }, [isAttractMode, isServiceOpen, visibleGames.length]);

  if (!selectedGame) return null;

  return (
    <div
      className="isolate grid h-screen w-screen place-items-center overflow-hidden bg-black text-cab-ink antialiased"
      data-attract={isAttractMode || undefined}
    >
      <div
        className="relative bg-black"
        data-display-profile={bootstrap.cabinetConfig.displayProfile}
        style={{
          width: "min(100vw, calc(100vh * 16 / 9))",
          height: "min(100vh, calc(100vw * 9 / 16))",
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
            isFocused={browseFocusZone === "modeBar"}
            summaries={viewSummaries}
            onFocusZone={() => setBrowseFocusZone("modeBar")}
            onSelect={jumpToView}
          />

          <div className="grid grid-cols-[44%_1fr] gap-[3cqw] min-h-0">
            <ListColumn
              activeViewId={activeView.id}
              games={visibleGames}
              selectedIndex={activeSelectedIndex}
              isFocused={browseFocusZone === "gameList"}
              browseGroupState={browseGroupState}
              onFocusZone={() => setBrowseFocusZone("gameList")}
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
            serviceFocus={serviceFocus}
            editingField={editingField}
            status={settingsStatus}
            fieldRefs={fieldRefs}
            onClose={closeSettings}
            onReset={resetSettingsDraft}
            onImportCatalog={runCatalogImport}
            onScanRoms={runRomScan}
            onOpenCalibration={openCalibration}
            onSave={() => activateServiceAction("save")}
            onSectionChange={(sectionId) => {
              setSettingsSection(sectionId);
              applyServiceFocus({
                zone: "sections",
                index: getServiceSectionIndex(sectionId),
              });
            }}
            onFocusChange={applyServiceFocus}
            onChange={(field, value) => {
              setSettingsDraft((current) => ({ ...current, [field]: value }));
              setSettingsStatus("idle");
            }}
            onFieldActivate={startEditingField}
            onFieldBlur={(fieldKey) => {
              setEditingField((current) => (current === fieldKey ? null : current));
            }}
          />
        )}

        {isCalibrationOpen && (
          <CalibrationScreen
            displayProfile={activeCabinetConfig.displayProfile}
            settingsDraft={settingsDraft}
            calibrationFocus={calibrationFocus}
            status={settingsStatus}
            onFocusChange={setCalibrationFocus}
            onAdjust={nudgeCalibration}
            onBack={closeCalibration}
            onReset={resetCalibrationDraft}
            onSave={() => activateCalibrationAction("save")}
          />
        )}
      </div>
    </div>
  );
}

type ServiceMenuStatus =
  | "idle"
  | "saving"
  | { kind: "saved"; message: string }
  | { kind: "error"; message: string };

function getStatusBadge(status: ServiceMenuStatus) {
  return status === "idle"
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
}

function ModeBar({
  browseViews,
  activeIndex,
  isFocused,
  summaries,
  onFocusZone,
  onSelect,
}: {
  browseViews: BrowseView[];
  activeIndex: number;
  isFocused: boolean;
  summaries: Map<BrowseViewId, { statLabel: string; statValue: number }>;
  onFocusZone: () => void;
  onSelect: (id: BrowseViewId) => void;
}) {
  return (
    <div
      className="flex items-end gap-[3cqw] border-b-[0.4cqh] border-cab-rule pb-[1.2cqh]"
      data-focus-zone={isFocused || undefined}
    >
      <ul role="list" className="flex items-end gap-[2.6cqw]">
        {browseViews.map((view, index) => {
          const isActive = index === activeIndex;
          const summary = summaries.get(view.id);
          return (
            <li key={view.id} className="relative">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  onFocusZone();
                  onSelect(view.id);
                }}
                className="grid gap-[0.3cqh] rounded-none px-[0.7cqw] py-[0.55cqh] transition-colors"
                style={{
                  background:
                    isFocused && isActive
                      ? "rgba(248,216,79,0.08)"
                      : "transparent",
                  boxShadow:
                    isFocused && isActive
                      ? "0 0 0 0.35cqh rgba(248,216,79,0.42)"
                      : "none",
                }}
              >
                <div
                  className="font-display leading-none"
                  style={{
                    fontSize: "3.6cqh",
                    color: isActive
                      ? "var(--color-cab-ink)"
                      : "var(--color-cab-mute)",
                  }}
                >
                  {view.label}
                </div>
                <div
                  className="font-sans text-cab-dim tabular-nums"
                  style={{ fontSize: "1.45cqh", lineHeight: 1.1 }}
                >
                  {summary ? `${summary.statValue} ${summary.statLabel}` : view.description}
                </div>
              </button>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -bottom-[1.6cqh] left-0 right-0 h-[0.6cqh] bg-cab-accent"
                  style={{ opacity: isFocused ? 1 : 0.55 }}
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
  activeViewId,
  games,
  selectedIndex,
  isFocused,
  browseGroupState,
  onFocusZone,
  onSelect,
  fallbackLabel,
}: {
  activeViewId: BrowseViewId;
  games: GameRecord[];
  selectedIndex: number;
  isFocused: boolean;
  browseGroupState: { currentLabel: string; labels: string[]; mode: "titleBucket" | "facet" };
  onFocusZone: () => void;
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

      <ul
        role="list"
        className="flex-1 flex flex-col justify-start gap-[0.8cqh] min-h-0 overflow-hidden"
      >
        {rows.map((game, i) => {
          const absoluteIndex = windowStart + i;
          const isActive = absoluteIndex === selectedIndex;
          const groupLabel = getBrowseGroupLabel(activeViewId, game);
          const previousGroupLabel =
            i === 0 ? null : getBrowseGroupLabel(activeViewId, rows[i - 1]);
          const showGroupHeader =
            browseGroupState.mode === "facet" && groupLabel !== previousGroupLabel;
          return (
            <li key={game.id} className="grid gap-[0.45cqh]">
              {showGroupHeader && (
                <div
                  className="font-display tracking-[0.18em] text-cab-accent"
                  style={{ fontSize: "1.75cqh" }}
                >
                  {groupLabel}
                </div>
              )}
              <div className="flex items-center gap-[1cqw]">
              <span
                aria-hidden
                className="font-display leading-none"
                style={{
                  fontSize: "3.2cqh",
                  color:
                    isActive && isFocused
                      ? "var(--color-cab-accent)"
                      : "transparent",
                  width: "2.4cqw",
                }}
              >
                ▸
              </span>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  onFocusZone();
                  onSelect(absoluteIndex);
                }}
                className="flex-1 rounded-none px-[0.7cqw] py-[0.35cqh] text-left"
                style={{
                  background:
                    isActive && isFocused
                      ? "linear-gradient(90deg, rgba(248,216,79,0.14), rgba(248,216,79,0.02))"
                      : "transparent",
                  boxShadow:
                    isActive && isFocused
                      ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                      : "none",
                }}
              >
                <div
                  className="flex items-baseline gap-[1cqw] font-display tracking-[0.01em]"
                  style={{
                    fontSize: isActive ? "3.6cqh" : "2.6cqh",
                    fontWeight: isActive ? 700 : 400,
                    color:
                      isActive
                        ? "var(--color-cab-ink)"
                        : "var(--color-cab-mute)",
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
                </div>
                {isActive && !isFocused && (
                  <div
                    className="font-sans text-cab-dim"
                    style={{
                      fontSize: "1.55cqh",
                      lineHeight: 1.15,
                    }}
                  >
                    SELECTED
                  </div>
                )}
              </button>
              </div>
            </li>
          );
        })}
      </ul>

      <BrowseMarkerRail
        currentLabel={browseGroupState.currentLabel}
        labels={browseGroupState.labels}
        mode={browseGroupState.mode}
      />

      <div
        className="flex items-baseline justify-between font-display tracking-[0.2em] text-cab-mute"
        style={{ fontSize: "2cqh" }}
      >
        <span>
          <span className="text-cab-ink">{String(selectedIndex + 1).padStart(3, "0")}</span>
          <span> / {String(games.length).padStart(3, "0")}</span>
        </span>
        <span>GROUP {browseGroupState.currentLabel}</span>
      </div>
    </div>
  );
}

function BrowseMarkerRail({
  currentLabel,
  labels,
  mode,
}: {
  currentLabel: string;
  labels: string[];
  mode: "titleBucket" | "facet";
}) {
  if (mode === "titleBucket") {
    const present = new Set(labels);
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
          const isCurrent = bucket === currentLabel;
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

  const currentIndex = Math.max(labels.indexOf(currentLabel), 0);
  const start = Math.max(0, currentIndex - 3);
  const end = Math.min(labels.length, start + 7);
  const visibleLabels = labels.slice(Math.max(0, end - 7), end);

  return (
    <div
      className="grid items-center font-display tracking-[0.1em]"
      style={{
        gridTemplateColumns: `repeat(${visibleLabels.length}, minmax(0, 1fr))`,
        fontSize: "2.2cqh",
      }}
    >
      {visibleLabels.map((label) => {
        const isCurrent = label === currentLabel;
        return (
          <div
            key={label}
            className="truncate text-center leading-none"
            style={{
              color: isCurrent
                ? "var(--color-cab-accent)"
                : "var(--color-cab-mute)",
              fontWeight: isCurrent ? 700 : 400,
            }}
            title={label}
          >
            {label}
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
  serviceFocus,
  editingField,
  status,
  fieldRefs,
  onClose,
  onReset,
  onImportCatalog,
  onScanRoms,
  onOpenCalibration,
  onSave,
  onSectionChange,
  onFocusChange,
  onChange,
  onFieldActivate,
  onFieldBlur,
}: {
  cabinetConfig: CabinetConfig;
  settingsDraft: CabinetConfigDraft;
  settingsSection: ServiceSectionId;
  serviceFocus: ServiceFocusTarget;
  editingField: ServiceFieldKey | null;
  status: ServiceMenuStatus;
  fieldRefs: MutableRefObject<
    Partial<Record<ServiceFieldKey, HTMLInputElement | HTMLTextAreaElement | null>>
  >;
  onClose: () => void;
  onReset: () => void;
  onImportCatalog: () => void;
  onScanRoms: () => void;
  onOpenCalibration: () => void;
  onSave: () => void;
  onSectionChange: (section: ServiceSectionId) => void;
  onFocusChange: (focus: ServiceFocusTarget) => void;
  onChange: (field: keyof CabinetConfigDraft, value: string) => void;
  onFieldActivate: (field: ServiceFieldKey) => void;
  onFieldBlur: (field: ServiceFieldKey) => void;
}) {
  const statusBadge = getStatusBadge(status);

  return (
    <div className="absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(3,5,9,0.72),rgba(0,0,0,0.94))]">
      <div className="absolute inset-[3.2%] overflow-hidden border-[0.4cqh] border-cab-rule bg-[#05070b]/96">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(248,216,79,0.08) 48%, transparent 100%), radial-gradient(circle at 18% 0%, rgba(255,255,255,0.06), transparent 28%)",
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
                  Launcher paths, scan roots, attract timing, and LCD safe-area
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
              {status !== "idle" && status !== "saving" && status.kind === "error" && (
                <div
                  className="max-w-[28cqw] text-right font-sans text-cab-danger"
                  style={{ fontSize: "1.65cqh", lineHeight: 1.2 }}
                >
                  {status.message}
                </div>
              )}
              <button
                type="button"
                tabIndex={-1}
                onClick={onClose}
                className="rounded-none bg-transparent px-[1.2cqw] py-[0.7cqh] font-display text-cab-mute ring-1 ring-cab-rule"
                style={{
                  fontSize: "1.9cqh",
                  color:
                    serviceFocus.zone === "close"
                      ? "var(--color-cab-ink)"
                      : "var(--color-cab-mute)",
                  boxShadow:
                    serviceFocus.zone === "close"
                      ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                      : "none",
                  background:
                    serviceFocus.zone === "close"
                      ? "rgba(248,216,79,0.08)"
                      : "transparent",
                }}
              >
                CLOSE
              </button>
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-[13fr_29fr] gap-[2.4cqw]">
            <aside className="flex min-h-0 flex-col gap-[1.2cqh] border-r-[0.4cqh] border-cab-rule pr-[1.7cqw]">
              <ul role="list" className="flex flex-col gap-[0.8cqh]">
                {SERVICE_SECTIONS.map((section, index) => {
                  const isActive = section.id === settingsSection;
                  const isFocused =
                    serviceFocus.zone === "sections" &&
                    serviceFocus.index === index;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => onSectionChange(section.id)}
                        className="w-full rounded-none px-[1.2cqw] py-[1.15cqh] text-left ring-1 ring-cab-rule"
                        style={{
                          background: isFocused
                            ? "linear-gradient(90deg, rgba(248,216,79,0.16), rgba(248,216,79,0.03))"
                            : isActive
                              ? "rgba(248,216,79,0.07)"
                              : "rgba(255,255,255,0.02)",
                          boxShadow: isFocused
                            ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                            : "none",
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
                      fieldKey="mameExecutablePath"
                      label="MAME executable path"
                      name="mameExecutablePath"
                      value={settingsDraft.mameExecutablePath}
                      placeholder="/usr/local/bin/mame"
                      isFocused={
                        serviceFocus.zone === "field" &&
                        serviceFocus.key === "mameExecutablePath"
                      }
                      isEditing={editingField === "mameExecutablePath"}
                      fieldRefs={fieldRefs}
                      onChange={(value) => onChange("mameExecutablePath", value)}
                      onFocusChange={onFocusChange}
                      onActivate={onFieldActivate}
                      onBlur={onFieldBlur}
                    />
                    <TextInputField
                      id="mameIniPath"
                      fieldKey="mameIniPath"
                      label="Optional mame.ini path"
                      name="mameIniPath"
                      value={settingsDraft.mameIniPath}
                      placeholder="/etc/mame.ini"
                      isFocused={
                        serviceFocus.zone === "field" &&
                        serviceFocus.key === "mameIniPath"
                      }
                      isEditing={editingField === "mameIniPath"}
                      fieldRefs={fieldRefs}
                      onChange={(value) => onChange("mameIniPath", value)}
                      onFocusChange={onFocusChange}
                      onActivate={onFieldActivate}
                      onBlur={onFieldBlur}
                    />
                    <ServicePanelLauncher
                      title="IMPORT MAME XML"
                      body="Run the configured MAME executable with -listxml and upsert machine identity, title, year, and manufacturer into the games table."
                      hint="PRESS START TO IMPORT"
                      isFocused={
                        serviceFocus.zone === "panelActions" &&
                        serviceFocus.action === "importCatalog"
                      }
                      onFocusChange={() =>
                        onFocusChange({
                          zone: "panelActions",
                          action: "importCatalog",
                        })
                      }
                      onRun={onImportCatalog}
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
                      fieldKey="romRootsText"
                      label="ROM roots"
                      name="romRootsText"
                      value={settingsDraft.romRootsText}
                      placeholder={"/roms/main\n/roms/overflow"}
                      isFocused={
                        serviceFocus.zone === "field" &&
                        serviceFocus.key === "romRootsText"
                      }
                      isEditing={editingField === "romRootsText"}
                      fieldRefs={fieldRefs}
                      onChange={(value) => onChange("romRootsText", value)}
                      onFocusChange={onFocusChange}
                      onActivate={onFieldActivate}
                      onBlur={onFieldBlur}
                    />
                    <TextAreaField
                      id="mediaRootsText"
                      fieldKey="mediaRootsText"
                      label="Media roots"
                      name="mediaRootsText"
                      value={settingsDraft.mediaRootsText}
                      placeholder={"/media/cabinet\n/media/import"}
                      isFocused={
                        serviceFocus.zone === "field" &&
                        serviceFocus.key === "mediaRootsText"
                      }
                      isEditing={editingField === "mediaRootsText"}
                      fieldRefs={fieldRefs}
                      onChange={(value) => onChange("mediaRootsText", value)}
                      onFocusChange={onFocusChange}
                      onActivate={onFieldActivate}
                      onBlur={onFieldBlur}
                    />
                    <TextInputField
                      id="previewVideoRoot"
                      fieldKey="previewVideoRoot"
                      label="Preview video root"
                      name="previewVideoRoot"
                      value={settingsDraft.previewVideoRoot}
                      placeholder="/media/cabinet/videos"
                      isFocused={
                        serviceFocus.zone === "field" &&
                        serviceFocus.key === "previewVideoRoot"
                      }
                      isEditing={editingField === "previewVideoRoot"}
                      fieldRefs={fieldRefs}
                      onChange={(value) => onChange("previewVideoRoot", value)}
                      onFocusChange={onFocusChange}
                      onActivate={onFieldActivate}
                      onBlur={onFieldBlur}
                    />
                    <TextInputField
                      id="artworkRoot"
                      fieldKey="artworkRoot"
                      label="Artwork root"
                      name="artworkRoot"
                      value={settingsDraft.artworkRoot}
                      placeholder="/media/cabinet/artwork"
                      isFocused={
                        serviceFocus.zone === "field" &&
                        serviceFocus.key === "artworkRoot"
                      }
                      isEditing={editingField === "artworkRoot"}
                      fieldRefs={fieldRefs}
                      onChange={(value) => onChange("artworkRoot", value)}
                      onFocusChange={onFocusChange}
                      onActivate={onFieldActivate}
                      onBlur={onFieldBlur}
                    />
                    <ServicePanelLauncher
                      title="SCAN LIBRARY"
                      body="Walk the configured ROM and media roots, update availability, and refresh resolved video and artwork paths."
                      hint="PRESS START TO SCAN"
                      isFocused={
                        serviceFocus.zone === "panelActions" &&
                        serviceFocus.action === "scanRoms"
                      }
                      onFocusChange={() =>
                        onFocusChange({
                          zone: "panelActions",
                          action: "scanRoms",
                        })
                      }
                      onRun={onScanRoms}
                    />
                  </FieldGroup>
                </SettingsSection>
              )}

              {settingsSection === "display" && (
                <SettingsSection
                  title="Display and Timing"
                  subtitle="Tune idle behavior here, then open the dedicated display calibration surface for live safe-area work."
                >
                  <FieldGroup>
                    <NumberInputField
                      id="attractTimeoutSeconds"
                      fieldKey="attractTimeoutSeconds"
                      label="Attract timeout (seconds)"
                      name="attractTimeoutSeconds"
                      min={5}
                      max={600}
                      value={settingsDraft.attractTimeoutSeconds}
                      isFocused={
                        serviceFocus.zone === "field" &&
                        serviceFocus.key === "attractTimeoutSeconds"
                      }
                      isEditing={editingField === "attractTimeoutSeconds"}
                      fieldRefs={fieldRefs}
                      onChange={(value) =>
                        onChange("attractTimeoutSeconds", value)
                      }
                      onFocusChange={onFocusChange}
                      onActivate={onFieldActivate}
                      onBlur={onFieldBlur}
                    />

                    <CalibrationLauncher
                      settingsDraft={settingsDraft}
                      isFocused={
                        serviceFocus.zone === "panelActions" &&
                        serviceFocus.action === "openCalibration"
                      }
                      onFocusChange={() =>
                        onFocusChange({
                          zone: "panelActions",
                          action: "openCalibration",
                        })
                      }
                      onOpen={onOpenCalibration}
                    />

                    <InfoPanel
                      title="Active display profile"
                      body={`${cabinetConfig.displayProfile} remains fixed at the runtime layer while bezel padding and safe-area values are persisted here.`}
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
                tabIndex={-1}
                onClick={onReset}
                className="rounded-none bg-transparent px-[1.2cqw] py-[0.85cqh] font-display text-cab-mute ring-1 ring-cab-rule"
                style={{
                  fontSize: "1.9cqh",
                  color:
                    serviceFocus.zone === "actions" &&
                    serviceFocus.action === "defaults"
                      ? "var(--color-cab-ink)"
                      : "var(--color-cab-mute)",
                  boxShadow:
                    serviceFocus.zone === "actions" &&
                    serviceFocus.action === "defaults"
                      ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                      : "none",
                  background:
                    serviceFocus.zone === "actions" &&
                    serviceFocus.action === "defaults"
                      ? "rgba(248,216,79,0.08)"
                      : "transparent",
                }}
              >
                DEFAULTS
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={onSave}
                className="rounded-none bg-cab-accent px-[1.4cqw] py-[0.85cqh] font-display text-black ring-1 ring-cab-accent"
                style={{
                  fontSize: "2cqh",
                  boxShadow:
                    serviceFocus.zone === "actions" &&
                    serviceFocus.action === "save"
                      ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                      : "none",
                  filter:
                    serviceFocus.zone === "actions" &&
                    serviceFocus.action === "save"
                      ? "brightness(1.05)"
                      : "none",
                }}
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

function CalibrationScreen({
  displayProfile,
  settingsDraft,
  calibrationFocus,
  status,
  onFocusChange,
  onAdjust,
  onBack,
  onReset,
  onSave,
}: {
  displayProfile: string;
  settingsDraft: CabinetConfigDraft;
  calibrationFocus: CalibrationFocusTarget;
  status: ServiceMenuStatus;
  onFocusChange: (focus: CalibrationFocusTarget) => void;
  onAdjust: (edge: CalibrationEdgeKey, delta: number) => void;
  onBack: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const statusBadge = getStatusBadge(status);
  const previewInsets = getCalibrationPreviewInsets(settingsDraft);

  return (
    <div className="absolute inset-0 z-30 bg-[linear-gradient(180deg,rgba(1,2,5,0.82),rgba(0,0,0,0.98))]">
      <div className="absolute inset-[1.8%] overflow-hidden border-[0.4cqh] border-cab-rule bg-[#03050a]/96">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(248,216,79,0.09), transparent 38%), linear-gradient(135deg, rgba(255,255,255,0.035), transparent 42%)",
          }}
        />

        <div className="relative grid h-full grid-rows-[auto_1fr_auto] gap-[2.2cqh] px-[2.4cqw] py-[2.4cqh]">
          <div className="flex items-start justify-between gap-[2cqw] border-b-[0.4cqh] border-cab-rule pb-[1.7cqh]">
            <div className="flex flex-col gap-[0.9cqh]">
              <div
                className="font-display tracking-[0.3em] text-cab-accent"
                style={{ fontSize: "1.9cqh" }}
              >
                DISPLAY CALIBRATION
              </div>
              <div className="flex flex-col gap-[0.8cqh]">
                <h2
                  className="font-display text-cab-ink"
                  style={{ fontSize: "5.4cqh" }}
                >
                  LCD SAFE AREA AND BEZEL PADDING
                </h2>
                <p
                  className="max-w-[76ch] font-sans text-cab-mute"
                  style={{ fontSize: "2.05cqh", lineHeight: 1.25 }}
                >
                  Up and down choose an edge. Left and right nudge that edge by
                  one percent. Save writes the live frame back into SQLite.
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
              <div
                className="font-sans text-cab-mute tabular-nums"
                style={{ fontSize: "1.8cqh", lineHeight: 1.2 }}
              >
                PROFILE {displayProfile}
              </div>
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-[13fr_29fr] gap-[2.5cqw]">
            <aside className="flex min-h-0 flex-col gap-[1.2cqh] border-r-[0.4cqh] border-cab-rule pr-[1.8cqw]">
              <div className="font-display text-cab-ink" style={{ fontSize: "2.5cqh" }}>
                EDGE SELECT
              </div>

              <ul role="list" className="grid gap-[0.9cqh]">
                {CALIBRATION_EDGES.map((edge, index) => {
                  const isFocused =
                    calibrationFocus.zone === "edges" &&
                    calibrationFocus.index === index;
                  return (
                    <li key={edge.key} className="grid grid-cols-[1fr_auto_auto] gap-[0.7cqw]">
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => onFocusChange({ zone: "edges", index })}
                        className="w-full rounded-none px-[1.2cqw] py-[1.05cqh] text-left ring-1 ring-cab-rule"
                        style={{
                          background: isFocused
                            ? "linear-gradient(90deg, rgba(248,216,79,0.16), rgba(248,216,79,0.03))"
                            : "rgba(255,255,255,0.02)",
                          boxShadow: isFocused
                            ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                            : "none",
                        }}
                      >
                        <div className="flex items-baseline justify-between gap-[1cqw]">
                          <div
                            className="font-display text-cab-ink"
                            style={{ fontSize: "2.55cqh" }}
                          >
                            {edge.label}
                          </div>
                          <div
                            className="font-display text-cab-accent tabular-nums"
                            style={{ fontSize: "2.5cqh" }}
                          >
                            {previewInsets[edge.key]}%
                          </div>
                        </div>
                        <div
                          className="mt-[0.45cqh] font-sans text-cab-mute"
                          style={{ fontSize: "1.78cqh", lineHeight: 1.22 }}
                        >
                          {edge.detail}
                        </div>
                        <div
                          className="mt-[0.6cqh] font-display tracking-[0.18em] text-cab-dim"
                          style={{ fontSize: "1.7cqh" }}
                        >
                          ◂ DECREASE · ▸ INCREASE
                        </div>
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          onFocusChange({ zone: "edges", index });
                          onAdjust(edge.key, -1);
                        }}
                        className="rounded-none bg-[#0a0e14] px-[0.8cqw] py-[0.85cqh] font-display text-cab-mute ring-1 ring-cab-rule"
                        style={{ fontSize: "2.2cqh" }}
                      >
                        ◂
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          onFocusChange({ zone: "edges", index });
                          onAdjust(edge.key, 1);
                        }}
                        className="rounded-none bg-[#0a0e14] px-[0.8cqw] py-[0.85cqh] font-display text-cab-mute ring-1 ring-cab-rule"
                        style={{ fontSize: "2.2cqh" }}
                      >
                        ▸
                      </button>
                    </li>
                  );
                })}
              </ul>

              <InfoPanel
                title="Frame Goal"
                body="Everything inside the bright safe-area frame should clear the cabinet bezel without clipping the browse chrome or service text."
              />
            </aside>

            <section className="flex min-h-0 flex-col gap-[1.4cqh]">
              <div className="flex items-center justify-between gap-[1.4cqw]">
                <div
                  className="font-display tracking-[0.22em] text-cab-ink"
                  style={{ fontSize: "2.2cqh" }}
                >
                  LIVE FRAME PREVIEW
                </div>
                <div
                  className="font-sans text-cab-mute tabular-nums"
                  style={{ fontSize: "1.85cqh", lineHeight: 1.2 }}
                >
                  T {previewInsets.topInsetPercent}% · R {previewInsets.rightInsetPercent}% · B{" "}
                  {previewInsets.bottomInsetPercent}% · L {previewInsets.leftInsetPercent}%
                </div>
              </div>

              <div className="relative min-h-0 flex-1 overflow-hidden border-[0.4cqh] border-cab-rule bg-[#04070d]">
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 46%, rgba(248,216,79,0.08), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 20%), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 6cqw), repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 6cqh)",
                  }}
                />
                <div
                  aria-hidden
                  className="absolute left-1/2 top-[5%] bottom-[5%] w-[0.16cqh] -translate-x-1/2 bg-cab-rule"
                  style={{ opacity: 0.55 }}
                />
                <div
                  aria-hidden
                  className="absolute left-[5%] right-[5%] top-1/2 h-[0.16cqh] -translate-y-1/2 bg-cab-rule"
                  style={{ opacity: 0.55 }}
                />

                {[
                  { label: "TL", top: "5.2%", left: "5.4%" },
                  { label: "TR", top: "5.2%", right: "5.4%" },
                  { label: "BL", bottom: "5.2%", left: "5.4%" },
                  { label: "BR", bottom: "5.2%", right: "5.4%" },
                ].map(({ label, ...position }) => (
                  <div
                    key={label}
                    className="absolute font-display tracking-[0.22em] text-cab-dim"
                    style={{
                      ...position,
                      fontSize: "1.9cqh",
                    }}
                  >
                    {label}
                  </div>
                ))}

                <div
                  className="absolute border-[0.42cqh] border-cab-accent"
                  style={{
                    top: `${previewInsets.topInsetPercent}%`,
                    right: `${previewInsets.rightInsetPercent}%`,
                    bottom: `${previewInsets.bottomInsetPercent}%`,
                    left: `${previewInsets.leftInsetPercent}%`,
                    boxShadow: "0 0 0 0.32cqh rgba(248,216,79,0.24)",
                  }}
                >
                  <div
                    className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[145%] rounded-none bg-black/85 px-[0.8cqw] py-[0.3cqh] font-display text-cab-accent tabular-nums"
                    style={{ fontSize: "1.75cqh" }}
                  >
                    TOP {previewInsets.topInsetPercent}%
                  </div>
                  <div
                    className="absolute right-0 top-1/2 translate-x-[112%] -translate-y-1/2 rounded-none bg-black/85 px-[0.8cqw] py-[0.3cqh] font-display text-cab-accent tabular-nums"
                    style={{ fontSize: "1.75cqh" }}
                  >
                    RIGHT {previewInsets.rightInsetPercent}%
                  </div>
                  <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[145%] rounded-none bg-black/85 px-[0.8cqw] py-[0.3cqh] font-display text-cab-accent tabular-nums"
                    style={{ fontSize: "1.75cqh" }}
                  >
                    BOTTOM {previewInsets.bottomInsetPercent}%
                  </div>
                  <div
                    className="absolute left-0 top-1/2 -translate-x-[112%] -translate-y-1/2 rounded-none bg-black/85 px-[0.8cqw] py-[0.3cqh] font-display text-cab-accent tabular-nums"
                    style={{ fontSize: "1.75cqh" }}
                  >
                    LEFT {previewInsets.leftInsetPercent}%
                  </div>

                  <div
                    aria-hidden
                    className="absolute inset-[1.8cqh] border-[0.24cqh] border-dashed border-cab-rule"
                    style={{ opacity: 0.65 }}
                  />
                  <div className="absolute inset-0 grid place-items-center px-[3cqw] text-center">
                    <div className="flex flex-col items-center gap-[1.2cqh]">
                      <div
                        className="font-display tracking-[0.32em] text-cab-accent"
                        style={{ fontSize: "2.2cqh" }}
                      >
                        SAFE AREA
                      </div>
                      <div
                        className="font-display text-cab-ink"
                        style={{ fontSize: "6.6cqh", lineHeight: 0.92 }}
                      >
                        KEEP ALL UI INSIDE
                      </div>
                      <p
                        className="max-w-[44cqw] font-sans text-cab-mute"
                        style={{ fontSize: "2.05cqh", lineHeight: 1.22 }}
                      >
                        This bright frame represents the persisted inset values.
                        Keep the mode bar, list marker, preview labels, and
                        control footer inside it on the physical display.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-center gap-[2cqw] border-t-[0.4cqh] border-cab-rule pt-[1.6cqh]">
            <div
              className="font-sans text-cab-mute"
              style={{ fontSize: "1.9cqh", lineHeight: 1.25 }}
            >
              {status === "idle"
                ? "Left and right adjust the selected edge live. Back returns to service mode without closing the hidden admin surface."
                : status === "saving"
                  ? "Persisting display calibration."
                  : status.message}
            </div>

            <div className="flex items-center gap-[1cqw]">
              <button
                type="button"
                tabIndex={-1}
                onClick={onBack}
                className="rounded-none bg-transparent px-[1.2cqw] py-[0.85cqh] font-display text-cab-mute ring-1 ring-cab-rule"
                style={{
                  fontSize: "1.9cqh",
                  color:
                    calibrationFocus.zone === "actions" &&
                    calibrationFocus.action === "back"
                      ? "var(--color-cab-ink)"
                      : "var(--color-cab-mute)",
                  boxShadow:
                    calibrationFocus.zone === "actions" &&
                    calibrationFocus.action === "back"
                      ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                      : "none",
                  background:
                    calibrationFocus.zone === "actions" &&
                    calibrationFocus.action === "back"
                      ? "rgba(248,216,79,0.08)"
                      : "transparent",
                }}
              >
                BACK TO SERVICE
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={onReset}
                className="rounded-none bg-transparent px-[1.2cqw] py-[0.85cqh] font-display text-cab-mute ring-1 ring-cab-rule"
                style={{
                  fontSize: "1.9cqh",
                  color:
                    calibrationFocus.zone === "actions" &&
                    calibrationFocus.action === "defaults"
                      ? "var(--color-cab-ink)"
                      : "var(--color-cab-mute)",
                  boxShadow:
                    calibrationFocus.zone === "actions" &&
                    calibrationFocus.action === "defaults"
                      ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                      : "none",
                  background:
                    calibrationFocus.zone === "actions" &&
                    calibrationFocus.action === "defaults"
                      ? "rgba(248,216,79,0.08)"
                      : "transparent",
                }}
              >
                DEFAULT FRAME
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={onSave}
                className="rounded-none bg-cab-accent px-[1.4cqw] py-[0.85cqh] font-display text-black ring-1 ring-cab-accent"
                style={{
                  fontSize: "2cqh",
                  boxShadow:
                    calibrationFocus.zone === "actions" &&
                    calibrationFocus.action === "save"
                      ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
                      : "none",
                  filter:
                    calibrationFocus.zone === "actions" &&
                    calibrationFocus.action === "save"
                      ? "brightness(1.05)"
                      : "none",
                }}
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

function CalibrationLauncher({
  settingsDraft,
  isFocused,
  onFocusChange,
  onOpen,
}: {
  settingsDraft: CabinetConfigDraft;
  isFocused: boolean;
  onFocusChange: () => void;
  onOpen: () => void;
}) {
  const previewInsets = getCalibrationPreviewInsets(settingsDraft);

  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => {
        onFocusChange();
        onOpen();
      }}
      className="grid gap-[1.1cqh] rounded-none px-[1.2cqw] py-[1.2cqh] text-left ring-1 ring-cab-rule"
      style={{
        background: isFocused
          ? "linear-gradient(90deg, rgba(248,216,79,0.16), rgba(248,216,79,0.03))"
          : "rgba(255,255,255,0.02)",
        boxShadow: isFocused
          ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
          : "none",
      }}
    >
      <div className="flex items-start justify-between gap-[1.4cqw]">
        <div className="grid gap-[0.45cqh]">
          <div className="font-display text-cab-ink" style={{ fontSize: "2.5cqh" }}>
            OPEN CALIBRATION SCREEN
          </div>
          <div
            className="max-w-[56ch] font-sans text-cab-mute"
            style={{ fontSize: "1.88cqh", lineHeight: 1.22 }}
          >
            Use the live frame preview to set LCD-safe insets against the real
            cabinet bezel instead of editing raw numbers blind.
          </div>
        </div>
        <div
          className="font-display tracking-[0.2em] text-cab-accent"
          style={{ fontSize: "1.85cqh" }}
        >
          PRESS START
        </div>
      </div>

      <div className="grid grid-cols-4 gap-[0.8cqw]">
        {CALIBRATION_EDGES.map((edge) => (
          <div
            key={edge.key}
            className="bg-[#0a0e14] px-[0.8cqw] py-[0.75cqh] ring-1 ring-cab-rule"
          >
            <div
              className="font-display text-cab-mute"
              style={{ fontSize: "1.65cqh" }}
            >
              {edge.label}
            </div>
            <div
              className="font-display text-cab-accent tabular-nums"
              style={{ fontSize: "2.3cqh" }}
            >
              {previewInsets[edge.key]}%
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

function ServicePanelLauncher({
  title,
  body,
  hint,
  isFocused,
  onFocusChange,
  onRun,
}: {
  title: string;
  body: string;
  hint: string;
  isFocused: boolean;
  onFocusChange: () => void;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => {
        onFocusChange();
        onRun();
      }}
      className="grid gap-[0.9cqh] rounded-none px-[1.2cqw] py-[1.1cqh] text-left ring-1 ring-cab-rule"
      style={{
        background: isFocused
          ? "linear-gradient(90deg, rgba(248,216,79,0.16), rgba(248,216,79,0.03))"
          : "rgba(255,255,255,0.02)",
        boxShadow: isFocused
          ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
          : "none",
      }}
    >
      <div className="flex items-start justify-between gap-[1.4cqw]">
        <div className="grid gap-[0.45cqh]">
          <div className="font-display text-cab-ink" style={{ fontSize: "2.45cqh" }}>
            {title}
          </div>
          <div
            className="max-w-[58ch] font-sans text-cab-mute"
            style={{ fontSize: "1.88cqh", lineHeight: 1.22 }}
          >
            {body}
          </div>
        </div>
        <div
          className="font-display tracking-[0.2em] text-cab-accent"
          style={{ fontSize: "1.8cqh" }}
        >
          {hint}
        </div>
      </div>
    </button>
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

type ServiceFieldControlProps = {
  fieldKey: ServiceFieldKey;
  label: string;
  name: string;
  value: string;
  isFocused: boolean;
  isEditing: boolean;
  fieldRefs: MutableRefObject<
    Partial<Record<ServiceFieldKey, HTMLInputElement | HTMLTextAreaElement | null>>
  >;
  onChange: (value: string) => void;
  onFocusChange: (focus: ServiceFocusTarget) => void;
  onActivate: (field: ServiceFieldKey) => void;
  onBlur: (field: ServiceFieldKey) => void;
};

function TextInputField({
  id,
  fieldKey,
  label,
  name,
  value,
  placeholder,
  isFocused,
  isEditing,
  fieldRefs,
  onChange,
  onFocusChange,
  onActivate,
  onBlur,
}: ServiceFieldControlProps & {
  id: string;
  placeholder: string;
}) {
  return (
    <label
      htmlFor={id}
      className="grid gap-[0.55cqh] rounded-none px-[0.7cqw] py-[0.55cqh]"
      style={{
        background: isFocused ? "rgba(248,216,79,0.08)" : "transparent",
        boxShadow: isFocused
          ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
          : "none",
      }}
      onClick={() => onFocusChange({ zone: "field", key: fieldKey })}
      onDoubleClick={() => onActivate(fieldKey)}
    >
      <span className="font-display text-cab-ink" style={{ fontSize: "2.2cqh" }}>
        {label}
      </span>
      <input
        id={id}
        ref={(element) => {
          fieldRefs.current[fieldKey] = element;
        }}
        name={name}
        tabIndex={-1}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => {
          onFocusChange({ zone: "field", key: fieldKey });
        }}
        onBlur={() => onBlur(fieldKey)}
        className="w-full rounded-none bg-[#090d13] px-[1.1cqw] py-[1cqh] font-sans text-cab-ink ring-1 ring-cab-rule outline-none placeholder:text-cab-dim focus:ring-[0.35cqh] focus:ring-cab-accent/55"
        style={{
          fontSize: "2.05cqh",
          caretColor: isEditing ? "var(--color-cab-accent)" : "transparent",
        }}
        readOnly={!isEditing}
      />
      <div
        className="font-sans text-cab-dim"
        style={{ fontSize: "1.5cqh", lineHeight: 1.2 }}
      >
        {isEditing ? "EDITING · ESC TO EXIT" : "PRESS START TO EDIT"}
      </div>
    </label>
  );
}

function NumberInputField({
  id,
  fieldKey,
  label,
  name,
  value,
  min,
  max,
  isFocused,
  isEditing,
  fieldRefs,
  onChange,
  onFocusChange,
  onActivate,
  onBlur,
}: ServiceFieldControlProps & {
  id: string;
  min: number;
  max: number;
}) {
  return (
    <label
      htmlFor={id}
      className="grid gap-[0.55cqh] rounded-none px-[0.7cqw] py-[0.55cqh]"
      style={{
        background: isFocused ? "rgba(248,216,79,0.08)" : "transparent",
        boxShadow: isFocused
          ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
          : "none",
      }}
      onClick={() => onFocusChange({ zone: "field", key: fieldKey })}
      onDoubleClick={() => onActivate(fieldKey)}
    >
      <span className="font-display text-cab-ink" style={{ fontSize: "2.2cqh" }}>
        {label}
      </span>
      <input
        id={id}
        ref={(element) => {
          fieldRefs.current[fieldKey] = element;
        }}
        name={name}
        tabIndex={-1}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => {
          onFocusChange({ zone: "field", key: fieldKey });
        }}
        onBlur={() => onBlur(fieldKey)}
        className="w-full rounded-none bg-[#090d13] px-[1.1cqw] py-[1cqh] font-sans text-cab-ink ring-1 ring-cab-rule outline-none focus:ring-[0.35cqh] focus:ring-cab-accent/55"
        style={{
          fontSize: "2.05cqh",
          caretColor: isEditing ? "var(--color-cab-accent)" : "transparent",
        }}
        readOnly={!isEditing}
      />
      <div
        className="font-sans text-cab-dim"
        style={{ fontSize: "1.5cqh", lineHeight: 1.2 }}
      >
        {isEditing ? "EDITING · ESC TO EXIT" : "PRESS START TO EDIT"}
      </div>
    </label>
  );
}

function TextAreaField({
  id,
  fieldKey,
  label,
  name,
  value,
  placeholder,
  isFocused,
  isEditing,
  fieldRefs,
  onChange,
  onFocusChange,
  onActivate,
  onBlur,
}: ServiceFieldControlProps & {
  id: string;
  placeholder: string;
}) {
  return (
    <label
      htmlFor={id}
      className="grid gap-[0.55cqh] rounded-none px-[0.7cqw] py-[0.55cqh]"
      style={{
        background: isFocused ? "rgba(248,216,79,0.08)" : "transparent",
        boxShadow: isFocused
          ? "0 0 0 0.32cqh rgba(248,216,79,0.34)"
          : "none",
      }}
      onClick={() => onFocusChange({ zone: "field", key: fieldKey })}
      onDoubleClick={() => onActivate(fieldKey)}
    >
      <span className="font-display text-cab-ink" style={{ fontSize: "2.2cqh" }}>
        {label}
      </span>
      <textarea
        id={id}
        ref={(element) => {
          fieldRefs.current[fieldKey] = element;
        }}
        name={name}
        tabIndex={-1}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => {
          onFocusChange({ zone: "field", key: fieldKey });
        }}
        onBlur={() => onBlur(fieldKey)}
        className="min-h-[12cqh] w-full resize-none rounded-none bg-[#090d13] px-[1.1cqw] py-[1cqh] font-sans text-cab-ink ring-1 ring-cab-rule outline-none placeholder:text-cab-dim focus:ring-[0.35cqh] focus:ring-cab-accent/55"
        style={{
          fontSize: "2.05cqh",
          lineHeight: 1.25,
          caretColor: isEditing ? "var(--color-cab-accent)" : "transparent",
        }}
        readOnly={!isEditing}
      />
      <div
        className="font-sans text-cab-dim"
        style={{ fontSize: "1.5cqh", lineHeight: 1.2 }}
      >
        {isEditing ? "EDITING · ESC TO EXIT" : "PRESS START TO EDIT"}
      </div>
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
