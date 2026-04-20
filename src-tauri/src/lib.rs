mod commands;
mod contract;
mod db;
mod importer;
mod launcher;
mod media_protocol;
mod media_server;
mod seed;
mod store;

use std::{env, io};

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
            let media_server = media_server::MediaHttpServer::start(state.clone())
                .map_err(|error| io::Error::other(error))?;
            app.manage(state);
            app.manage(media_server);
            apply_launch_profile(app).map_err(io::Error::other)?;
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

fn apply_launch_profile<R: tauri::Runtime, M: Manager<R>>(manager: &M) -> Result<(), String> {
    if !launches_in_kiosk_mode() {
        return Ok(());
    }

    let window = manager
        .get_webview_window("main")
        .ok_or_else(|| "missing main window".to_owned())?;

    window.set_resizable(false).map_err(|error| error.to_string())?;
    window.set_fullscreen(true).map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn launches_in_kiosk_mode() -> bool {
    launches_in_kiosk_mode_with(env::args(), env::var("KARLO_KIOSK").ok().as_deref())
}

fn launches_in_kiosk_mode_with<I, S>(args: I, kiosk_env: Option<&str>) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    kiosk_env.map(is_truthy).unwrap_or(false)
        || args.into_iter().any(|arg| arg.as_ref() == "--kiosk")
}

fn is_truthy(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

#[cfg(test)]
mod tests {
    use super::launches_in_kiosk_mode_with;

    #[test]
    fn kiosk_mode_accepts_command_line_flag() {
        assert!(launches_in_kiosk_mode_with(["karlo", "--kiosk"], None));
    }

    #[test]
    fn kiosk_mode_accepts_truthy_environment_values() {
        for value in ["1", "true", "TRUE", "yes", "on"] {
            assert!(launches_in_kiosk_mode_with(["karlo"], Some(value)));
        }
    }

    #[test]
    fn kiosk_mode_ignores_falsey_inputs() {
        assert!(!launches_in_kiosk_mode_with(["karlo"], None));
        assert!(!launches_in_kiosk_mode_with(["karlo"], Some("0")));
        assert!(!launches_in_kiosk_mode_with(["karlo"], Some("false")));
    }
}
