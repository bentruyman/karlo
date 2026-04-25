use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension};
use tauri::{Manager, Runtime};

use crate::{contract, db, importer, seed};

const DATABASE_FILENAME: &str = "karlo.sqlite3";

pub struct AppState {
    db_path: PathBuf,
}

impl AppState {
    pub fn initialize<R: Runtime, M: Manager<R>>(manager: &M) -> Result<Self, String> {
        let data_dir = manager.path().app_data_dir().map_err(|error| error.to_string())?;
        fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;

        let state = Self {
            db_path: data_dir.join(DATABASE_FILENAME),
        };

        state.ensure_schema()?;
        state.seed_default_settings()?;
        state.seed_mock_library_data()?;

        Ok(state)
    }

    pub fn load_cabinet_config(&self) -> Result<contract::CabinetConfig, String> {
        let connection = self.open_connection()?;
        let settings = self.load_settings_map(&connection)?;
        let default_config = contract::default_cabinet_config();

        Ok(contract::CabinetConfig {
            display_profile: default_config.display_profile,
            paths: contract::CabinetPaths {
                mame_executable_path: setting_or_default(
                    &settings,
                    "mame_executable_path",
                    default_config.paths.mame_executable_path,
                ),
                mame_ini_path: settings
                    .get("mame_ini_path")
                    .and_then(|value| non_empty_string(value)),
                rom_roots: json_array_or_default(
                    &settings,
                    "rom_roots_json",
                    default_config.paths.rom_roots,
                )?,
                media_roots: json_array_or_default(
                    &settings,
                    "media_roots_json",
                    default_config.paths.media_roots,
                )?,
                preview_video_root: setting_or_default(
                    &settings,
                    "preview_video_root",
                    default_config.paths.preview_video_root,
                ),
                artwork_root: setting_or_default(
                    &settings,
                    "artwork_root",
                    default_config.paths.artwork_root,
                ),
            },
            attract_timeout_seconds: settings
                .get("attract_timeout_seconds")
                .and_then(|value| value.parse::<u16>().ok())
                .unwrap_or(default_config.attract_timeout_seconds),
            display_calibration: settings
                .get("display_calibration_json")
                .map(|value| serde_json::from_str(value))
                .transpose()
                .map_err(|error| error.to_string())?
                .unwrap_or(default_config.display_calibration),
        })
    }

    pub fn save_cabinet_config(&self, cabinet_config: &contract::CabinetConfig) -> Result<(), String> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;

        for (key, value) in settings_pairs(cabinet_config)? {
            transaction
                .execute(
                    "INSERT INTO settings (key, value) VALUES (?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    params![key, value],
                )
                .map_err(|error| error.to_string())?;
        }

        transaction.commit().map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn load_library_snapshot(&self) -> Result<contract::LibrarySnapshot, String> {
        let connection = self.open_connection()?;

        Ok(contract::LibrarySnapshot {
            imported_games: self.load_imported_games(&connection)?,
            library_entries: self.load_library_entries(&connection)?,
            recent_games: self.load_recent_games(&connection)?,
        })
    }

    pub fn toggle_game_favorite(&self, machine_name: &str) -> Result<contract::LibrarySnapshot, String> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let game_id = lookup_game_id(&transaction, machine_name)?;
        let current_favorite = transaction
            .query_row(
                "SELECT is_favorite FROM library_entries WHERE game_id = ?1",
                params![game_id],
                |row| row.get::<_, bool>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .unwrap_or(false);

        transaction
            .execute(
                "INSERT INTO library_entries (
                    game_id,
                    is_visible,
                    is_favorite,
                    include_in_attract_mode
                 ) VALUES (?1, 1, ?2, 1)
                 ON CONFLICT(game_id) DO UPDATE SET
                    is_favorite = excluded.is_favorite",
                params![game_id, !current_favorite],
            )
            .map_err(|error| error.to_string())?;

