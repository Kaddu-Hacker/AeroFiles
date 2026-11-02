# ✨ AeroFiles

**A glassmorphism file explorer for Windows — fast, featherweight, and free.**
By **Kaddu@Anshu** · MIT License · 100% open source

AeroFiles replaces the stock Windows Explorer experience with a fully custom,
frosted-glass interface: translucent panels, animated aurora backdrop, glowing
accents — and a Rust engine underneath, so it stays lightning-fast while looking
like the future.

## 🪟 Highlights

**Explorer**
- Custom glass UI (no native Windows chrome), custom titlebar, dark/light themes + 8 accent colors
- Details & thumbnail-grid views, sortable columns, hidden-files toggle
- Quick access, pin favorites, recents, drives with live usage bars
- Cut / copy / paste, drag & drop to move (folder rows, breadcrumbs, sidebar, drives)
- Conflict-safe transfers (`name (2).ext`), background jobs with progress
- Recycle-bin delete + permanent delete, rename, new folder/file, zip a folder
- Preview pane: images, video, audio, PDF, text/code

**Global Search**
- Deep recursive scan of any drive/folder
- Multi-filter: extension, size range, modified-within, files/folders/any
- Click any result → jump straight to it in the explorer

**Smart Cleaner**
- Safe one-click cleanup: user temp, Windows temp, update cache
- **Orphan detector**: finds leftover AppData folders no installed app claims
- Installed-apps inventory from the registry (per publisher/version/location)

**Keyboard-first**: F2 rename · Del / Shift+Del · Ctrl+C/X/V · Ctrl+A · Backspace up · Ctrl+G view · Ctrl+H hidden

## 🧱 Stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2 (Rust) — ~6 MB exe, ~70 MB RAM |
| Backend | Rust commands (walkdir, trash, winreg, sysinfo, zip) |
| Frontend | Vanilla ES modules — zero build step, zero npm runtime deps |

The same UI runs in **browser preview mode** with a mock filesystem — no Rust
toolchain needed to develop the interface.

## 📁 Layout

```
ui/                 frontend (index.html, styles/, js/)
  js/ipc.js         Tauri⇄UI bridge + browser mock backend
  js/explorer.js    file browser logic
  js/panels.js      search / cleaner / settings views
src-tauri/          Rust backend (fs_cmd, jobs, search_cleaner)
scripts/            make_icon.py · serve_dev.py · js_check.py
.github/workflows/  build.yml — builds & releases the exe on GitHub runners
```

## 🚀 Get it

Grab the installer or portable exe from **Releases** — built automatically by
GitHub Actions on every version tag.

## 🔨 Build from source

```bash
npm install                      # pulls the Tauri CLI (dev only)
python scripts/make_icon.py      # generate app-icon.png (stdlib only)
npx tauri icon app-icon.png      # platform icons
npx tauri build                  # release exe + NSIS installer
```

UI-only development (no Rust toolchain):

```bash
python scripts/serve_dev.py 8900
# → open http://127.0.0.1:8900 (mock data mode)
```

## ⚖️ License

MIT — see [LICENSE](LICENSE). Built by **Kaddu@Anshu**.

## 🔒 Operations & trust model

- **No network surface**: the shipped app has no HTTP API or listeners; UI⇄core
  traffic rides Tauri IPC inside the app's own webview. See [SECURITY.md](SECURITY.md)
  for the threat model and audit dispositions.
- **Memory model**: directory listings are single `read_dir` passes; transfers
  and zip creation stream in chunks; text previews are hard-capped at 96 KB
  (bounded read).
- **Persistence**: none by design — favorites/recents/theme live in webview
  localStorage; no background services, no telemetry, nothing phones home.
- **Concurrency**: transfers run on background worker threads with job polling;
  UI stays responsive during long operations.
- **Tests**: `cargo test` runs in CI on every build.
