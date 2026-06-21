# KeeRust

A fast, native desktop password manager for KeePass databases — a ground-up rewrite of the Electron-based [KeeWeb](https://github.com/keeweb/keeweb) on a [Tauri 2](https://tauri.app/) (Rust) + React stack. The Rust backend owns all cryptography and file I/O; the React frontend is a thin, sandboxed UI that never sees raw key material on disk.

---

## Tech Stack

### Runtime / SDK

| Layer    | Technology                                                                 |
| -------- | -------------------------------------------------------------------------- |
| Shell    | **Tauri 2** (Rust) — windowing, tray, global shortcuts, dialogs            |
| Backend  | **Rust** (edition 2021), Tokio async runtime                               |
| Frontend | **React 18** + **TypeScript 5** + **Vite 6**                               |
| UI       | **Tailwind CSS v4** + **shadcn/ui** (Radix UI primitives), radix-nova theme |
| Webview  | System WebView — **WebView2** (Windows), WebKit (macOS), WebKitGTK (Linux) |

### Key Rust dependencies (`src-tauri/Cargo.toml`)

- `tauri` (features: `tray-icon`) + `tauri-plugin-dialog`, `tauri-plugin-global-shortcut`
- [`keepass`](https://github.com/sseemayer/keepass-rs) (feature `save_kdbx4`) — KDBX parsing/writing
- `enigo` — cross-platform keystroke injection for auto-type
- `reqwest` (rustls-tls) — WebDAV transport
- `secrecy`, `uuid`, `chrono`, `base64`, `serde`/`serde_json`, `image`
- `windows` (Win32 APIs) — foreground-window capture, UI Automation, session-lock notifications (Windows-only)

### Key frontend dependencies (`package.json`)

- `react`, `react-dom`, `@tauri-apps/api`
- Radix UI (`@radix-ui/*`, `radix-ui`), `class-variance-authority`, `clsx`, `tailwind-merge`
- `lucide-react` + `@tabler/icons-react` (icons), `sonner` (toasts), `next-themes`, `react-day-picker`
- `@fontsource-variable/jetbrains-mono`

---

## Project Structure

```
KeeRust/
├── src/                      # React + TypeScript frontend
│   ├── components/
│   │   ├── screens/          # Config, Unlock, NewDatabase, Vault, Select, Settings
│   │   ├── vault/            # Entry list/detail, sidebar, generator, attachments, OTP…
│   │   ├── modals/           # Create / confirm / XML / custom-field dialogs
│   │   └── ui/               # shadcn/ui primitives
│   ├── lib/                  # store, autotype, totp, password, attachments, autolock…
│   ├── stores/               # app/settings/autotype/modals/toast state
│   ├── store.ts              # central app store (useSyncExternalStore)
│   └── App.tsx               # screen router + Tauri event wiring
├── src-tauri/                # Rust backend
│   └── src/
│       ├── lib.rs            # app setup, tray, global shortcuts, command registry
│       ├── vault.rs          # open/save DB, entries, groups, history, key files
│       ├── source.rs         # local / WebDAV source + key-file path persistence
│       ├── webdav.rs         # WebDAV GET/PUT
│       ├── autotype.rs       # foreground capture, keystroke injection, URL read
│       ├── attachments.rs    # binary attachments
│       ├── favicon.rs        # favicon fetching
│       └── syslock.rs        # Windows session lock/sleep watcher
├── package.json
└── vite.config.ts            # injects __APP_VERSION__ from package.json
```

The database is decrypted on every backend command call from cached bytes — the Rust side holds no long-lived plaintext database in memory.

---

## Getting Started

### Prerequisites

- **Rust** (stable) with the Tauri toolchain — see [Tauri prerequisites](https://tauri.app/start/prerequisites/).
- **Node.js** 18+ and **Yarn 4** (pinned via `packageManager` in `package.json`; enable with `corepack enable`).
- **Windows:** WebView2 runtime (preinstalled on Windows 11). The richest feature set (auto-type URL reading, session-lock auto-lock) is Windows-targeted.

### Install

```bash
corepack enable
yarn install
```

### Run (development)

```bash
yarn start          # = tauri dev — launches the desktop app with hot reload
```

### Build

```bash
yarn build          # type-check + build the frontend (dist/)
yarn build-win      # tauri build --no-bundle (Windows executable, no installer)
```

Other scripts: `yarn dev` (Vite only), `yarn typecheck`, `yarn preview`.

---

## How It Works

- **Sources** — a database is either a **local file** (synchronous reads/writes) or a **WebDAV** endpoint (reads served from a local cache; writes cached immediately then PUT in the background, with a sync-status indicator and remote-change banner). The active source is persisted so the app reopens to the unlock screen.
- **Key files** — the chosen key-file path is persisted backend-side and folded into every open/save automatically, so the database can require *password + key file*. Switching databases clears the stale key-file association.
- **Auto-type** — pressing the global hotkey captures the real foreground window (`GetForegroundWindow`) *before* focus shifts, matches entries against the window title/URL, and either types the single match directly or opens a picker. KeeRust's own window is detected by HWND and skipped.

---

## Limitations

- **Save format is KDBX 4 only.** The `keepass` crate can read KDBX 2/3/4 but only writes KDBX 4, so creating or saving always produces a KDBX 4 file. New databases are created as KDBX 4 (KeePass 2.x).
- Platform coverage is strongest on **Windows**; some integrations (browser URL reading for auto-type, OS-lock auto-lock) rely on Win32 APIs.

---

## Acknowledgements

- [KeeWeb](https://github.com/keeweb/keeweb) — the original web/Electron app this project reimagines natively.
- [Strongbox](https://strongboxsafe.com/) — UI/UX design inspiration.
- [keepass-rs](https://github.com/sseemayer/keepass-rs) — Rust KDBX implementation.
- [Tauri](https://tauri.app/) and [shadcn/ui](https://ui.shadcn.com/).