        transaction.commit().map_err(|error| error.to_string())?;
        self.load_library_snapshot()
    }

    pub fn record_recent_game(&self, machine_name: &str) -> Result<contract::LibrarySnapshot, String> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let game_id = lookup_game_id(&transaction, machine_name)?;

        transaction
            .execute(
                "INSERT INTO recent_games (game_id, last_played_at) VALUES (?1, ?2)
                 ON CONFLICT(game_id) DO UPDATE SET
                    last_played_at = excluded.last_played_at",
                params![game_id, current_timestamp_text()?],
            )
            .map_err(|error| error.to_string())?;

        transaction.commit().map_err(|error| error.to_string())?;
        self.load_library_snapshot()
    }

    pub fn import_mame_catalog(&self) -> Result<contract::LibraryMaintenanceResult, String> {
        let cabinet_config = self.load_cabinet_config()?;
        let imported_machines =
            importer::import_mame_catalog(&cabinet_config.paths.mame_executable_path)?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let existing_games = self.load_existing_game_state(&transaction)?;

        for machine in &imported_machines {
            let existing = existing_games.get(&machine.machine_name);
            let genre = existing
                .and_then(|state| state.genre.clone())
                .unwrap_or_else(|| "Unknown".to_owned());
            let rom_available = existing.map(|state| state.rom_available).unwrap_or(false);
            let video_path = existing.and_then(|state| state.video_path.clone());
            let artwork_paths = existing
                .map(|state| state.artwork_paths.clone())
                .unwrap_or_default();

            transaction
                .execute(
                    "INSERT INTO games (
                        machine_name,
                        title,
                        year,
                        manufacturer,
                        genre,
                        rom_available,
                        video_path,
                        artwork_paths_json
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                     ON CONFLICT(machine_name) DO UPDATE SET
                        title = excluded.title,
                        year = excluded.year,
                        manufacturer = excluded.manufacturer,
                        genre = excluded.genre,
                        rom_available = excluded.rom_available,
                        video_path = excluded.video_path,
                        artwork_paths_json = excluded.artwork_paths_json",
                    params![
                        machine.machine_name,
                        machine.title,
                        i64::from(machine.year),
                        machine.manufacturer,
                        genre,
                        rom_available,
                        video_path,
                        serde_json::to_string(&artwork_paths).map_err(|error| error.to_string())?,
                    ],
                )
                .map_err(|error| error.to_string())?;
        }

        transaction.commit().map_err(|error| error.to_string())?;
        let snapshot = self.load_library_snapshot()?;
        let rom_available_count = snapshot
            .imported_games
            .iter()
            .filter(|game| game.rom_available)
            .count();

        Ok(contract::LibraryMaintenanceResult {
            snapshot,
            imported_games_count: imported_machines.len(),
            rom_available_count,
            message: format!(
                "Imported {} MAME machines from -listxml.",
                imported_machines.len()
            ),
        })
    }

    pub fn scan_rom_roots(&self) -> Result<contract::LibraryMaintenanceResult, String> {
        let cabinet_config = self.load_cabinet_config()?;
        let discovered_machine_names = importer::scan_rom_roots(&cabinet_config.paths.rom_roots)?;
        let media_roots = MediaRootCandidates::from_paths(&cabinet_config.paths);
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;

        let game_rows = load_game_rows(&transaction)?;
        for row in &game_rows {
            let is_available = discovered_machine_names.contains(&row.machine_name);
            let video_path = media_roots.video_path_for(&row.machine_name);
            let artwork_paths = media_roots.artwork_paths_for(&row.machine_name);
            transaction
                .execute(
                    "UPDATE games
                     SET rom_available = ?2,
                         video_path = ?3,
                         artwork_paths_json = ?4
                     WHERE id = ?1",
                    params![
                        row.id,
                        is_available,
                        video_path,
                        serde_json::to_string(&artwork_paths).map_err(|error| error.to_string())?,
                    ],
                )
                .map_err(|error| error.to_string())?;
        }

        seed_missing_library_entries(&transaction, &game_rows, &discovered_machine_names)?;
        transaction.commit().map_err(|error| error.to_string())?;

        let snapshot = self.load_library_snapshot()?;
        let rom_available_count = snapshot
            .imported_games
            .iter()
            .filter(|game| game.rom_available)
            .count();

        Ok(contract::LibraryMaintenanceResult {
            imported_games_count: snapshot.imported_games.len(),
            rom_available_count,
            message: format!(
                "Scanned {} ROM roots and refreshed media from {} roots; found {} available sets.",
                cabinet_config.paths.rom_roots.len(),
                media_roots.configured_roots_count,
                rom_available_count,
            ),
            snapshot,
        })
    }

    fn ensure_schema(&self) -> Result<(), String> {
        let connection = self.open_connection()?;
        connection
            .execute_batch(&format!("PRAGMA foreign_keys = ON; {}", db::SCHEMA_SQL))
            .map_err(|error| error.to_string())
    }

    fn seed_default_settings(&self) -> Result<(), String> {
        let connection = self.open_connection()?;
        let default_config = contract::default_cabinet_config();

        for (key, value) in settings_pairs(&default_config)? {
            connection
                .execute(
                    "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
                    params![key, value],
                )
                .map_err(|error| error.to_string())?;
        }

        Ok(())
    }

    fn seed_mock_library_data(&self) -> Result<(), String> {
        let mut connection = self.open_connection()?;
        let existing_games: i64 = connection
            .query_row("SELECT COUNT(*) FROM games", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;

        if existing_games > 0 {
            return Ok(());
        }

        let catalog = seed::mock_catalog()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let mut recent_index = 0_u32;

        for (index, record) in catalog.iter().enumerate() {
            let video_path = record
                .attract_caption
                .as_ref()
                .map(|_| format!("media/previews/{}.mp4", record.machine_name));
            let artwork_paths = if record.attract_caption.is_some() {
                vec![format!("media/artwork/{}.png", record.machine_name)]
            } else {
                Vec::new()
            };

            transaction
                .execute(
                    "INSERT INTO games (
                        machine_name,
                        title,
                        year,
                        manufacturer,
                        genre,
                        rom_available,
                        video_path,
                        artwork_paths_json
                     ) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                    params![
                        record.machine_name,
                        record.title,
                        i64::from(record.year),
                        record.manufacturer,
                        record.genre,
                        video_path,
                        serde_json::to_string(&artwork_paths).map_err(|error| error.to_string())?,
                    ],
                )
                .map_err(|error| error.to_string())?;

            let game_id = transaction.last_insert_rowid();
            transaction
                .execute(
                    "INSERT INTO library_entries (
                        game_id,
                        is_visible,
                        is_favorite,
                        browse_sort_order,
                        attract_sort_order,
                        include_in_attract_mode
                     ) VALUES (?1, 1, ?2, ?3, ?4, 1)",
                    params![
                        game_id,
                        record.is_favorite.unwrap_or(false),
                        index as i64,
                        index as i64,
                    ],
                )
                .map_err(|error| error.to_string())?;

            if record.was_recently_played.unwrap_or(false) {
                transaction
                    .execute(
                        "INSERT INTO recent_games (game_id, last_played_at) VALUES (?1, ?2)",
                        params![game_id, seed_recent_timestamp(recent_index)],
                    )
                    .map_err(|error| error.to_string())?;
                recent_index += 1;
            }
        }

        transaction.commit().map_err(|error| error.to_string())
    }

    fn load_settings_map(&self, connection: &Connection) -> Result<HashMap<String, String>, String> {
        let mut statement = connection
            .prepare("SELECT key, value FROM settings")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|error| error.to_string())?;

        let mut settings = HashMap::new();
        for row in rows {
            let (key, value) = row.map_err(|error| error.to_string())?;
            settings.insert(key, value);
        }

        Ok(settings)
    }

    fn open_connection(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.db_path).map_err(|error| error.to_string())?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(|error| error.to_string())?;
        Ok(connection)
    }

    fn load_imported_games(
        &self,
        connection: &Connection,
    ) -> Result<Vec<contract::ImportedGameRecord>, String> {
        let mut statement = connection
            .prepare(
                "SELECT machine_name, title, year, manufacturer, genre, rom_available, video_path, artwork_paths_json
                 FROM games
                 ORDER BY title, machine_name",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                let artwork_paths_json: Option<String> = row.get(7)?;
                Ok(contract::ImportedGameRecord {
                    machine_name: row.get(0)?,
                    title: row.get(1)?,
                    year: row.get::<_, i64>(2)? as u16,
                    manufacturer: row.get(3)?,
                    genre: row.get(4)?,
                    rom_available: row.get(5)?,
                    video_path: row.get(6)?,
                    artwork_paths: artwork_paths_json
                        .map(|value| serde_json::from_str(&value))
                        .transpose()
                        .map_err(|error| {
                            rusqlite::Error::FromSqlConversionFailure(
                                7,
                                rusqlite::types::Type::Text,
                                Box::new(error),
                            )
                        })?
                        .unwrap_or_default(),
                    attract_caption: None,
                })
            })
            .map_err(|error| error.to_string())?;

        let mut imported_games = Vec::new();
        for row in rows {
            imported_games.push(row.map_err(|error| error.to_string())?);
        }

        let catalog = seed::mock_catalog()?;
        let captions_by_machine = catalog
            .into_iter()
            .filter_map(|record| {
                record
                    .attract_caption
                    .map(|caption| (record.machine_name, caption))
            })
            .collect::<HashMap<_, _>>();

        for game in &mut imported_games {
            game.attract_caption = captions_by_machine.get(&game.machine_name).cloned();
        }

        Ok(imported_games)
    }

    fn load_library_entries(
        &self,
        connection: &Connection,
    ) -> Result<Vec<contract::LibraryEntryRecord>, String> {
        let mut statement = connection
            .prepare(
                "SELECT
                    games.machine_name,
                    library_entries.is_visible,
                    library_entries.is_favorite,
                    library_entries.browse_sort_order,
                    library_entries.attract_sort_order,
                    library_entries.include_in_attract_mode
                 FROM library_entries
                 INNER JOIN games ON games.id = library_entries.game_id
                 ORDER BY COALESCE(library_entries.browse_sort_order, 2147483647), games.title, games.machine_name",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(contract::LibraryEntryRecord {
                    machine_name: row.get(0)?,
                    is_visible: row.get(1)?,
                    is_favorite: row.get(2)?,
                    browse_sort_order: row.get(3)?,
                    attract_sort_order: row.get(4)?,
                    include_in_attract_mode: row.get(5)?,
                })
            })
            .map_err(|error| error.to_string())?;

        let mut library_entries = Vec::new();
        for row in rows {
            library_entries.push(row.map_err(|error| error.to_string())?);
        }

        Ok(library_entries)
    }

    fn load_recent_games(
        &self,
        connection: &Connection,
    ) -> Result<Vec<contract::RecentGameRecord>, String> {
        let mut statement = connection
            .prepare(
                "SELECT
                    games.machine_name,
                    recent_games.last_played_at
                 FROM recent_games
                 INNER JOIN games ON games.id = recent_games.game_id
                 ORDER BY recent_games.last_played_at DESC, games.machine_name",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(contract::RecentGameRecord {
                    machine_name: row.get(0)?,
                    last_played_at: row.get(1)?,
                })
            })
            .map_err(|error| error.to_string())?;

        let mut recent_games = Vec::new();
        for row in rows {
            recent_games.push(row.map_err(|error| error.to_string())?);
        }

        Ok(recent_games)
    }

    fn load_existing_game_state(
        &self,
        connection: &Connection,
    ) -> Result<HashMap<String, ExistingGameState>, String> {
        let mut statement = connection
            .prepare(
                "SELECT machine_name, genre, rom_available, video_path, artwork_paths_json
                 FROM games",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                let artwork_paths_json: Option<String> = row.get(4)?;
                Ok(ExistingGameState {
                    machine_name: row.get(0)?,
                    genre: row.get(1)?,
                    rom_available: row.get(2)?,
                    video_path: row.get(3)?,
                    artwork_paths: artwork_paths_json
                        .map(|value| serde_json::from_str(&value))
                        .transpose()
                        .map_err(|error| {
                            rusqlite::Error::FromSqlConversionFailure(
                                4,
                                rusqlite::types::Type::Text,
                                Box::new(error),
                            )
                        })?
                        .unwrap_or_default(),
                })
            })
            .map_err(|error| error.to_string())?;

        let mut map = HashMap::new();
        for row in rows {
            let row = row.map_err(|error| error.to_string())?;
            map.insert(row.machine_name.clone(), row);
        }
        Ok(map)
    }
}

