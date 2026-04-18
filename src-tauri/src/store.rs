use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
};

use rusqlite::{params, Connection};
use tauri::{Manager, Runtime};

use crate::{contract, db};

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
        Connection::open(&self.db_path).map_err(|error| error.to_string())
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

    fn temp_database_path(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("karlo-{label}-{suffix}.sqlite3"))
    }
}
