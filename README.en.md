# Local E-Book Reader

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ReasonW6/local_read/pulls)

Language: [中文](README.md) | [English](README.en.md)

> A local-first e-book reader available as both a browser app and a Tauri desktop app. Web mode keeps the Express HTTP API; desktop mode uses Tauri + Rust commands for books, configs, fonts, covers, and local data access. It supports EPUB, TXT, and PDF files, with reading progress, bookmarks, preferences, custom fonts, and config backup/restore.

[Quick Start](#quick-start) | [Usage](#usage) | [Configuration](#configuration) | [Project Structure](#project-structure)

## Features

### Reading

- Multi-format support: `.epub`, `.txt`, and `.pdf`
- Add books through drag-and-drop, file picker, or by copying files into the library folder
- Clean reading interface with light and dark themes
- Font size, line height, paragraph spacing, letter spacing, page width, and page padding controls
- Chapter navigation and table of contents
- Bookmarks with jump support
- Keyboard shortcuts for common reading actions

### Data

- One-click save for reading data and settings
- Automatic restore on startup
- Config backup files that include reading progress, bookmarks, theme, and preferences
- Local server-side storage instead of relying only on browser cache
- Config-file based migration between devices

### Extras

- Recently-read and last-read indicators
- Local-first privacy model
- Reading progress bar
- Custom font upload and switching for `.ttf`, `.otf`, `.woff`, and `.woff2`
- Cross-platform desktop builds for Windows, macOS, and Linux

## Known Limitations

- PDF table-of-contents accuracy depends on the PDF file's own outline metadata.
- Large EPUB files may take longer to load.
- Cover extraction or first-page rendering can take a moment for large books.

## Quick Start

### Requirements

- [Node.js](https://nodejs.org/) v18.0 or newer
- A modern browser for Web mode
- [Rust](https://www.rust-lang.org/tools/install) stable toolchain for Tauri desktop mode
- Windows desktop builds require Microsoft C++ Build Tools and WebView2 Runtime

### Install

```bash
git clone https://github.com/ReasonW6/local_read.git
cd local_read
npm install
```

Dependencies are declared in `package.json` and `package-lock.json`, so `npm install` is enough for Express, Multer, AdmZip, Tauri CLI, Vitest, and related JavaScript packages.

### Run In Web Mode

```bash
npm start
```

Or:

```bash
node server.js
```

When the server starts, open [http://localhost:3000](http://localhost:3000). On Windows, you can also double-click `start.bat`.

### Run In Tauri Desktop Mode

Development run:

```bash
npm run tauri dev
```

Tauri loads the existing HTML/CSS/vanilla JavaScript frontend. Desktop data access goes through Rust commands and does not start Electron or an embedded Express server.

### Build Desktop Packages

```bash
npm run tauri build
```

You can also use the explicit script aliases:

```bash
npm run tauri:dev
npm run tauri:build
```

## Usage

### Add Books

- Web mode: copy `.epub`, `.txt`, or `.pdf` files into the `books/` folder, or use the in-app add-books dialog.
- Tauri desktop mode: use the in-app "open books folder" action, or import files through the add-books dialog.

### Reading Controls

- Toolbar: font size, theme, save, bookmarks, and chapter navigation
- Settings panel:
  - Page width: `400-2000px`
  - Page padding: `10-150px`
  - Line height: `1.0-3.5`
  - Paragraph spacing: `0.2-4`
  - Letter spacing: `0-5px`
  - Reading progress bar visibility
  - Custom font upload and selection

### Keyboard Shortcuts

- `Left` / `Right`: previous or next chapter
- `+` / `-`: increase or decrease font size
- `T`: toggle theme
- `B`: add bookmark
- `S`: save progress

## Configuration

Web mode and Tauri development mode use the project directory as the data root:

- `books/`: book files
- `user-data/`: config files
- `user-data/fonts/`: custom fonts

Saved data includes:

- Reading progress
- Theme and font size
- Reading preferences
- Bookmarks
- Last-read book
- Reading history

Tauri packaged builds store `books/`, `user-data/`, and `user-data/fonts/` under the platform app data directory by default:

- Windows: AppData
- macOS: Application Support / Library
- Linux: `.config`

You can override the Tauri desktop data root with `LOCAL_READ_DATA_DIR`, which is useful for portable builds or a custom synced folder.

## Project Structure

```text
local_read/
├── books/                       # Local book library in Web/dev mode
├── shared/
│   └── server-core.js           # Express API core for Web mode
├── src-tauri/                   # Tauri desktop shell and Rust local API
│   ├── src/
│   │   ├── commands.rs          # Book, config, font, cover, and folder commands
│   │   ├── paths.rs             # Data directory and path safety logic
│   │   └── models.rs            # Shared Rust/frontend data models
│   └── tests/                   # Rust path safety tests
├── src/
│   ├── css/                     # Styles
│   │   ├── base.css
│   │   ├── components.css
│   │   ├── qidian.css           # Bookshelf page styles
│   │   ├── responsive.css
│   │   └── titlebar.css
│   └── js/
│       ├── app.js               # Reader app entry
│       ├── bookshelfApp.js      # Bookshelf page entry
│       ├── core/                # Shared frontend config, state, and utilities
│       ├── platform/            # Web HTTP / Tauri Rust API adapters
│       └── modules/             # Reader, bookmarks, config, fonts, PDF/TXT/EPUB modules
├── tests/
│   ├── frontend/                # JSDOM unit tests
│   └── server/                  # Node API and utility tests
├── user-data/                   # Config data in Web/dev mode
├── dist-tauri/                  # Generated Tauri frontend assets
├── scripts/
│   ├── build-tauri-assets.js    # Copies static frontend assets for Tauri
│   └── tauri-dev-server.js      # Static frontend server for Tauri dev mode
├── server.js                    # Web-mode server entry
├── index.html                   # Bookshelf page
├── reader.html                  # Reader page
├── package.json
└── README.md
```

## Tech Stack

- Backend: Node.js, Express
- Desktop: Tauri 2, Rust
- Frontend: HTML, CSS, vanilla JavaScript ES modules
- Reading libraries: ePub.js, PDF.js, JSZip
- Server utilities: Multer, AdmZip
- Tests: Vitest, Supertest, JSDOM, Cargo

## Tests

Run all tests:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Run only frontend tests:

```bash
npx vitest tests/frontend
```

Run only server tests:

```bash
npx vitest tests/server
```

Run Rust/Tauri-side tests and checks:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Current JavaScript coverage includes 9 test files and 113 test cases:

- Frontend: API adapter, config, utility helpers, bookmark storage, config manager behavior, and add-books modal rendering
- Server: API integration tests, Tauri dev startup config, and path/file utility tests, including traversal protection
- Rust: 4 path safety tests for desktop data directories

## Contributing

Issues and pull requests are welcome.

---

If this project helps you, consider giving it a star.