fn settings_pairs(cabinet_config: &contract::CabinetConfig) -> Result<Vec<(String, String)>, String> {
    Ok(vec![
        (
            "mame_executable_path".to_owned(),
            cabinet_config.paths.mame_executable_path.clone(),
        ),
        (
            "mame_ini_path".to_owned(),
            cabinet_config
                .paths
                .mame_ini_path
                .clone()
                .unwrap_or_default(),
        ),
        (
            "rom_roots_json".to_owned(),
            serde_json::to_string(&cabinet_config.paths.rom_roots).map_err(|error| error.to_string())?,
        ),
        (
            "media_roots_json".to_owned(),
            serde_json::to_string(&cabinet_config.paths.media_roots)
                .map_err(|error| error.to_string())?,
        ),
        (
            "preview_video_root".to_owned(),
            cabinet_config.paths.preview_video_root.clone(),
        ),
        (
            "artwork_root".to_owned(),
            cabinet_config.paths.artwork_root.clone(),
        ),
        (
            "attract_timeout_seconds".to_owned(),
            cabinet_config.attract_timeout_seconds.to_string(),
        ),
        (
            "display_calibration_json".to_owned(),
            serde_json::to_string(&cabinet_config.display_calibration)
                .map_err(|error| error.to_string())?,
        ),
    ])
}

