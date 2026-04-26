use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    process::Command,
};

use crate::contract;

#[derive(Debug)]
pub struct MameLaunch {
    executable_path: String,
    args: Vec<OsString>,
}

pub fn build_mame_launch(
    cabinet_config: &contract::CabinetConfig,
    machine_name: &str,
) -> Result<MameLaunch, String> {
    let executable_path = cabinet_config.paths.mame_executable_path.trim();
    if executable_path.is_empty() {
        return Err("MAME executable path is required before launching games.".to_owned());
    }

    let machine_name = machine_name.trim();
    if machine_name.is_empty() {
        return Err("Cannot launch a game without a machine name.".to_owned());
    }

    let mut args = Vec::new();

    if let Some(mame_ini_path) = cabinet_config
        .paths
        .mame_ini_path
        .as_deref()
        .and_then(non_empty_string)
    {
        args.push(OsString::from("-inipath"));
        args.push(mame_ini_search_path(mame_ini_path).into_os_string());
    }

    let rom_roots = cabinet_config
        .paths
        .rom_roots
        .iter()
        .filter_map(|root| non_empty_string(root))
        .collect::<Vec<_>>();
    if !rom_roots.is_empty() {
        args.push(OsString::from("-rompath"));
        args.push(OsString::from(join_mame_search_path(&rom_roots)));
    }

    args.push(OsString::from(machine_name));

    Ok(MameLaunch {
        executable_path: executable_path.to_owned(),
        args,
    })
}

pub fn launch_and_wait(launch: MameLaunch) -> Result<(), String> {
    let status = Command::new(&launch.executable_path)
        .args(&launch.args)
        .status()
        .map_err(|error| {
            format!(
                "Could not launch MAME at {}: {error}",
                launch.executable_path
            )
        })?;

    if status.success() {
        return Ok(());
    }

    match status.code() {
        Some(code) => Err(format!("MAME exited with status code {code}.")),
        None => Err("MAME exited before completing.".to_owned()),
    }
}

fn non_empty_string(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then_some(trimmed)
}

fn mame_ini_search_path(mame_ini_path: &str) -> PathBuf {
    let path = Path::new(mame_ini_path);
    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn join_mame_search_path(paths: &[&str]) -> String {
    paths.join(";")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cabinet_config() -> contract::CabinetConfig {
        let mut cabinet_config = contract::default_cabinet_config();
        cabinet_config.paths.mame_executable_path = "/usr/local/bin/mame".to_owned();
        cabinet_config
    }

    fn args_as_strings(launch: &MameLaunch) -> Vec<String> {
        launch
            .args
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn build_mame_launch_uses_configured_executable_and_machine_name() {
        let launch = build_mame_launch(&cabinet_config(), "1942").unwrap();

        assert_eq!(launch.executable_path, "/usr/local/bin/mame");
        assert_eq!(args_as_strings(&launch), vec!["1942"]);
    }

    #[test]
    fn build_mame_launch_uses_mame_ini_parent_as_search_path() {
        let mut cabinet_config = cabinet_config();
        cabinet_config.paths.mame_ini_path = Some("/etc/mame/mame.ini".to_owned());

        let launch = build_mame_launch(&cabinet_config, "galaga").unwrap();

        assert_eq!(
            args_as_strings(&launch),
            vec!["-inipath", "/etc/mame", "galaga"],
        );
    }

    #[test]
    fn build_mame_launch_passes_configured_rom_roots() {
        let mut cabinet_config = cabinet_config();
        cabinet_config.paths.rom_roots = vec![
            "/srv/karlo/library/roms/mame".to_owned(),
            " ".to_owned(),
            "/mnt/arcade/roms".to_owned(),
        ];

        let launch = build_mame_launch(&cabinet_config, "sf2").unwrap();

        assert_eq!(
            args_as_strings(&launch),
            vec![
                "-rompath",
                "/srv/karlo/library/roms/mame;/mnt/arcade/roms",
                "sf2",
            ],
        );
    }

    #[test]
    fn build_mame_launch_rejects_missing_executable() {
        let error = build_mame_launch(&contract::default_cabinet_config(), "dkong").unwrap_err();

        assert_eq!(
            error,
            "MAME executable path is required before launching games.",
        );
    }

    #[test]
    fn build_mame_launch_rejects_missing_machine_name() {
        let error = build_mame_launch(&cabinet_config(), "  ").unwrap_err();

        assert_eq!(error, "Cannot launch a game without a machine name.");
    }
}
