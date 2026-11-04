# apps/

User-facing surfaces. The web apps are SvelteKit only, each with a fixed port
in the 4500 range, set in its `vite.config.ts` with `strictPort`. The desktop
app is a Rust shell with no web code of its own.

- [office/CLAUDE.md](office/CLAUDE.md). The floor. Port 4500, local only, runs the owner's office (Main Street to start) on their computer. Not deployed.
- [site/CLAUDE.md](site/CLAUDE.md). The public site for Oddboro, oddboro.com. Port 4501. Prerendered to static files, no third-party requests, collects nothing.
- [desktop/CLAUDE.md](desktop/CLAUDE.md). Oddboro for the Mac, Linux and Windows. A Tauri v2 shell in Rust that runs the office on a bundled Node, on port 4500 unless `ODDBORO_PORT` says otherwise. Apple Silicon on a Mac, an AppImage for x86_64 and arm64 on Linux, an installer for x64 and arm64 on Windows.
