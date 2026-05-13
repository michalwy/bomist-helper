# Agent Notes

## Project Overview

BOMist Helper is a local-only web app that supports work with the BOMist desktop/local API. It serves a static frontend and proxies requests to BOMist at `http://localhost:3333` to avoid browser CORS issues.

Current main workflow:

- load purchase orders from BOMist,
- select one order,
- load its items,
- enrich item rows with part data,
- distribute invoice-level additional costs across BOMist order items while letting invoice-only item values participate in the proportional split and persisting allocation metadata in BOMist custom fields,
- choose which item rows from one or more orders should produce labels,
- clear the shared print selection when needed,
- print one label per selected item from the shared selection, optionally repeated by quantity,
- create BOMist label trees from pasted label paths without duplicating existing parent labels.

The app preserves selected UI state across page refreshes in browser `localStorage`, including the selected order, order filter text, selected item rows grouped by order, additional cost distribution drafts grouped by order, and the "repeat by quantity" option.

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

When an agent needs the local app server, first try to reuse `http://localhost:3000`. If port 3000 responds, verify it is BOMist Helper before starting another server. Only start on another port after confirming port 3000 is occupied by a different app or cannot be used. When an agent starts the local app server during work, leave it running at the end unless the user explicitly asks to stop it.

## BOMist API Assumptions

Default endpoints target BOMist 2.14.x:

- `GET /purchase_orders?limit=100`
- `GET /purchase_orders/{id}/items`
- `PUT /purchase_orders/{orderId}/items/{itemId}`
- `GET /purchase_orders/{orderId}/documents`
- `POST /documents`
- `PUT /documents/{documentId}`
- `PUT /purchase_orders/{orderId}/documents/{documentId}`
- `GET /parts/{part_id}`
- `GET /labels?limit=5000`
- `POST /labels`

The app also has an `Integration` panel where the user can change only the API URL. Endpoint paths are fixed to the BOMist 2.14.x API shape. Settings are stored in browser `localStorage`.

When changing BOMist API payloads, never guess request shapes from returned objects. Check the local Swagger schema at `http://localhost:3333/swagger.json` and keep mutation payloads within the documented request body. BOMist may return user-created custom fields such as `_bomistHelperData`, but the local API rejects updating those fields through purchase order and purchase order item `PUT` requests.

## Implementation Notes

- Keep the app local-only and dependency-light unless there is a clear reason to add tooling.
- Keep visible app text in English.
- Preserve the flexible data mapping in `public/app.js`; BOMist objects can contain nested `purchase_order`, `purchase_order_item`, and `part` payloads.
- Preserve refresh persistence for user-facing UI state. Settings use `bomist-helper-settings`; app UI state uses `bomist-helper-state`.
- Cost distribution drafts are local UI state while editing. Applying a distribution must update only existing BOMist order item unit price and total value; invoice-only values must never be posted as BOMist items. Persist allocation metadata in a BOMist document attached to the order, not in custom fields. The helper document is named `BOMist Helper Data - <order number>`, uses category `BOMist Helper`, stores JSON in `document.notes`, and is linked with `PUT /purchase_orders/{orderId}/documents/{documentId}`.
- Be careful with print styles in `public/styles.css`; `@media print` is part of the primary feature, not decoration.
- Do not hard-code private workspace paths, user data, or specific order numbers in the app.
- If you start `npm start` for the user, keep that server running after finishing so the app remains available locally.
- When changing workflows, defaults, storage keys, API assumptions, setup, verification steps, or common change areas, check whether `AGENTS.md` should be updated in the same change and update it when needed.

## Common Change Areas

- New BOMist endpoints: add or adjust fixed endpoint constants and fetch logic in `public/app.js`; do not expose endpoint paths as user-editable settings unless explicitly requested.
- Cost distribution: update the `Distribute additional costs` panel in `public/index.html`, allocation/update logic in `public/app.js`, and panel styles in `public/styles.css`.
- Label content/layout: update `buildLabels()` in `public/app.js` and matching print CSS in `public/styles.css`.
- Label path creation: update `parseLabelPath()`, `findExistingLabel()`, and `createLabelPath()` in `public/app.js`.
- UI copy: update `public/index.html` and any runtime messages in `public/app.js`.
- Persisted UI state: update `defaultAppState`, `loadAppState()`, `getCurrentAppState()`, `saveAppState()`, `applyAppState()`, and item selection restore logic in `public/app.js`.
