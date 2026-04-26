use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::{contract, db, launcher, store};

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
pub async fn launch_mame_game(
    machine_name: String,
    app: AppHandle,
    state: State<'_, store::AppState>,
) -> Result<contract::LibrarySnapshot, String> {
    let machine_name = machine_name.trim().to_owned();
    let cabinet_config = state.load_cabinet_config()?;
    let launch = launcher::build_mame_launch(&cabinet_config, &machine_name)?;
    let main_window = app.get_webview_window("main");

    if let Some(window) = &main_window {
        window
            .hide()
            .map_err(|error| format!("Could not hide Karlo before launch: {error}"))?;
    }

    let launch_result =
        tauri::async_runtime::spawn_blocking(move || launcher::launch_and_wait(launch))
            .await
            .map_err(|error| format!("MAME launch task failed: {error}"))?;

    let restore_result = restore_main_window(main_window);

    if let Err(error) = launch_result {
        if let Err(restore_error) = restore_result {
            return Err(format!(
                "{error} Also could not restore Karlo: {restore_error}"
            ));
        }
        return Err(error);
    }

    restore_result?;
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

fn restore_main_window(window: Option<WebviewWindow>) -> Result<(), String> {
    let Some(window) = window else {
        return Ok(());
    };

    window
        .show()
        .map_err(|error| format!("Could not show Karlo after MAME exited: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Could not focus Karlo after MAME exited: {error}"))
}
