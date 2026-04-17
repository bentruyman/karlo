use serde::Serialize;

use crate::db;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendBootstrap {
    default_view: &'static str,
    attract_timeout_seconds: u16,
    display_target: &'static str,
    browse_views: Vec<&'static str>,
}

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
pub fn get_frontend_bootstrap() -> FrontendBootstrap {
    FrontendBootstrap {
        default_view: "favorites",
        attract_timeout_seconds: 12,
        display_target: "crt-480i-4:3",
        browse_views: vec![
            "favorites",
            "recent",
            "genre",
            "year",
            "manufacturer",
        ],
    }
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
