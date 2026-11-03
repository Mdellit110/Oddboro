//! Updates. Every one is required. As the app opens, before the server
//! starts, the shell checks for a newer version (5 second timeout) and
//! installs it at once. While the office runs it checks every 4 hours, and
//! whenever the server asks (`oddboro:update-check` on its stdout, from
//! Check now). A new version downloads in the background, the server picks
//! when it installs (`/api/update`, asked every 30 seconds), and the shell
//! stops the server, installs it and opens the new version. Offline, or any
//! error: it logs the problem and carries on. Release builds only.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::thread::{self, sleep};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::server;

/// A line the server writes to its stdout when the owner presses Check now.
pub const CHECK_LINE: &str = "oddboro:update-check";
/// Only a release build updates. A debug build is not in a bundle to replace.
pub const ENABLED: bool = cfg!(not(debug_assertions));

const CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const EVERY: Duration = Duration::from_secs(4 * 60 * 60);
const ASK_EVERY: Duration = Duration::from_secs(30);

static CHECK_NOW: OnceLock<Sender<()>> = OnceLock::new();

/// Shows the owner that Oddboro is updating, with the version it updates to.
pub type ShowUpdating = fn(&AppHandle, &str);

/// As the app opens: install a newer version before the server starts.
/// Returns true when it installed one and the new version is opening, so the
/// caller must stop.
pub fn on_launch(app: &AppHandle, log: &Path, show: ShowUpdating) -> bool {
    if !ENABLED {
        return false;
    }
    let update = match check(app) {
        Ok(Some(update)) => update,
        Ok(None) => {
            server::note(log, "update check: this is the newest version");
            return false;
        }
        Err(e) => {
            server::note(log, &format!("update check failed, starting anyway: {e}"));
            return false;
        }
    };
    server::note(
        log,
        &format!("updating to {} before the office starts", update.version),
    );
    show(app, &update.version);
    match download(&update).and_then(|bytes| install(&update, &bytes)) {
        Ok(()) => {
            server::note(log, &format!("installed {}, opening it", update.version));
            relaunch(app);
            true
        }
        Err(e) => {
            server::note(
                log,
                &format!("update to {} failed, starting anyway: {e}", update.version),
            );
            false
        }
    }
}

/// What the watcher needs: the app, the server's port and update token, the
/// log, and how to show the owner it is updating.
pub struct Watch {
    pub app: AppHandle,
    pub port: u16,
    pub token: String,
    pub log: PathBuf,
    pub show: ShowUpdating,
}