fn setting_or_default(settings: &HashMap<String, String>, key: &str, default_value: String) -> String {
    settings
        .get(key)
        .and_then(|value| non_empty_string(value))
        .unwrap_or(default_value)
}

fn non_empty_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_owned())
    }
}

fn json_array_or_default(
    settings: &HashMap<String, String>,
    key: &str,
    default_value: Vec<String>,
) -> Result<Vec<String>, String> {
    match settings.get(key) {
        Some(value) => serde_json::from_str(value).map_err(|error| error.to_string()),
        None => Ok(default_value),
    }
}

fn lookup_game_id(connection: &Connection, machine_name: &str) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT id FROM games WHERE machine_name = ?1",
            params![machine_name],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("Unknown game: {machine_name}"))
}

fn current_timestamp_text() -> Result<String, String> {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    Ok(seconds.to_string())
}

fn seed_recent_timestamp(index: u32) -> String {
    (1_776_470_400_u64 + u64::from(index)).to_string()
}

fn load_game_rows(connection: &Connection) -> Result<Vec<GameRow>, String> {
    let mut statement = connection
        .prepare("SELECT id, machine_name FROM games ORDER BY title, machine_name")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(GameRow {
                id: row.get(0)?,
                machine_name: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut game_rows = Vec::new();
    for row in rows {
        game_rows.push(row.map_err(|error| error.to_string())?);
    }
    Ok(game_rows)
}

fn seed_missing_library_entries(
    connection: &Connection,
    game_rows: &[GameRow],
    discovered_machine_names: &HashSet<String>,
) -> Result<(), String> {
    let existing_ids = existing_library_entry_ids(connection)?;
    let mut next_sort_order = next_library_sort_order(connection)?;

    for row in game_rows {
        if existing_ids.contains(&row.id) || !discovered_machine_names.contains(&row.machine_name) {
            continue;
        }

        connection
            .execute(
                "INSERT INTO library_entries (
                    game_id,
                    is_visible,
                    is_favorite,
                    browse_sort_order,
                    attract_sort_order,
                    include_in_attract_mode
                 ) VALUES (?1, 1, 0, ?2, ?3, 1)",
                params![row.id, next_sort_order, next_sort_order],
            )
            .map_err(|error| error.to_string())?;

        next_sort_order += 1;
    }

    Ok(())
}

fn existing_library_entry_ids(connection: &Connection) -> Result<HashSet<i64>, String> {
    let mut statement = connection
        .prepare("SELECT game_id FROM library_entries")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get(0))
        .map_err(|error| error.to_string())?;

    let mut ids = HashSet::new();
    for row in rows {
        ids.insert(row.map_err(|error| error.to_string())?);
    }
    Ok(ids)
}

