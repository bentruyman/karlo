mod commands;
mod contract;
mod db;
mod store;

use std::io;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = store::AppState::initialize(app)
                .map_err(|error| io::Error::other(error))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_frontend_bootstrap,
            commands::get_cabinet_config,
            commands::get_runtime_contract,
            commands::save_cabinet_config,
            commands::get_schema_overview
        ])
        .run(tauri::generate_context!())
        .expect("error while running Karlo");
}
