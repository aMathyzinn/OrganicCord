# OrganicCord

Alternative, complete, and multi-account Discord client, built with a focus on lightness, compactness, and privacy. Runs as a native desktop app via Tauri 2.0 — no Electron, no bloat.

## Features

- **Simultaneous multi-account** — Fast switching between accounts in the sidebar
- **Login via Token or QR Code** — Token encrypted with AES-256-GCM + Windows Credential Manager
- **Complete chat** — Messages, replies, embeds, DMs, reactions, markdown
- **Presence and status** — Online/Idle/DND/Invisible, custom status with emoji
- **Integrated AI** — Auto-reply in channels and DMs, automated conversations between accounts with orchestrator
- **Stealth Mode** — Ctrl+Shift+. hides selected accounts and AI features
- **WebSocket Gateway** — Per-account connection with heartbeat, auto-reconnect, and real-time presence

## Stack

| Layer | Technology |
|--------|-----------|
| Desktop | Tauri 2.0 (Rust) |
| Frontend | React 18 + TypeScript 5.6 |
| Build | Vite 5 |
| State | Zustand 4.5 + Immer 10 |
| UI | Radix UI + Lucide React |
| Backend | Rust (reqwest, tokio, tokio-tungstenite) |
| Cryptography | AES-256-GCM (tokens), ECDH P-256 (QR login) |

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (MSRV 1.77.2+)
- [Tauri CLI](https://tauri.app/start/prerequisites/) — follow the Windows guide

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd OrganicCord

# Install Node.js dependencies
npm install

# Copy environment variables (optional)
cp .env.example .env
```

### Development

```bash
# Frontend only (no Rust backend)
npm run dev

# Full app (frontend + Rust backend)
npm run tauri:dev
```

### Production Build

```bash
npm run tauri:build
```

## Scripts

| Script | Command | Description |
|--------|---------|-----------|
| `dev` | `vite` | Frontend dev server |
| `build` | `tsc && vite build` | Frontend build |
| `tauri:dev` | `tauri dev` | Full dev server |
| `tauri:build` | `tauri build` | Production build |
| `type-check` | `tsc --noEmit` | Type checking |
| `lint` | `eslint src` | Linting |

## Architecture

```
Frontend (React)  ←→  Tauri Bridge (invoke)  ←→  Backend (Rust)
     │                                              │
  Zustand Stores                              Discord API v10
  - accountStore                              Discord Gateway (WS)
  - discordStore                              AES-256-GCM Storage
  - navigationStore                           Keyring (OS Credential Manager)
  - aiStore / aiConversationStore
```

### Directory Structure

```
src/                    # React Frontend
  components/           # UI Components (auth, chat, sidebar, ai, layout, ui)
  stores/               # Zustand stores (global state)
  lib/                  # Tauri Bridge + utilities
  types/                # Core TypeScript types
  styles/               # Global CSS + design tokens

src-tauri/              # Rust Backend
  src/
    commands/           # Tauri commands (account, session, discord, ai, qr_login, presence, window)
    gateway/            # WebSocket Gateway (heartbeat, identify, presence, reconnect)
    session/            # SessionManager (session state)
    storage/            # AES-256-GCM cryptography + keyring
  Cargo.toml            # Rust dependencies
  tauri.conf.json       # Tauri configuration (window, bundle, plugins)
```

## Security

- Tokens are encrypted with **AES-256-GCM** before being stored
- The encryption key is securely stored in the **Windows Credential Manager** via `keyring`
- Tokens are never logged or exposed (only the last 4 characters are visible)
- TLS uses **rustls** (no native-tls/openssl)
- QR Login uses **ECDH P-256 + HKDF + AES-CBC**

## Shortcuts

| Shortcut | Action |
|--------|------|
| `Ctrl+Shift+.` | Toggle Stealth Mode |
| `Enter` | Send message |
| `Shift+Enter` | New line in input |
| `Escape` | Cancel reply / Close modal |

## License

MIT
