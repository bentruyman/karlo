pub const SCHEMA_VERSION: i64 = 2;

pub struct TableDefinition {
    pub name: &'static str,
    pub purpose: &'static str,
}

pub const TABLES: [TableDefinition; 4] = [
    TableDefinition {
        name: "games",
        purpose: "Imported MAME machine metadata and resolved media pointers.",
    },
    TableDefinition {
        name: "library_entries",
        purpose: "Cabinet-facing visibility, favorites, browse order, and attract-mode curation.",
    },
    TableDefinition {
        name: "settings",
        purpose: "Cabinet config such as MAME path, mame.ini path, ROM/media roots, attract timeout, and overscan calibration.",
    },
    TableDefinition {
        name: "recent_games",
        purpose: "Last-played history for returning to recently launched machines.",
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
