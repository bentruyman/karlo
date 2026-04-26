use serde::{Deserialize, Serialize};

use crate::db;

const DEFAULT_VIEW: &str = "favorites";
const DISPLAY_PROFILE: &str = "lcd-1440p-16:9";
const DEFAULT_CATEGORY_INI_PATH: &str = "/srv/karlo/library/metadata/Category.ini";
const VISIBLE_LIBRARY_RULE: &str =
    "Browse views operate on visible curated library entries, not the full imported catalog.";
const FAVORITES_FALLBACK_RULE: &str =
    "If no favorites exist, the cabinet falls back to the visible library.";
const CATALOG_CURATION_BOUNDARY: &str =
    "Imported MAME metadata remains separate from cabinet-visible library entries.";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrowseViewDefinition {
    pub id: String,
    pub label: String,
    pub description: String,
}

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
pub struct ConfigKeyDefinition {
    pub key: String,
    pub purpose: String,
    pub kind: String,
    pub required: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsContract {
    pub table: String,
    pub owner: String,
    pub required_keys: Vec<ConfigKeyDefinition>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedCatalogContract {
    pub table: String,
    pub identity_field: String,
    pub rom_availability_field: String,
    pub media_fields: Vec<String>,
    pub curation_boundary: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CurationContract {
    pub imported_catalog_table: String,
    pub curated_library_table: String,
    pub recent_history_table: String,
    pub visible_library_rule: String,
    pub favorites_fallback_rule: String,
    pub browse_views: Vec<BrowseViewDefinition>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeContract {
    pub settings: SettingsContract,
    pub imported_catalog: ImportedCatalogContract,
    pub curation: CurationContract,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FrontendBootstrap {
    pub default_view: String,
    pub cabinet_config: CabinetConfig,
    pub curation: CurationContract,
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
    pub attract_caption: Option<String>,
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

pub fn frontend_bootstrap(cabinet_config: CabinetConfig) -> FrontendBootstrap {
    FrontendBootstrap {
        default_view: DEFAULT_VIEW.to_owned(),
        cabinet_config,
        curation: curation_contract(),
    }
}

pub fn runtime_contract() -> RuntimeContract {
    RuntimeContract {
        settings: SettingsContract {
            table: db::SETTINGS_TABLE.to_owned(),
            owner: "rust".to_owned(),
            required_keys: db::SETTINGS
                .iter()
                .map(|setting| ConfigKeyDefinition {
                    key: setting.key.to_owned(),
                    purpose: setting.purpose.to_owned(),
                    kind: setting.kind.to_owned(),
                    required: setting.required,
                })
                .collect(),
        },
        imported_catalog: ImportedCatalogContract {
            table: db::GAMES_TABLE.to_owned(),
            identity_field: "machine_name".to_owned(),
            rom_availability_field: "rom_available".to_owned(),
            media_fields: vec!["video_path".to_owned(), "artwork_paths_json".to_owned()],
            curation_boundary: CATALOG_CURATION_BOUNDARY.to_owned(),
        },
        curation: curation_contract(),
    }
}

fn curation_contract() -> CurationContract {
    CurationContract {
        imported_catalog_table: db::GAMES_TABLE.to_owned(),
        curated_library_table: db::LIBRARY_ENTRIES_TABLE.to_owned(),
        recent_history_table: db::RECENT_GAMES_TABLE.to_owned(),
        visible_library_rule: VISIBLE_LIBRARY_RULE.to_owned(),
        favorites_fallback_rule: FAVORITES_FALLBACK_RULE.to_owned(),
        browse_views: browse_views(),
    }
}

fn browse_views() -> Vec<BrowseViewDefinition> {
    vec![
        BrowseViewDefinition {
            id: "favorites".to_owned(),
            label: "Favorites".to_owned(),
            description: "Cabinet keepers".to_owned(),
        },
        BrowseViewDefinition {
            id: "recent".to_owned(),
            label: "Recent".to_owned(),
            description: "Last touched".to_owned(),
        },
        BrowseViewDefinition {
            id: "genre".to_owned(),
            label: "Genre".to_owned(),
            description: "Sorted by genre".to_owned(),
        },
        BrowseViewDefinition {
            id: "year".to_owned(),
            label: "Year".to_owned(),
            description: "Sorted by release".to_owned(),
        },
        BrowseViewDefinition {
            id: "manufacturer".to_owned(),
            label: "Maker".to_owned(),
            description: "Sorted by studio".to_owned(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontend_bootstrap_exposes_cabinet_defaults() {
        let bootstrap = frontend_bootstrap(default_cabinet_config());

        assert_eq!(bootstrap.default_view, "favorites");
        assert_eq!(bootstrap.cabinet_config.display_profile, "lcd-1440p-16:9");
        assert_eq!(bootstrap.cabinet_config.attract_timeout_seconds, 12);
        assert_eq!(bootstrap.curation.curated_library_table, "library_entries");
        assert_eq!(bootstrap.curation.browse_views.len(), 5);
    }

    #[test]
    fn runtime_contract_exposes_required_settings_and_tables() {
        let contract = runtime_contract();
        let keys: Vec<_> = contract
            .settings
            .required_keys
            .iter()
            .map(|definition| definition.key.clone())
            .collect();

        assert_eq!(contract.settings.table, "settings");
        assert_eq!(contract.imported_catalog.table, "games");
        assert_eq!(contract.curation.recent_history_table, "recent_games");
        assert!(keys.contains(&"mame_executable_path".to_owned()));
        assert!(keys.contains(&"display_calibration_json".to_owned()));
        assert_eq!(contract.curation.browse_views[0].id, "favorites");
    }
}