fn next_library_sort_order(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COALESCE(MAX(browse_sort_order), -1) + 1 FROM library_entries",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

struct MediaRootCandidates {
    video_roots: Vec<PathBuf>,
    artwork_roots: Vec<PathBuf>,
    configured_roots_count: usize,
}

impl MediaRootCandidates {
    fn from_paths(paths: &contract::CabinetPaths) -> Self {
        let video_roots =
            media_candidates(&paths.preview_video_root, &paths.media_roots, &["videos"]);
        let artwork_roots = media_candidates(&paths.artwork_root, &paths.media_roots, &["artwork"]);
        let configured_roots_count = paths
            .media_roots
            .iter()
            .filter(|root| !root.trim().is_empty())
            .count()
            + usize::from(!paths.preview_video_root.trim().is_empty())
            + usize::from(!paths.artwork_root.trim().is_empty());

        Self {
            video_roots,
            artwork_roots,
            configured_roots_count,
        }
    }

    fn video_path_for(&self, machine_name: &str) -> Option<String> {
        find_media_file(&self.video_roots, machine_name, &["mp4"])
    }

    fn artwork_paths_for(&self, machine_name: &str) -> Vec<String> {
        ARTWORK_SUBDIRECTORIES
            .iter()
            .filter_map(|subdirectory| {
                let roots = self
                    .artwork_roots
                    .iter()
                    .map(|root| root.join(subdirectory))
                    .collect::<Vec<_>>();
                find_media_file(&roots, machine_name, &["png", "jpg", "jpeg"])
            })
            .collect()
    }
}

const ARTWORK_SUBDIRECTORIES: [&str; 5] = ["title", "preview", "marquee", "cabinet", "flyer"];

fn media_candidates(
    primary_root: &str,
    media_roots: &[String],
    fallback_segments: &[&str],
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(root) = non_empty_string(primary_root) {
        push_unique_path(&mut candidates, PathBuf::from(root));
    }

    for media_root in media_roots {
        if let Some(root) = non_empty_string(media_root) {
            let root = PathBuf::from(root);
            push_unique_path(&mut candidates, root.clone());
            let mut fallback = root;
            for segment in fallback_segments {
                fallback = fallback.join(segment);
            }
            push_unique_path(&mut candidates, fallback);
        }
    }

    candidates
}

fn push_unique_path(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|existing| existing == &candidate) {
        paths.push(candidate);
    }
}

