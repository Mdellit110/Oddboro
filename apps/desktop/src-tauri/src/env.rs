//! What the shell hands the office server: its port, its home, and a real PATH.

use std::env;
use std::path::PathBuf;
#[cfg(unix)]
use std::time::Duration;

/// The office's port when `ODDBORO_PORT` is not set.
const DEFAULT_PORT: u16 = 4500;
/// How long the login shell gets to print its PATH.
#[cfg(unix)]
const LOGIN_SHELL_TIMEOUT: Duration = Duration::from_secs(5);

/// `ODDBORO_PORT` from the shell's own environment, or 4500.
pub fn port() -> u16 {
    env::var("ODDBORO_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

/// The owner's home folder.
pub fn home() -> PathBuf {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    env::var_os(var).map_or_else(|| PathBuf::from("/"), PathBuf::from)
}

/// `ODDBORO_HOME` from the shell's own environment, or `~/.oddboro`.
pub fn office_home() -> PathBuf {
    env::var_os("ODDBORO_HOME").map_or_else(|| home().join(".oddboro"), PathBuf::from)
}

/// Where Node's output goes: `~/Library/Logs/Oddboro` on a Mac, and on Linux
/// and Windows the folder the office's own login service logs to
/// (`packages/ledger/src/platform.ts`).
#[cfg(target_os = "macos")]
pub fn log_file() -> PathBuf {
    home().join("Library/Logs/Oddboro/office.log")
}

#[cfg(target_os = "linux")]
pub fn log_file() -> PathBuf {
    let state = env::var_os("XDG_STATE_HOME")
        .filter(|s| !s.is_empty())
        .map_or_else(|| home().join(".local/state"), PathBuf::from);
    state.join("oddboro/office.log")
}

#[cfg(windows)]
pub fn log_file() -> PathBuf {
    env::var_os("LOCALAPPDATA")
        .filter(|s| !s.is_empty())
        .map_or_else(|| home().join("AppData").join("Local"), PathBuf::from)
        .join("Oddboro")
        .join("Logs")
        .join("office.log")
}

/// The PATH the owner's Terminal would have. An app opened from the Finder or
/// a Linux launcher starts with a short system PATH, and the server spawns
/// `claude`, `git` and `uvx`, so ask the login shell once and then add the
/// usual install folders it may have missed. Windows has no login shell: an
/// app gets the owner's own PATH, plus the same kind of folders.
pub fn login_path() -> String {
    let base = read_login_path().unwrap_or_else(|| env::var("PATH").unwrap_or_default());
    let mut dirs: Vec<PathBuf> = env::split_paths(&base)
        .filter(|d| !d.as_os_str().is_empty())
        .collect();
    let home = home();
    for dir in install_folders(&home)
        .into_iter()
        .chain(node_manager_folders(&home))
    {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    env::join_paths(dirs).map_or(base, |p| p.to_string_lossy().into_owned())
}

/// Where `claude`, `git` and `uvx` usually install.
#[cfg(unix)]
fn install_folders(home: &std::path::Path) -> Vec<PathBuf> {
    vec![
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        home.join(".local/bin"),
        home.join(".claude/local"),
        "/usr/bin".into(),
        "/bin".into(),
        "/usr/sbin".into(),
        "/sbin".into(),
    ]
}

/// Where a Node version manager keeps `node` and `npm`, and the tools npm
/// installs globally, such as `codex`. nvm, fnm, Volta, asdf and mise each
/// set themselves up in `~/.zshrc` or `~/.bashrc`, which a login shell run
/// with `-c` never reads, so the PATH above misses them. The app brings its
/// own Node but not npm, so without these Install fails with
/// "spawn npm ENOENT". These come last, so the login shell's PATH wins.
#[cfg(unix)]
fn node_manager_folders(home: &std::path::Path) -> Vec<PathBuf> {
    let nvm = env::var_os("NVM_DIR")
        .filter(|d| !d.is_empty())
        .map_or_else(|| home.join(".nvm"), PathBuf::from);
    let fnm = env::var_os("FNM_DIR")
        .filter(|d| !d.is_empty())
        .map(PathBuf::from);
    let mut dirs = Vec::new();
    dirs.extend(newest_nvm_node(&nvm.join("versions/node")));
    for root in fnm.into_iter().chain([
        home.join(".local/share/fnm"),
        home.join("Library/Application Support/fnm"),
    ]) {
        dirs.push(root.join("aliases/default/bin"));
    }
    dirs.push(home.join(".volta/bin"));
    dirs.push(home.join(".asdf/shims"));
    dirs.push(home.join(".local/share/mise/shims"));
    dirs
}

#[cfg(windows)]
fn node_manager_folders(_home: &std::path::Path) -> Vec<PathBuf> {
    Vec::new()
}

/// The `bin` folder of the newest Node nvm installed (`v24.14.1` beats
/// `v22.23.4` and `v9.0.0`). nvm's own default alias can name a range such
/// as `lts/*`, which only nvm resolves, so the newest is the simplest
/// guess that has npm. None when nvm has no Node.
#[cfg(unix)]
fn newest_nvm_node(versions: &std::path::Path) -> Option<PathBuf> {
    let parse = |name: &str| -> Option<Vec<u64>> {
        name.strip_prefix('v')?
            .split('.')
            .map(|n| n.parse().ok())
            .collect()
    };
    std::fs::read_dir(versions)
        .ok()?
        .filter_map(|e| {
            let name = e.ok()?.file_name().into_string().ok()?;
            Some((parse(&name)?, name))
        })
        .max()
        .map(|(_, name)| versions.join(name).join("bin"))
}

/// Claude Code's and uv's installers use `.local\bin`, WinGet links its
/// installs from one folder, and Git for Windows keeps `git` in `cmd`.
#[cfg(windows)]
fn install_folders(home: &std::path::Path) -> Vec<PathBuf> {
    let local = env::var_os("LOCALAPPDATA")
        .map_or_else(|| home.join("AppData").join("Local"), PathBuf::from);
    vec![
        home.join(".local").join("bin"),
        local.join("Microsoft").join("WinGet").join("Links"),
        PathBuf::from(r"C:\Program Files\Git\cmd"),
    ]
}

#[cfg(windows)]
fn read_login_path() -> Option<String> {
    None
}

/// Runs `$SHELL -l -c 'printf %s "$PATH"'` with a timeout. A profile that
/// prints its own text first is fine: the PATH is the last line.
#[cfg(unix)]
fn read_login_path() -> Option<String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::thread::sleep;
    use std::time::Instant;

    let fallback = if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "/bin/sh"
    };
    let shell = env::var("SHELL").unwrap_or_else(|_| fallback.to_string());
    let mut child = Command::new(shell)
        .args(["-l", "-c", "printf %s \"$PATH\""])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + LOGIN_SHELL_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(None) if Instant::now() < deadline => sleep(Duration::from_millis(50)),
            Ok(Some(_)) => return None,
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    let path = out.lines().last()?.trim().to_string();
    (!path.is_empty()).then_some(path)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;

    /// A fresh, empty home for one test.
    fn home(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("oddboro-env-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn nvm_gives_its_newest_node_by_number() {
        let home = home("nvm");
        let versions = home.join(".nvm/versions/node");
        for v in ["v9.0.0", "v22.23.4", "v24.14.1", "v24.2.0", "not-a-version"] {
            fs::create_dir_all(versions.join(v).join("bin")).unwrap();
        }
        assert_eq!(
            newest_nvm_node(&versions),
            Some(versions.join("v24.14.1/bin"))
        );
        fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn no_nvm_or_an_empty_one_gives_no_node() {
        let home = home("no-nvm");
        let versions = home.join(".nvm/versions/node");
        assert_eq!(newest_nvm_node(&versions), None);
        fs::create_dir_all(&versions).unwrap();
        assert_eq!(newest_nvm_node(&versions), None);
        fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn node_managers_name_nvm_first_then_fnm_volta_asdf_and_mise() {
        let home = home("order");
        fs::create_dir_all(home.join(".nvm/versions/node/v24.14.1/bin")).unwrap();
        let managers = node_manager_folders(&home);
        // NVM_DIR, when the test's own shell sets it, moves nvm elsewhere.
        if env::var_os("NVM_DIR").is_none() {
            assert_eq!(managers[0], home.join(".nvm/versions/node/v24.14.1/bin"));
        }
        assert!(managers.contains(&home.join(".volta/bin")));
        assert!(managers.contains(&home.join(".local/share/fnm/aliases/default/bin")));
        let installs = install_folders(&home);
        assert!(managers.iter().all(|d| !installs.contains(d)));
        fs::remove_dir_all(&home).unwrap();
    }
}
