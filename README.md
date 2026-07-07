# Character Card Manager

Browser app for organizing SillyTavern-style character cards from `.json` and `.png` files. CSS, HTML, and JS are split into separate files — no build step, no bundler.

It can:
- Scan a character-card folder and build a searchable rolodex
- Parse both JSON cards and PNG cards with embedded metadata
- Store manual tags, notes, and custom attributes locally in the browser
- Connect to a local `llama.cpp` server for card analysis and world-info extraction
- Export accepted world-info entries as Markdown files

## Files

- `index.html` — app shell (HTML + stylesheet link + module entry point)
- `styles/app.css` — all styles
- `js/` — ES modules (13 files)
- `start.bat` — starts a local web server on port `8000`
- `stop.bat` — stops the process listening on port `8000`

## Module Layout

All application logic lives in `js/` as native ES modules loaded directly by the browser (no build step).

| Module | Responsibility |
|---|---|
| `app.js` | Entry point, event bindings, init sequence |
| `constants.js` | App-wide constants (storage keys, limits, defaults) |
| `state.js` | Shared mutable state (`state` and `els` objects) |
| `format.js` | String formatting, escaping, parsing utilities |
| `png.js` | PNG metadata parsing and extraction |
| `cards.js` | Card data model, caching, normalization |
| `settings.js` | localStorage persistence, settings UI sync |
| `dom.js` | DOM element binding, toasts, browser support detection |
| `render.js` | All rendering (card list, detail, facets, queue) |
| `llm.js` | llama.cpp API client |
| `scan.js` | File/folder scanning and import |
| `analysis.js` | Card analysis and world-info extraction |
| `export.js` | Library export/import, world-entry export |

## Running Locally

Open the project folder and run:

```bat
start.bat
```

Then open:

```text
http://localhost:8000/index.html
```

To stop the server:

```bat
stop.bat
```

## Browser Notes

Best experience:
- Chrome
- Edge

Firefox support:
- Character folder import works through a folder-upload fallback
- World-info export downloads files instead of writing directly into a chosen folder

## llama.cpp Setup

This app expects a local `llama.cpp` server exposing an OpenAI-compatible chat endpoint.

Default settings in the app:
- Base URL: `http://127.0.0.1:8080`
- Endpoint: `/v1/chat/completions`

Adjust these in the UI if your server runs elsewhere.

## World Info Flow

1. Select a character card
2. Click `Extract World Info`
3. Review the generated entries in `World Info Candidates`
4. Click `Accept` on the entries you want to keep
5. Click `Export Accepted Entries`

Export behavior:
- Chrome/Edge: writes `.md` files into the chosen world-info folder
- Firefox fallback: downloads `.md` files through the browser

## Privacy

- The app stores settings and manual metadata in browser `localStorage`
- Original card files are not modified
- No backend is required beyond your local `llama.cpp` server

## GitHub Notes

The included `.gitignore` avoids committing common OS junk and likely local test/export folders.