fn find_media_file(roots: &[PathBuf], machine_name: &str, extensions: &[&str]) -> Option<String> {
    for root in roots {
        for extension in extensions {
            let path = root.join(format!("{machine_name}.{extension}"));
            if file_exists(&path) {
                return Some(path.to_string_lossy().into_owned());
            }
        }
    }

    None
}

fn file_exists(path: &Path) -> bool {
    path.metadata()
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
}

#[derive(Debug, Clone)]
struct ExistingGameState {
    machine_name: String,
    genre: Option<String>,
    rom_available: bool,
    video_path: Option<String>,
    artwork_paths: Vec<String>,
}

#[derive(Debug, Clone)]
struct GameRow {
    id: i64,
    machine_name: String,
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    #[test]
    fn cabinet_config_round_trips_through_sqlite_settings() {
        let path = temp_database_path("round-trip");
        let state = AppState {
            db_path: path.clone(),
        };
        state.ensure_schema().unwrap();
        state.seed_default_settings().unwrap();

        let mut cabinet_config = contract::default_cabinet_config();
        cabinet_config.paths.mame_executable_path = "/usr/local/bin/mame".to_owned();
        cabinet_config.paths.mame_ini_path = Some("/etc/mame.ini".to_owned());
        cabinet_config.paths.rom_roots = vec!["/roms/a".to_owned(), "/roms/b".to_owned()];
        cabinet_config.paths.media_roots = vec!["/media".to_owned()];
        cabinet_config.paths.preview_video_root = "/media/previews".to_owned();
        cabinet_config.paths.artwork_root = "/media/artwork".to_owned();
        cabinet_config.attract_timeout_seconds = 27;
        cabinet_config.display_calibration.left_inset_percent = 7;

        state.save_cabinet_config(&cabinet_config).unwrap();

        assert_eq!(state.load_cabinet_config().unwrap(), cabinet_config);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn missing_settings_fall_back_to_defaults() {
        let path = temp_database_path("defaults");
        let state = AppState {
            db_path: path.clone(),
        };
        state.ensure_schema().unwrap();

        let loaded = state.load_cabinet_config().unwrap();

        assert_eq!(loaded, contract::default_cabinet_config());

        let _ = fs::remove_file(path);
    }

    #[test]
    fn library_snapshot_seeds_from_shared_mock_catalog() {
        let path = temp_database_path("library-seed");
        let state = AppState {
            db_path: path.clone(),
        };
        state.ensure_schema().unwrap();
        state.seed_mock_library_data().unwrap();

        let snapshot = state.load_library_snapshot().unwrap();

        assert!(snapshot.imported_games.len() > 30);
        assert_eq!(snapshot.imported_games[0].machine_name, "1942");
        assert!(snapshot.library_entries.iter().any(|entry| entry.is_favorite));
        assert!(snapshot.recent_games.iter().any(|entry| entry.machine_name == "pacman"));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn favorite_toggles_and_recents_are_persisted() {
        let path = temp_database_path("library-updates");
        let state = AppState {
            db_path: path.clone(),
        };
        state.ensure_schema().unwrap();
        state.seed_mock_library_data().unwrap();

        let snapshot = state.toggle_game_favorite("1942").unwrap();
        let game = snapshot
            .library_entries
            .iter()
            .find(|entry| entry.machine_name == "1942")
            .unwrap();
        assert!(game.is_favorite);

        let snapshot = state.record_recent_game("1942").unwrap();
        assert!(snapshot
            .recent_games
            .iter()
            .any(|entry| entry.machine_name == "1942"));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn rom_scan_reconciles_staged_media_paths() {
        let path = temp_database_path("media-scan");
        let library_root = temp_library_path("media-scan");
        let rom_root = library_root.join("roms/mame");
        let media_root = library_root.join("media/mame");
        let video_path = media_root.join("videos/1942.mp4");
        let title_path = media_root.join("artwork/title/1942.png");
        let marquee_path = media_root.join("artwork/marquee/1942.png");
        let state = AppState {
            db_path: path.clone(),
        };
        state.ensure_schema().unwrap();
        state.seed_default_settings().unwrap();
        state.seed_mock_library_data().unwrap();

        fs::create_dir_all(&rom_root).unwrap();
        fs::create_dir_all(video_path.parent().unwrap()).unwrap();
        fs::create_dir_all(title_path.parent().unwrap()).unwrap();
        fs::create_dir_all(marquee_path.parent().unwrap()).unwrap();
        fs::write(rom_root.join("1942.zip"), []).unwrap();
        fs::write(&video_path, []).unwrap();
        fs::write(&title_path, []).unwrap();
        fs::write(&marquee_path, []).unwrap();

        let mut cabinet_config = contract::default_cabinet_config();
        cabinet_config.paths.rom_roots = vec![rom_root.to_string_lossy().into_owned()];
        cabinet_config.paths.media_roots = vec![media_root.to_string_lossy().into_owned()];
        state.save_cabinet_config(&cabinet_config).unwrap();

        let result = state.scan_rom_roots().unwrap();
        let game = result
            .snapshot
            .imported_games
            .iter()
            .find(|game| game.machine_name == "1942")
            .unwrap();
        let missing_game = result
            .snapshot
            .imported_games
            .iter()
            .find(|game| game.machine_name == "digdug")
            .unwrap();
        let expected_video_path = video_path.to_string_lossy().into_owned();

        assert!(game.rom_available);
        assert_eq!(
            game.video_path.as_deref(),
            Some(expected_video_path.as_str())
        );
        assert_eq!(
            game.artwork_paths,
            vec![
                title_path.to_string_lossy().into_owned(),
                marquee_path.to_string_lossy().into_owned(),
            ],
        );
        assert!(!missing_game.rom_available);
        assert_eq!(result.rom_available_count, 1);

        let _ = fs::remove_file(path);
        let _ = fs::remove_dir_all(library_root);
    }

    fn temp_database_path(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("karlo-{label}-{suffix}.sqlite3"))
    }

    fn temp_library_path(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("karlo-{label}-{suffix}"))
    }
}
