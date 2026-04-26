use std::{
    collections::HashSet,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedMachine {
    pub machine_name: String,
    pub title: String,
    pub year: u16,
    pub manufacturer: String,
}

pub fn import_mame_catalog(mame_executable_path: &str) -> Result<Vec<ImportedMachine>, String> {
    let output = Command::new(mame_executable_path)
        .arg("-listxml")
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "MAME import failed with status {}. {}{}",
            output
                .status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_owned()),
            stdout.trim(),
            if stderr.trim().is_empty() {
                String::new()
            } else if stdout.trim().is_empty() {
                stderr.trim().to_owned()
            } else {
                format!(" {}", stderr.trim())
            }
        ));
    }

    let xml = String::from_utf8(output.stdout).map_err(|error| error.to_string())?;
    parse_mame_listxml(&xml)
}

pub fn parse_mame_listxml(xml: &str) -> Result<Vec<ImportedMachine>, String> {
    let mut machines = Vec::new();
    let mut current: Option<WorkingMachine> = None;

    for line in xml.lines() {
        let line = line.trim();

        if line.starts_with("<machine ") {
            current = Some(WorkingMachine {
                machine_name: extract_attribute(line, "name")
                    .ok_or_else(|| "MAME XML machine entry missing name.".to_owned())?
                    .to_owned(),
                runnable: extract_attribute(line, "runnable")
                    .map(|value| value != "no")
                    .unwrap_or(true),
                is_device: extract_attribute(line, "isdevice")
                    .map(|value| value == "yes")
                    .unwrap_or(false),
                is_bios: extract_attribute(line, "isbios")
                    .map(|value| value == "yes")
                    .unwrap_or(false),
                title: None,
                year: None,
                manufacturer: None,
            });
            continue;
        }

        if let Some(current_machine) = current.as_mut() {
            if line.starts_with("<description>") {
                current_machine.title = extract_tag_text(line, "description");
                continue;
            }

            if line.starts_with("<year>") {
                current_machine.year =
                    extract_tag_text(line, "year").and_then(|value| value.parse::<u16>().ok());
                continue;
            }

            if line.starts_with("<manufacturer>") {
                current_machine.manufacturer = extract_tag_text(line, "manufacturer");
                continue;
            }

            if line.starts_with("</machine>") {
                if current_machine.runnable
                    && !current_machine.is_device
                    && !current_machine.is_bios
                {
                    machines.push(ImportedMachine {
                        machine_name: current_machine.machine_name.clone(),
                        title: current_machine
                            .title
                            .clone()
                            .unwrap_or_else(|| current_machine.machine_name.clone()),
                        year: current_machine.year.unwrap_or_default(),
                        manufacturer: current_machine
                            .manufacturer
                            .clone()
                            .unwrap_or_else(|| "Unknown".to_owned()),
                    });
                }
                current = None;
            }
        }
    }

    if machines.is_empty() {
        return Err("MAME XML import returned no runnable machines.".to_owned());
    }

    Ok(machines)
}

pub fn scan_rom_roots(rom_roots: &[String]) -> Result<HashSet<String>, String> {
    let mut discovered = HashSet::new();

    for root in rom_roots {
        let path = PathBuf::from(root);
        if !path.exists() {
            continue;
        }

        scan_path(&path, &mut discovered)?;
    }

    Ok(discovered)
}

fn scan_path(path: &Path, discovered: &mut HashSet<String>) -> Result<(), String> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) => return Err(error.to_string()),
    };

    if metadata.is_dir() {
        if let Some(name) = path.file_name().and_then(OsStr::to_str) {
            if !name.is_empty() {
                discovered.insert(name.to_owned());
            }
        }

        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            scan_path(&entry.path(), discovered)?;
        }

        return Ok(());
    }

    if let Some(extension) = path.extension().and_then(OsStr::to_str) {
        let normalized_extension = extension.to_ascii_lowercase();
        if matches!(normalized_extension.as_str(), "zip" | "7z" | "chd") {
            if let Some(stem) = path.file_stem().and_then(OsStr::to_str) {
                if !stem.is_empty() {
                    discovered.insert(stem.to_owned());
                }
            }
        }
    }

    Ok(())
}

fn extract_attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let pattern = format!("{name}=\"");
    let start = tag.find(&pattern)? + pattern.len();
    let rest = &tag[start..];
    let end = rest.find('"')?;
    Some(&rest[..end])
}

fn extract_tag_text(line: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = line.find(&open)? + open.len();
    let end = line[start..].find(&close)? + start;
    Some(unescape_xml(&line[start..end]))
}

fn unescape_xml(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[derive(Debug, Clone)]
struct WorkingMachine {
    machine_name: String,
    runnable: bool,
    is_device: bool,
    is_bios: bool,
    title: Option<String>,
    year: Option<u16>,
    manufacturer: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parse_listxml_extracts_runnable_machine_metadata() {
        let xml = r#"
        <mame build="0.277">
          <machine name="galaga" runnable="yes">
            <description>Galaga</description>
            <year>1981</year>
            <manufacturer>Namco</manufacturer>
          </machine>
          <machine name="neogeo" runnable="no" isbios="yes">
            <description>Neo Geo BIOS</description>
            <year>1990</year>
            <manufacturer>SNK</manufacturer>
          </machine>
          <machine name="sf2" runnable="yes">
            <description>Street Fighter II &amp; Champion Edition</description>
            <year>1992</year>
            <manufacturer>Capcom</manufacturer>
          </machine>
        </mame>
        "#;

        let machines = parse_mame_listxml(xml).unwrap();

        assert_eq!(machines.len(), 2);
        assert_eq!(machines[0].machine_name, "galaga");
        assert_eq!(machines[1].title, "Street Fighter II & Champion Edition");
    }

    #[test]
    fn rom_scan_discovers_archives_and_directories() {
        let root = temp_scan_root("rom-scan");
        fs::create_dir_all(root.join("pacman")).unwrap();
        fs::write(root.join("galaga.zip"), "").unwrap();
        fs::write(root.join("mspacman.7z"), "").unwrap();

        let discovered = scan_rom_roots(&[root.to_string_lossy().into_owned()]).unwrap();

        assert!(discovered.contains("galaga"));
        assert!(discovered.contains("mspacman"));
        assert!(discovered.contains("pacman"));

        let _ = fs::remove_dir_all(root);
    }

    fn temp_scan_root(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("karlo-{label}-{suffix}"))
    }
}
