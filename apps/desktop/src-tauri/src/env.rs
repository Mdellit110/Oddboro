//! What the shell hands the office server: its port, its home, and a real PATH.

use std::env;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

/// The office's port when `ODDBORO_PORT` is not set.
const DEFAULT_PORT: u16 = 4500;
/// How long the login shell gets to print its PATH.
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
    env::var_os("HOME").map_or_else(|| PathBuf::from("/"), PathBuf::from)
}

/// `ODDBORO_HOME` from the shell's own environment, or `~/.oddboro`.
pub fn office_home() -> PathBuf {
    env::var_os("ODDBORO_HOME").map_or_else(|| home().join(".oddboro"), PathBuf::from)
}

/// Where Node's output goes: `~/Library/Logs/Oddboro` on a Mac, and on Linux
/// the folder the office's own login service logs to
/// (`packages/ledger/src/platform.ts`).
#[cfg(target_os = "macos")]
pub fn log_file() -> PathBuf {
    home().join("Library/Logs/Oddboro/office.log")
}

#[cfg(not(target_os = "macos"))]
pub fn log_file() -> PathBuf {
    let state = env::var_os("XDG_STATE_HOME")
        .filter(|s| !s.is_empty())
        .map_or_else(|| home().join(".local/state"), PathBuf::from);
    state.join("oddboro/office.log")
}

/// The PATH the owner's Terminal would have. An app opened from the Finder or
/// a Linux launcher starts with a short system PATH, and the server spawns
/// `claude`, `git` and `uvx`, so ask the login shell once and then add the
/// usual install folders it may have missed.
pub fn login_path() -> String {
    let home = home();
    let base = read_login_path().unwrap_or_else(|| env::var("PATH").unwrap_or_default());
    let mut dirs: Vec<String> = base
        .split(':')
        .filter(|d| !d.is_empty())
        .map(String::from)
        .collect();
    let extras = [
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        home.join(".local/bin").display().to_string(),
        home.join(".claude/local").display().to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
    ];
    for dir in extras {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs.join(":")
}

/// Runs `$SHELL -l -c 'printf %s "$PATH"'` with a timeout. A profile that
/// prints its own text first is fine: the PATH is the last line.
fn read_login_path() -> Option<String> {
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
