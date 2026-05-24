# Perso XXL

Perso XXL is a first-pass Chrome/Chromium extension that generates and applies AI-personalized website layout plans through OpenRouter.

## What is implemented

- MV3 extension scaffold.
- Centered in-page command palette where the user describes what to change.
- Local `.env`-driven OpenRouter config for prototype builds.
- Two-stage AI pipeline: target discovery, then transform-plan generation from a focused DOM summary.
- Strict JSON transform-plan generation through OpenRouter.
- Plan validation that blocks raw selectors, arbitrary JavaScript, unsafe CSS patterns, and unsupported rule types.
- Generic focused DOM collector for arbitrary websites, with YouTube-specific selectors still available.
- Background injection fallback so the command palette can open on already-loaded pages after extension reloads.
- Content-script executor for `style`, `visibility`, `attribute`, and restricted `css` rules.
- Saved plans are stored per hostname and reapply when the page changes.

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
7. Describe what to change and click "Generate and apply".

For local images, use "Attach image" in the command palette. Browser extensions cannot read a local path typed into the prompt, such as `/home/me/image.png`, without an explicit file picker selection.

With the log server running, extension events will stream into your terminal. You will see command palette actions, target discovery, focused DOM summaries, OpenRouter request/response metadata, validation results, storage writes, and plan application details.

## OpenRouter key

For this prototype, the key lives in `.env` and is copied into `config/env.js`.

After changing `.env`, run:

```sh
node scripts/build-env.mjs
```

Set `DEV_LOGS=false` in `.env` and rebuild if you want to disable terminal logging.

This is acceptable for a local prototype only. A production extension should call your own backend, and the backend should call OpenRouter.

## Pipeline

The current prototype uses:

```txt
User prompt
→ AI target discovery
→ Focused DOM collector
→ AI transform planner
→ Plan validator
→ Executor
```

The first AI call decides what part of the page matters. The deterministic collector then summarizes only those candidates. The second AI call generates a declarative transform plan.

## Transform plan shape

The model must return JSON like:

```json
{
  "version": "1.1",
  "site": {
    "hostname": "www.youtube.com",
    "adapter": "youtube"
  },
  "sourcePrompt": "Make thumbnails circular",
  "targetMap": {
    "thumbnail": {
      "source": "focused-dom",
      "selectors": ["img[src*='ytimg.com']", "ytd-thumbnail img"],
      "confidence": 0.75
    }
  },
  "rules": [
    {
      "id": "round-thumbnails",
      "type": "style",
      "targetRef": "thumbnail",
      "styles": {
        "borderRadius": "50%",
        "overflow": "hidden"
      }
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
