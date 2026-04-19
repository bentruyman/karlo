use serde::Serialize;
use tauri::State;

use crate::{contract, db, store};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableDefinition {
    name: &'static str,
    purpose: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaOverview {
    version: i64,
    schema_sql: &'static str,
    tables: Vec<TableDefinition>,
}

#[tauri::command]
pub fn get_frontend_bootstrap(
    state: State<'_, store::AppState>,
) -> Result<contract::FrontendBootstrap, String> {
    Ok(contract::frontend_bootstrap(state.load_cabinet_config()?))
}

#[tauri::command]
pub fn get_cabinet_config(
    state: State<'_, store::AppState>,
) -> Result<contract::CabinetConfig, String> {
    state.load_cabinet_config()
}

#[tauri::command]
pub fn save_cabinet_config(
    cabinet_config: contract::CabinetConfig,
    state: State<'_, store::AppState>,
) -> Result<contract::CabinetConfig, String> {
    state.save_cabinet_config(&cabinet_config)?;
    state.load_cabinet_config()
}

#[tauri::command]
pub fn get_library_snapshot(
    state: State<'_, store::AppState>,
) -> Result<contract::LibrarySnapshot, String> {
    state.load_library_snapshot()
}

#[tauri::command]
pub fn toggle_game_favorite(
    machine_name: String,
    state: State<'_, store::AppState>,
) -> Result<contract::LibrarySnapshot, String> {
    state.toggle_game_favorite(&machine_name)
}

#[tauri::command]
pub fn record_recent_game(
    machine_name: String,
    state: State<'_, store::AppState>,
) -> Result<contract::LibrarySnapshot, String> {
    state.record_recent_game(&machine_name)
}

#[tauri::command]
pub fn import_mame_catalog(
    state: State<'_, store::AppState>,
) -> Result<contract::LibraryMaintenanceResult, String> {
    state.import_mame_catalog()
}

#[tauri::command]
pub fn scan_rom_roots(
    state: State<'_, store::AppState>,
) -> Result<contract::LibraryMaintenanceResult, String> {
    state.scan_rom_roots()
}

#[tauri::command]
pub fn get_runtime_contract() -> contract::RuntimeContract {
    contract::runtime_contract()
}

#[tauri::command]
pub fn get_schema_overview() -> SchemaOverview {
    SchemaOverview {
        version: db::SCHEMA_VERSION,
        schema_sql: db::SCHEMA_SQL,
        tables: db::TABLES
            .iter()
            .map(|table| TableDefinition {
                name: table.name,
                purpose: table.purpose,
            })
            .collect(),
    }
}