/// While the office runs: check every 4 hours and on Check now, download a
/// new version, and install it when the server says so.
pub fn watch(w: Watch) {
    if !ENABLED {
        return;
    }
    let (tx, rx) = channel();
    if CHECK_NOW.set(tx).is_err() {
        return;
    }
    thread::spawn(move || loop {
        match rx.recv_timeout(EVERY) {
            Ok(()) | Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        let found = check(&w.app).and_then(|found| match found {
            Some(update) => {
                server::note(&w.log, &format!("downloading {}", update.version));
                download(&update).map(|bytes| Some((update, bytes)))
            }
            None => Ok(None),
        });
        match found {
            Ok(Some((update, bytes))) => {
                server::note(&w.log, &format!("{} is ready to install", update.version));
                hand_over(&w, &update, &bytes, &rx);
            }
            Ok(None) => {
                server::note(&w.log, "update check: this is the newest version");
                ask(w.port, &w.token, "POST", Some(&json!({ "checked": true })));
            }
            Err(e) => {
                server::note(&w.log, &format!("update check failed: {e}"));
                ask(w.port, &w.token, "POST", Some(&json!({ "failed": e })));
            }
        }
    });
}

/// The server asked for a check (Check now).
pub fn check_now() {
    if let Some(tx) = CHECK_NOW.get() {
        let _ = tx.send(());
    }
}

/// Tell the server a version is ready, then ask it every 30 seconds until it
/// says to install. A server that restarted forgets the update, so the shell
/// tells it again.
fn hand_over(w: &Watch, update: &Update, bytes: &[u8], checks: &Receiver<()>) {
    let (app, port, token, log) = (&w.app, w.port, w.token.as_str(), w.log.as_path());
    let ready =
        json!({ "version": update.version, "notes": update.body.clone().unwrap_or_default() });
    loop {
        let answer = ask(port, token, "GET", None);
        let knows = answer.as_ref().is_some_and(|a| {
            a["ready"] == true && a["version"].as_str() == Some(update.version.as_str())
        });
        if knows && answer.as_ref().is_some_and(|a| a["install"] == true) {
            break;
        }
        if !knows {
            ask(port, token, "POST", Some(&ready));
        }
        // A check now changes nothing while a version waits to install.
        while checks.try_recv().is_ok() {}
        sleep(ASK_EVERY);
    }
    server::note(
        log,
        &format!("installing {}: stopping the office", update.version),
    );
    (w.show)(app, &update.version);
    server::stop();
    match install(update, bytes) {
        Ok(()) => server::note(log, &format!("installed {}, opening it", update.version)),
        Err(e) => server::note(
            log,
            &format!("install of {} failed, reopening: {e}", update.version),
        ),
    }
    relaunch(app);
}

fn check(app: &AppHandle) -> Result<Option<Update>, String> {
    let mut builder = app.updater_builder().timeout(CHECK_TIMEOUT);
    // For local testing only: a latest.json served from this Mac.
    if let Ok(url) = std::env::var("ODDBORO_UPDATE_URL") {
        let url = Url::parse(&url).map_err(|e| format!("ODDBORO_UPDATE_URL: {e}"))?;
        builder = builder.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    let found = tauri::async_runtime::block_on(updater.check()).map_err(|e| e.to_string())?;
    // The 5 seconds are for the check. The download gets longer.
    Ok(found.map(|mut update| {
        update.timeout = Some(DOWNLOAD_TIMEOUT);
        update
    }))
}

/// Downloads the update and checks its signature against the key in the app.
fn download(update: &Update) -> Result<Vec<u8>, String> {
    tauri::async_runtime::block_on(update.download(|_, _| {}, || {})).map_err(|e| e.to_string())
}

/// Checks the signature again and replaces this app's bundle with the new one.
fn install(update: &Update, bytes: &[u8]) -> Result<(), String> {
    update.install(bytes).map_err(|e| e.to_string())
}

/// Opens the bundle at this app's path (the new version, once installed) and
/// quits this one. `open -n` hands it to launchd, which drops this process's
/// environment, so the ODDBORO_ settings go along with `--env`.
fn relaunch(app: &AppHandle) {
    let bundle = std::env::current_exe()
        .ok()
        .and_then(|exe| Some(exe.parent()?.parent()?.parent()?.to_path_buf()))
        .filter(|b| b.extension().is_some_and(|e| e == "app"));
    if let Some(bundle) = bundle {
        let mut open = Command::new("/usr/bin/open");
        open.arg("-n");
        for (key, value) in std::env::vars() {
            if key.starts_with("ODDBORO_") {
                open.arg("--env").arg(format!("{key}={value}"));
            }
        }
        let _ = open
            .arg(bundle)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    app.exit(0);
}

/// One request to the server's `/api/update`, with the token that marks it as
/// the shell's. HTTP/1.0, so the answer comes whole, never chunked.
fn ask(port: u16, token: &str, method: &str, body: Option<&Value>) -> Option<Value> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(2)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let body = body.map(Value::to_string).unwrap_or_default();
    let request = format!(
        "{method} /api/update HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nX-Oddboro-Update-Token: {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut answer = String::new();
    stream.read_to_string(&mut answer).ok()?;
    let (_, json) = answer.split_once("\r\n\r\n")?;
    serde_json::from_str(json).ok()
}

/// A fresh secret for this run, so only this shell can tell the server an update is ready.
pub fn token() -> String {
    let mut bytes = [0u8; 16];
    if let Ok(mut random) = std::fs::File::open("/dev/urandom") {
        let _ = random.read_exact(&mut bytes);
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
