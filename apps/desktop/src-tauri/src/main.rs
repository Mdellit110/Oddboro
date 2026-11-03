//! Oddboro for the Mac. A Tauri shell that runs the office server (Node, as a
//! sidecar) and shows it in a window. What it does, step by step, is in
//! `apps/desktop/CLAUDE.md`.

mod env;
mod server;
mod update;

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use server::Server;

const MAIN: &str = "main";
const LOADING: &str = "loading";

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let quitting = handle.clone();
            server::on_quit_signal(move || quitting.exit(0));
            tray(&handle)?;
            thread::spawn(move || start(&handle));
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the office hides it. The office keeps running.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == MAIN {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Oddboro could not start");

    app.run(|app, event| match event {
        // The last window closed. The menu bar item keeps the app alive.
        RunEvent::ExitRequested {
            code: None, api, ..
        } => api.prevent_exit(),
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => show(app),
        // Windows go first, so the wait for Node never shows a spinning wheel.
        RunEvent::Exit => {
            for window in app.webview_windows().values() {
                let _ = window.hide();
            }
            server::stop();
        }
        _ => {}
    });
}

/// Runs on its own thread: picks the server, starts it, and opens the office.
fn start(app: &AppHandle) {
    // The dev escape hatch: open a server that already runs, such as vite dev.
    if let Ok(url) = std::env::var("ODDBORO_SERVER_URL") {
        match Url::parse(&url) {
            Ok(url) => open_main(app, &url),
            Err(e) => fail(app, &format!("ODDBORO_SERVER_URL is not a URL: {e}")),
        }
        return;
    }

    // A newer version installs before the server starts, so an update never
    // swaps the server out from under a running office.
    if update::on_launch(app, &env::log_file(), show_updating) {
        return;
    }

    let port = env::port();
    if server::port_taken(port) {
        alert(
            app,
            &format!(
                "Another office is already running on port {port}. Oddboro will quit rather than share it.\n\nQuit the other office, then open Oddboro again."
            ),
        );
        app.exit(0);
        return;
    }
    let Some(node) = node_binary() else {
        return fail(
            app,
            "Oddboro cannot find its copy of Node. Reinstall Oddboro.",
        );
    };
    let Some(code) = server_code(app) else {
        return fail(
            app,
            "Oddboro cannot find the office server. Reinstall Oddboro.",
        );
    };

    show_loading(app);
    let update_token = if update::ENABLED {
        update::token()
    } else {
        String::new()
    };
    let server = Server {
        node,
        code,
        port,
        path: env::login_path(),
        home: env::office_home(),
        log: env::log_file(),
        version: app.package_info().version.to_string(),
        update_token: update_token.clone(),
    };
    let Ok(url) = Url::parse(&server.url()) else {
        return fail(app, "Oddboro built a bad URL for its server.");
    };
    update::watch(update::Watch {
        app: app.clone(),
        port,
        token: update_token,
        log: server.log.clone(),
        show: show_updating,
    });
    if let Err(message) = server.supervise(|| open_main(app, &url)) {
        fail(app, &message);
    }
}

/// Node sits beside the shell in `Contents/MacOS`. A debug build without the
/// bundle falls back to the copy the stage script leaves in `binaries/`.
fn node_binary() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok()?.parent()?.join("node");
    if beside.is_file() {
        return Some(beside);
    }
    dev_path("binaries/node-aarch64-apple-darwin")
}

/// The staged server sits in `Contents/Resources/server`. A debug build
/// without the bundle falls back to `apps/desktop/stage`.
fn server_code(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resources) = app.path().resource_dir() {
        let bundled = resources.join("server");
        if bundled.join(server::ENTRY).is_file() {
            return Some(bundled);
        }
    }
    dev_path("../stage").filter(|code| code.join(server::ENTRY).is_file())
}

/// Debug builds only. A release must not carry the builder's source folder,
/// which names their home folder, so the path is left out of it entirely.
#[cfg(debug_assertions)]
fn dev_path(relative: &str) -> Option<PathBuf> {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join(relative)
        .canonicalize()
        .ok()
}

