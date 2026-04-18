pub const SCHEMA_VERSION: i64 = 2;

pub const GAMES_TABLE: &str = "games";
pub const LIBRARY_ENTRIES_TABLE: &str = "library_entries";
pub const SETTINGS_TABLE: &str = "settings";
pub const RECENT_GAMES_TABLE: &str = "recent_games";

pub struct TableDefinition {
    pub name: &'static str,
    pub purpose: &'static str,
}

pub struct SettingDefinition {
    pub key: &'static str,
    pub purpose: &'static str,
    pub kind: &'static str,
    pub required: bool,
}

pub const TABLES: [TableDefinition; 4] = [
    TableDefinition {
        name: GAMES_TABLE,
        purpose: "Imported MAME machine metadata and resolved media pointers.",
    },
    TableDefinition {
        name: LIBRARY_ENTRIES_TABLE,
        purpose: "Cabinet-facing visibility, favorites, browse order, and attract-mode curation.",
    },
    TableDefinition {
        name: SETTINGS_TABLE,
        purpose: "Cabinet config such as MAME path, mame.ini path, ROM/media roots, attract timeout, and overscan calibration.",
    },
    TableDefinition {
        name: RECENT_GAMES_TABLE,
        purpose: "Last-played history for returning to recently launched machines.",
    },
];

pub const SETTINGS: [SettingDefinition; 8] = [
    SettingDefinition {
        key: "mame_executable_path",
        purpose: "MAME launcher executable used for cabinet launches.",
        kind: "path",
        required: true,
    },
    SettingDefinition {
        key: "mame_ini_path",
        purpose: "Optional mame.ini path used to align cabinet runtime behavior.",
        kind: "optionalPath",
        required: false,
    },
    SettingDefinition {
        key: "rom_roots_json",
        purpose: "Configured ROM roots scanned during manual import.",
        kind: "pathList",
        required: true,
    },
    SettingDefinition {
        key: "media_roots_json",
        purpose: "Configured media roots scanned during reconciliation.",
        kind: "pathList",
        required: true,
    },
    SettingDefinition {
        key: "preview_video_root",
        purpose: "Preferred preview-video root used for cabinet playback.",
        kind: "path",
        required: true,
    },
    SettingDefinition {
        key: "artwork_root",
        purpose: "Preferred artwork root used for marquees and flyers.",
        kind: "path",
        required: true,
    },
    SettingDefinition {
        key: "attract_timeout_seconds",
        purpose: "Idle timeout before attract mode starts cycling.",
        kind: "seconds",
        required: true,
    },
    SettingDefinition {
        key: "display_calibration_json",
        purpose: "CRT-safe inset and overscan calibration values.",
        kind: "calibration",
        required: true,
    },
];

pub const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  year INTEGER,
  manufacturer TEXT,
  genre TEXT,
  rom_available INTEGER NOT NULL DEFAULT 0,
  video_path TEXT,
  artwork_paths_json TEXT
);

CREATE TABLE IF NOT EXISTS library_entries (
  game_id INTEGER PRIMARY KEY,
  is_visible INTEGER NOT NULL DEFAULT 1,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  browse_sort_order INTEGER,
  attract_sort_order INTEGER,
  include_in_attract_mode INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recent_games (
  game_id INTEGER NOT NULL,
  last_played_at TEXT NOT NULL,
  PRIMARY KEY (game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);
"#;
