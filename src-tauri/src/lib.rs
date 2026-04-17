mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_frontend_bootstrap,
            commands::get_schema_overview
        ])
        .run(tauri::generate_context!())
        .expect("error while running Karlo");
}
