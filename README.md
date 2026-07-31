# OrganicCord v0.1.5

Alternative, complete, and multi-account Discord client, built with a focus on lightness, compactness, and privacy. Runs as a native desktop app via Tauri 2.0 — no Electron, no bloat.

## 🚀 Features & What's New in v0.1.5

- **Simultaneous multi-account** — Fast switching between accounts in the sidebar and bottom bar accordion
- **2-Way Voice Calls (RTC)** — Microphone input capture (Opus encode), speaker output playback (Opus decode via CPAL), AES-256-GCM transport encryption, and Opcode 5 `Speaking` signaling
- **DAVE Protocol Integration** — End-to-End Media Encryption support via `davey` MLS
- **Resilient Gateway v10 Protocol** — Instant session resume (`OP_RESUME` - Opcode 6), Missed Heartbeat ACK tracking (`MAX_MISSED_ACKS`), and graceful handling of `OP_RECONNECT` (7) and `OP_INVALID_SESSION` (9)
- **Login via Token or QR Code** — Token encrypted with AES-256-GCM + Windows Credential Manager
- **Themes & Visual Customization** — Default AMOLED Midnight theme (`#000000`), Dark Mono default icon, Nitro color gradients, and Custom Theme Creator (Background, Primary, Secondary, Brand Accent)
- **Dual-Layer Rate Limiting** — Proactive Rust + React rate-limiter with `Retry-After` header parsing and Clyde Anti-Spam alerts
- **User Bottom Bar & Micro-animations** — Mute Mic, Deafen, Settings, inline accordions for Account Switcher & Status, and Tooltips
- **Profile & Nitro Editor** — In-app avatar, banner, bio, and display name customization with live preview and `⚡ Nitro` badge
- **Forums & Threads** — Forum channels with post cards, image thumbnails, server reactions, and thread trees
- **Privacy & Muting** — Channel, chat, and server muting with server hover cards and blocked user content hiding
- **Stealth Mode** — Ctrl+Shift+. hides selected accounts and AI features

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
