use serde::{Deserialize, Serialize};

const DEFAULT_VIEW: &str = "favorites";
const DISPLAY_PROFILE: &str = "lcd-1440p-16:9";
const DEFAULT_CATEGORY_INI_PATH: &str = "/srv/karlo/library/metadata/Category.ini";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayCalibration {
    pub top_inset_percent: u8,
    pub right_inset_percent: u8,
    pub bottom_inset_percent: u8,
    pub left_inset_percent: u8,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CabinetPaths {
    pub mame_executable_path: String,
    pub mame_ini_path: Option<String>,
    pub rom_roots: Vec<String>,
    pub media_roots: Vec<String>,
    pub preview_video_root: String,
    pub artwork_root: String,
    pub category_ini_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CabinetConfig {
    pub display_profile: String,
    pub paths: CabinetPaths,
    pub attract_timeout_seconds: u16,
    pub display_calibration: DisplayCalibration,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FrontendBootstrap {
    pub default_view: String,
    pub cabinet_config: CabinetConfig,
    pub media_http_base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedGameRecord {
    pub machine_name: String,
    pub title: String,
    pub year: u16,
    pub manufacturer: String,
    pub genre: String,
    pub rom_available: bool,
    pub video_path: Option<String>,
    pub artwork_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntryRecord {
    pub machine_name: String,
    pub is_visible: bool,
    pub is_favorite: bool,
    pub browse_sort_order: Option<i64>,
    pub attract_sort_order: Option<i64>,
    pub include_in_attract_mode: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentGameRecord {
    pub machine_name: String,
    pub last_played_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub imported_games: Vec<ImportedGameRecord>,
    pub library_entries: Vec<LibraryEntryRecord>,
    pub recent_games: Vec<RecentGameRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryMaintenanceResult {
    pub snapshot: LibrarySnapshot,
    pub imported_games_count: usize,
    pub rom_available_count: usize,
    pub message: String,
}

pub fn default_cabinet_config() -> CabinetConfig {
    CabinetConfig {
        display_profile: DISPLAY_PROFILE.to_owned(),
        paths: CabinetPaths {
            mame_executable_path: String::new(),
            mame_ini_path: None,
            rom_roots: vec![],
            media_roots: vec![],
            preview_video_root: String::new(),
            artwork_root: String::new(),
            category_ini_path: Some(DEFAULT_CATEGORY_INI_PATH.to_owned()),
        },
        attract_timeout_seconds: 12,
        display_calibration: DisplayCalibration {
            top_inset_percent: 1,
            right_inset_percent: 1,
            bottom_inset_percent: 1,
            left_inset_percent: 1,
        },
    }
}

pub fn frontend_bootstrap(
    cabinet_config: CabinetConfig,
    media_http_base_url: Option<String>,
) -> FrontendBootstrap {
    FrontendBootstrap {
        default_view: DEFAULT_VIEW.to_owned(),
        cabinet_config,
        media_http_base_url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontend_bootstrap_exposes_cabinet_defaults() {
        let bootstrap = frontend_bootstrap(
            default_cabinet_config(),
            Some("http://127.0.0.1:43210".to_owned()),
        );

        assert_eq!(bootstrap.default_view, "favorites");
        assert_eq!(bootstrap.cabinet_config.display_profile, "lcd-1440p-16:9");
        assert_eq!(bootstrap.cabinet_config.attract_timeout_seconds, 12);
        assert_eq!(
            bootstrap.media_http_base_url.as_deref(),
            Some("http://127.0.0.1:43210")
        );
    }
}
