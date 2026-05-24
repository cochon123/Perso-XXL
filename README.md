# Perso XXL

Perso XXL is a Chrome/Chromium extension that generates and applies AI-personalized website layout plans through OpenRouter.

## What is implemented

- MV3 extension scaffold.
- Centered in-page command palette where the user describes what to change.
- Element picker: click the **◎** button to select one or more page elements as context for the AI.
- Page DOM summary plus user selections sent to a single AI planning call.
- Strict JSON transform-plan generation through OpenRouter.
- Plan validation that blocks raw selectors on rules, unsafe CSS patterns, and unsupported rule types.
- Generic executor for `style`, `visibility`, `attribute`, and restricted `css` rules via `targetMap` selectors.
- Background injection fallback so the command palette can open on already-loaded pages after extension reloads.
- Saved plans are stored per hostname + pathname and reapply when the page changes.

## Load locally

Start the dev log terminal:

```sh
node scripts/log-server.mjs
```

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select this directory.
5. Open any `http` or `https` website.
6. Click the extension icon, or press `Ctrl+Shift+P`, to open the centered Perso XXL command palette.
7. Optionally click **◎** to pick element(s), describe what to change, and click "Generate and apply".

For local images, use "Attach image" in the command palette. Browser extensions cannot read a local path typed into the prompt, such as `/home/me/image.png`, without an explicit file picker selection.

With the log server running, extension events will stream into your terminal.

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
→ Executor
```

The user can pick one or more elements (for example, swap "this" with "this"). The AI receives the full page DOM summary plus those selections as grounding, and infers broader selectors when the prompt implies a class of elements.

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

The extension does not execute model-generated JavaScript.

## Next implementation steps

- Add mock sign-in and mock payment extension pages.
- Add selector repair when a target selector stops matching.
- Add before/after preview and per-rule toggles.
- Move OpenRouter calls to a backend before production so user API keys are not stored in the browser extension.
