# Perso XXL

Perso XXL is a Chrome/Chromium and Firefox extension that generates and applies AI-personalized website layout plans through OpenRouter.

## What is implemented

- MV3 extension scaffold.
- Centered in-page command palette where the user describes what to change.
- Element picker: click the **◎** button to select one or more page elements as context for the AI.
- Page DOM summary plus user selections sent to a single AI planning call.
- Strict JSON transform-plan generation through OpenRouter.
- Plan validation that blocks raw selectors on rules, unsafe CSS patterns, and unsupported rule types.
- Generic executor for `style`, `visibility`, `attribute`, and restricted `css` rules via `targetMap` selectors.
- Multiple managed modifications per page, stored as independent enable/disable/delete records.
- In-page modification manager plus a dedicated extension dashboard for all modified pages.
- Trusted capability rules for product workflows:
  - `scrollLock`
  - `shortcutButton`, which creates an extension-owned button that clicks an existing page action.
  - `moveElement`, which moves an existing page element to a selected destination or anchor and can be reverted.
  - `insertElement`, which adds safe extension-owned page content from a restricted element descriptor.
  - `cloneElement`, which duplicates an existing page element into a new location.
  - `swapElements`, which swaps two existing page elements.
  - `menuShortcut`, which creates a shortcut button that opens an existing menu and clicks a named menu action.
- Remote image URL download through the background worker, converted into a safe extension asset before use as `asset:<assetId>`.
- Background injection fallback so the command palette can open on already-loaded pages after extension reloads.
- Saved modifications are stored per hostname + pathname and reapply when the page changes.

## Load locally in Chrome/Chromium

Build the Chromium extension files:

```sh
npm run build:chromium
```

Start the dev log terminal:

```sh
PERSO_DATABASE_URL=postgres://user:password@localhost:5432/perso_xxl npm run dev:server
```

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select `dist/chromium`.
5. Open any `http` or `https` website.
6. Click the extension icon, or press `Ctrl+Shift+P`, to open the centered Perso XXL command palette.
7. Optionally click **◎** to pick element(s), describe what to change, and click "Generate and apply".

For local images, use "Attach image" in the command palette. Browser extensions cannot read a local path typed into the prompt, such as `/home/me/image.png`, without an explicit file picker selection.

With the dev server running, extension events will stream into your terminal. Like/dislike feedback is saved to Postgres and can be reviewed at `http://localhost:8787/feedback`.

## Load locally in Firefox

Build the Firefox extension files:

```sh
npm run build:firefox
```

Start the dev log terminal:

```sh
PERSO_DATABASE_URL=postgres://user:password@localhost:5432/perso_xxl npm run dev:server
```

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose "Load Temporary Add-on...".
3. Select `dist/firefox/manifest.json`.
4. Open any `http` or `https` website.
5. Click the extension icon, or press `Ctrl+Shift+P`, to open the centered Perso XXL command palette.

Temporary add-ons are removed when Firefox restarts, so reload the manifest from `about:debugging` after restarting the browser.

To build both browser variants at once:

```sh
npm run build
```

## OpenRouter key

For this prototype, the key lives in `.env` and is copied into `config/env.js`.

After changing `.env`, run:

```sh
node scripts/build-env.mjs
```

Set `DEV_LOGS=false` in `.env` and rebuild if you want to disable terminal logging.

Reasoning is enabled by default via OpenRouter's unified `reasoning` parameter (`enabled: true`, `effort: low`). To disable or tune it in `.env`:

```env
OPENROUTER_REASONING_ENABLED=false
OPENROUTER_REASONING_EFFORT=high
OPENROUTER_REASONING_EXCLUDE=false
```

Then run `node scripts/build-env.mjs`.

This is acceptable for a local prototype only. A production extension should call your own backend, and the backend should call OpenRouter.

## Pipeline

```txt
User prompt + optional element picks
→ Page DOM summary + selection snapshots
→ AI transform planner
→ Plan validator
→ Managed modification record
→ Composed active plan
→ Executor
```

The user can pick one or more elements (for example, swap "this" with "this"). The AI receives the full page DOM summary plus those selections as grounding, including a bounded list of hidden interactive/menu-like nodes when they already exist in the DOM, and infers broader selectors when the prompt implies a class of elements.

## Transform plan shape

The model must return JSON like:

```json
{
  "version": "2.0",
  "site": {
    "hostname": "docs.google.com",
    "pathname": "/document/d/abc/edit",
    "urlPattern": "docs.google.com/document/*"
  },
  "sourcePrompt": "Remove the Gemini button",
  "selections": [{ "id": "sel_1", "tag": "button", "ariaLabel": "Ask Gemini" }],
  "targetMap": {
    "gemini_button": {
      "source": "selection",
      "selectionRef": "sel_1",
      "selectors": ["button[aria-label='Ask Gemini']"],
      "fallbackSelectors": []
    }
  },
  "rules": [
    {
      "id": "hide-gemini",
      "type": "visibility",
      "targetRef": "gemini_button",
      "action": "hide"
    }
  ]
}
```

The extension does not execute model-generated JavaScript. Agent-like behaviors should be added as validated capabilities.

Structural changes are implemented as trusted capabilities rather than arbitrary HTML:

- `insertElement` supports a restricted set of tags, attributes, styles, child descriptors, `asset:<assetId>` image sources, and `append`/`prepend`/`before`/`after`/`replace` placement.
- `cloneElement` copies an existing matched element and places the clone with the same placement options.
- `moveElement` supports `append`, `prepend`, `before`, and `after`.
- `swapElements` exchanges two matched existing elements.
- `menuShortcut` is for actions hidden behind menus: it creates a managed shortcut, clicks the menu opener, then clicks the visible menu item matching `actionText`.

## Dashboard and page manager

Each generated plan is saved as a modification record with:

- `id`
- `title`
- `enabled`
- `sourcePrompt`
- `plan`
- timestamps

The in-page manager lets you toggle or remove modifications for the current page. The dashboard is available from the page manager or from the extension options page and shows all modified pages, all rules, and site-level reset controls.

## Feedback collection

The like/dislike controls on assistant messages post feedback to the local developer server:

```sh
npm install
PERSO_DATABASE_URL=postgres://user:password@localhost:5432/perso_xxl npm run dev:server
```

The server creates the `feedback_events` table automatically. Open `http://localhost:8787/feedback` to review totals and recent feedback. You can also use `DATABASE_URL` instead of `PERSO_DATABASE_URL`.

## Next implementation steps

- Add mock sign-in and mock payment extension pages.
- Add selector repair when a target selector stops matching.
- Add before/after preview and per-rule toggles.
- Move OpenRouter calls to a backend before production so user API keys are not stored in the browser extension.
