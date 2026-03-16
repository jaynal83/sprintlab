# Desktop Application

SprintLab ships as a native desktop application built with [Electron](https://www.electronjs.org/). The desktop version bundles the Python backend into a single installable package — no separate server setup required.

## Download

Pre-built installers are available on the [GitHub Releases page](https://github.com/mvch1ne/sprintlab/releases).

| Platform | File | Notes |
|----------|------|-------|
| Windows | `SprintLab Setup x.x.x.exe` | NSIS installer |
| macOS | `SprintLab-x.x.x.dmg` | Build from source (see below) |
| Linux | `SprintLab-x.x.x.AppImage` | Build from source (see below) |

---

## Running in Development

Run the frontend dev server and Electron together:

```bash
# Terminal 1 — Python backend
cd backend
uvicorn server:app --port 8000 --reload

# Terminal 2 — Electron + Vite
npm install        # root (first time only)
npm run electron:dev
```

Electron loads the Vite dev server at `http://localhost:5173` and hot-reloads on file changes.

---

## Building from Source

### Prerequisites (all platforms)

- Node.js ≥ 20
- Python ≥ 3.10 + pip
- PyInstaller: `pip install pyinstaller`

### Step 1 — Build the Python backend binary

```bash
# Windows
cd backend && build_backend.bat

# macOS / Linux
cd backend && ./build_backend.sh
```

This produces `backend/dist/SprintLabBackend` (or `.exe` on Windows), which Electron bundles as a resource.

### Step 2 — Package the app

```bash
npm run electron:build
```

Outputs are placed in `dist-electron/`:

| Platform | Output |
|----------|--------|
| Windows | `SprintLab Setup x.x.x.exe` |
| macOS | `SprintLab-x.x.x.dmg` |
| Linux | `SprintLab-x.x.x.AppImage` |

> **Note:** Each platform must be built on its own OS. You cannot cross-compile (e.g., build a macOS `.dmg` on Windows).

---

## Architecture

```
Electron main process (electron/main.js)
│
├── Spawns Python backend binary on startup
├── Waits for backend health check (localhost:8000/health)
├── Sets CORS/SharedArrayBuffer headers for FFmpeg WASM
└── Creates BrowserWindow → loads frontend/dist/index.html
```

The frontend communicates with the backend over `http://localhost:8000` — the same API as the web version.

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `fullscreen-change` | main → renderer | Notifies renderer when fullscreen state changes |
| `exit-fullscreen` | renderer → main | Requests the window to exit fullscreen |
| `backend-ready` | main → renderer | Signals backend is healthy (reserved for future use) |

---

## Fullscreen

Press **F11** (Windows/Linux) or **Ctrl+Cmd+F** (macOS) to toggle fullscreen.

When in fullscreen mode an **Exit Fullscreen · F11** button appears in the top-right corner of the app, so you can always get out without remembering the shortcut.
