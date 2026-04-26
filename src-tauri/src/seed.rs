use serde::Deserialize;

const MOCK_CATALOG_JSON: &str = include_str!("../../src/app/mock-catalog.json");

#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MockCatalogRecord {
    pub machine_name: String,
    pub title: String,
    pub year: u16,
    pub manufacturer: String,
    pub genre: String,
    pub attract_caption: Option<String>,
    pub is_favorite: Option<bool>,
    pub was_recently_played: Option<bool>,
}

pub fn mock_catalog() -> Result<Vec<MockCatalogRecord>, String> {
    serde_json::from_str(MOCK_CATALOG_JSON).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_catalog_seed_loads() {
        let catalog = mock_catalog().unwrap();

        assert!(catalog.len() > 30);
        assert_eq!(catalog[0].machine_name, "1942");
        assert!(catalog
            .iter()
            .any(|record| record.is_favorite == Some(true)));
        assert!(catalog
            .iter()
            .any(|record| record.was_recently_played == Some(true)));
    }
}
