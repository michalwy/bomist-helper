# Agent Notes

## Project Overview

BOMist Helper is a local-only web app that supports work with the BOMist desktop/local API. It serves a static frontend and proxies requests to BOMist at `http://localhost:3333` to avoid browser CORS issues.

Current main workflow:

- load purchase orders from BOMist,
- select one order,
- load its items,
- enrich item rows with part data,
- print one label per item, optionally repeated by quantity.

The app preserves selected UI state across page refreshes in browser `localStorage`, including the selected order, order filter text, label format, and the "repeat by quantity" option.

## Tech Stack

- Runtime: Node.js, native `node:http`
- Frontend: plain HTML, CSS, and browser JavaScript
- No build step and no external npm dependencies

## Important Files

- `server.js`: local HTTP server, static file serving, and `/api/bomist` proxy.
- `public/index.html`: app layout and visible UI labels.
- `public/app.js`: BOMist API calls, data mapping, order selection, and label generation.
- `public/styles.css`: app layout, responsive styling, and print label CSS.
- `README.md`: user-facing setup and workflow notes.

## Run And Verify

Start the app:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Quick syntax checks:

```bash
node --check server.js
node --check public/app.js
```

When testing with real data, BOMist must be running locally with API enabled in `Settings > API`.

## BOMist API Assumptions

Default endpoints target BOMist 2.14.x:

- `GET /purchase_orders?limit=100`
- `GET /purchase_orders/{id}/items`
- `GET /parts?limit=5000`

The app also has an `Integration` panel where the user can change the API URL and endpoints. These settings are stored in browser `localStorage`.

## Implementation Notes

- Keep the app local-only and dependency-light unless there is a clear reason to add tooling.
- Keep visible app text in English.
- Preserve the flexible data mapping in `public/app.js`; BOMist objects can contain nested `purchase_order`, `purchase_order_item`, and `part` payloads.
- Preserve refresh persistence for user-facing UI state. Settings use `bomist-helper-settings`; app UI state uses `bomist-helper-state`.
- Be careful with print styles in `public/styles.css`; `@media print` is part of the primary feature, not decoration.
- Do not hard-code private workspace paths, user data, or specific order numbers in the app.
- When changing workflows, defaults, storage keys, API assumptions, setup, verification steps, or common change areas, check whether `AGENTS.md` should be updated in the same change and update it when needed.

## Common Change Areas

- New BOMist endpoints: add or adjust fetch logic in `public/app.js`, then update defaults in both `defaultSettings` and `public/index.html`.
- Label content/layout: update `buildLabels()` in `public/app.js` and matching print CSS in `public/styles.css`.
- UI copy: update `public/index.html` and any runtime messages in `public/app.js`.
- Persisted UI state: update `defaultAppState`, `loadAppState()`, `getCurrentAppState()`, `saveAppState()`, and `applyAppState()` in `public/app.js`.
