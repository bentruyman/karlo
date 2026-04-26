mod commands;
mod contract;
mod db;
mod importer;
mod launcher;
mod media_protocol;
mod seed;
mod store;

use std::io;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("karlo-media", |ctx, request| {
            let configured_roots = ctx
                .app_handle()
                .try_state::<store::AppState>()
                .and_then(|state| state.load_cabinet_config().ok())
                .map(|config| media_protocol::configured_media_roots(&config.paths))
                .unwrap_or_default();

            media_protocol::handle_media_request(request, &configured_roots)
        })
        .setup(|app| {
            let state =
                store::AppState::initialize(app).map_err(|error| io::Error::other(error))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_frontend_bootstrap,
            commands::get_cabinet_config,
            commands::get_library_snapshot,
            commands::get_runtime_contract,
            commands::import_mame_catalog,
            commands::launch_mame_game,
            commands::record_recent_game,
            commands::save_cabinet_config,
            commands::scan_rom_roots,
            commands::toggle_game_favorite,
            commands::get_schema_overview,
            commands::report_frontend_diagnostic
        ])
        .run(tauri::generate_context!())
        .expect("error while running Karlo");
}