#[cfg(not(debug_assertions))]
fn dev_path(_relative: &str) -> Option<PathBuf> {
    None
}

fn show_loading(app: &AppHandle) {
    loading(app, "");
}

/// The office goes away and the loading window says "Updating Oddboro to X.Y.Z".
fn show_updating(app: &AppHandle, version: &str) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.hide();
    }
    loading(app, version);
}

/// The small loading window. `updating` is the version it updates to, or
/// empty while the office opens. `loading/loading.js` shows the words.
fn loading(app: &AppHandle, updating: &str) {
    let script = format!(
        "window.oddboroUpdating = {};",
        serde_json::Value::from(updating)
    );
    if let Some(window) = app.get_webview_window(LOADING) {
        let _ = window.eval(format!("{script} window.oddboroShow?.();"));
        let _ = window.show();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, LOADING, WebviewUrl::App("index.html".into()))
        .title("Oddboro")
        .inner_size(360.0, 200.0)
        .resizable(false)
        .center()
        .initialization_script(script)
        .build();
}

/// Opens the office in the main window, or reloads it after a restart.
fn open_main(app: &AppHandle, url: &Url) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.navigate(url.clone());
        return;
    }
    let home = url.clone();
    let built = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::External(url.clone()))
        .title("Oddboro")
        .inner_size(1280.0, 820.0)
        .min_inner_size(960.0, 600.0)
        .center()
        .on_navigation(move |to| stay_or_open(&home, to))
        .on_new_window(|to, _| {
            open_in_browser(&to);
            NewWindowResponse::Deny
        })
        .build();
    if let Some(loading) = app.get_webview_window(LOADING) {
        let _ = loading.close();
    }
    if let Err(e) = built {
        fail(app, &format!("Oddboro could not open its window: {e}"));
    }
}

/// The office's own origin stays in the window. Links anywhere else open in
/// the default browser. Other schemes (about:, data:, blob:) stay put.
fn stay_or_open(home: &Url, to: &Url) -> bool {
    match to.scheme() {
        "http" | "https" if to.origin() == home.origin() => true,
        "http" | "https" | "mailto" | "tel" => {
            open_in_browser(to);
            false
        }
        _ => true,
    }
}

fn open_in_browser(url: &Url) {
    if !matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
        return;
    }
    let spawned = Command::new("/usr/bin/open")
        .arg(url.as_str())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    if let Ok(mut open) = spawned {
        thread::spawn(move || open.wait());
    }
}

/// Brings the office forward, or the loading window while it starts.
fn show(app: &AppHandle) {
    let window = app
        .get_webview_window(MAIN)
        .or_else(|| app.get_webview_window(LOADING));
    if let Some(window) = window {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// The menu bar item: Open Oddboro, Open at login, Quit Oddboro.
fn tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Oddboro", true, None::<&str>)?;
    let at_login = app.autolaunch().is_enabled().unwrap_or(false);
    let login =
        CheckMenuItem::with_id(app, "login", "Open at login", true, at_login, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Oddboro", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &login, &separator, &quit])?;
    TrayIconBuilder::with_id("oddboro")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("Oddboro")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => show(app),
            "login" => toggle_open_at_login(app, &login),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

/// Flips the LaunchAgent, then shows what macOS actually has.
fn toggle_open_at_login(app: &AppHandle, item: &CheckMenuItem<tauri::Wry>) {
    let launcher = app.autolaunch();
    let _ = if launcher.is_enabled().unwrap_or(false) {
        launcher.disable()
    } else {
        launcher.enable()
    };
    let _ = item.set_checked(launcher.is_enabled().unwrap_or(false));
}

/// Shows an error. Only call it off the main thread: it waits for OK.
fn alert(app: &AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .title("Oddboro")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

fn fail(app: &AppHandle, message: &str) {
    alert(app, message);
    app.exit(1);
}
