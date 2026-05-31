# Local E-Book Reader

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ReasonW6/local_read/pulls)

Language: [中文](README.md) | [English](README.en.md)

> A local-first e-book reader available as both a browser app and an Electron desktop app. It runs an embedded local server for stable access to your personal library, supports EPUB, TXT, and PDF files, and includes reading progress, bookmarks, preferences, custom fonts, and config backup/restore.

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
- Electron build dependencies are included in `devDependencies`

### Install

```bash
git clone https://github.com/ReasonW6/local_read.git
cd local_read
npm install
```

Dependencies are declared in `package.json` and `package-lock.json`, so `npm install` is enough for Express, Multer, AdmZip, Electron, Vitest, and related packages.

### Run In Web Mode

```bash
npm start
```

Or:

```bash
node server.js
```

When the server starts, open [http://localhost:3000](http://localhost:3000). On Windows, you can also double-click `start.bat`.

### Run In Electron Mode

```bash
npm run electron
```

The desktop app starts an embedded local server on port `31337`, so you do not need to open a separate browser window.

### Build Desktop Packages

```bash
npm run dist
```

Windows-only build:

```bash
npm run dist:win
```

## Usage

### Add Books

- Web mode: copy `.epub`, `.txt`, or `.pdf` files into the `books/` folder, or use the in-app add-books dialog.
- Electron mode: use the in-app "open books folder" action, or place files in the app data directory's `books/` folder.

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

The app stores user data in `user-data/user-config.json` in Web/development mode.

Saved data includes:

- Reading progress
- Theme and font size
- Reading preferences
- Bookmarks
- Last-read book
- Reading history

Electron packaged builds store `books/` and `user-data/` under the platform user data directory by default:

- Windows: AppData
- macOS: Library application data
- Linux: `.config`

You can override the data root with `LOCAL_READ_DATA_DIR`. Portable builds also respect `PORTABLE_EXECUTABLE_DIR` when available.

## Project Structure

```text
local_read/
├── books/                       # Local book library in Web/dev mode
├── shared/
│   └── server-core.js           # Shared Express API core for Web and Electron
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
│       └── modules/             # Reader, bookmarks, config, fonts, PDF/TXT/EPUB modules
├── tests/
│   ├── frontend/                # JSDOM unit tests
│   └── server/                  # Node API and utility tests
├── user-data/                   # Config data in Web/dev mode
├── electron-main.js             # Electron main process
├── preload.js                   # Electron preload bridge
├── server.js                    # Web-mode server entry
├── index.html                   # Bookshelf page
├── reader.html                  # Reader page
├── package.json
└── README.md
```

## Tech Stack

- Backend: Node.js, Express
- Desktop: Electron, electron-builder
- Frontend: HTML, CSS, vanilla JavaScript ES modules
- Reading libraries: ePub.js, PDF.js, JSZip
- Server utilities: Multer, AdmZip
- Tests: Vitest, Supertest, JSDOM

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

Current test coverage includes 7 test files and 106 test cases:

- Frontend: config, utility helpers, bookmark storage, config manager behavior, and add-books modal rendering
- Server: API integration tests and path/file utility tests, including traversal protection

## Contributing

Issues and pull requests are welcome.

---

If this project helps you, consider giving it a star.
