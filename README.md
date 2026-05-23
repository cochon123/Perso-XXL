# Perso XXL

Perso XXL is a first-pass Chrome/Chromium extension that generates and applies AI-personalized YouTube layout plans through OpenRouter.

## What is implemented

- MV3 extension scaffold.
- In-page YouTube panel where the user describes their visual preferences.
- Local `.env`-driven OpenRouter config for prototype builds.
- YouTube DOM summarizer that sends a compact semantic page map to the model.
- Strict JSON transform-plan generation through OpenRouter.
- Plan validation that blocks raw selectors, arbitrary JavaScript, unsafe CSS patterns, and unsupported rule types.
- YouTube adapter that maps semantic targets like `videoCard`, `masthead`, and `comments` to real DOM selectors.
- Content-script executor for `style`, `visibility`, `attribute`, and restricted `css` rules.
- Saved YouTube plan reapplies when YouTube navigation or DOM updates occur.

## Load locally

Start the dev log terminal:

```sh
node scripts/log-server.mjs
```

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select this directory.
5. Open `https://www.youtube.com/`.
6. Click the extension icon to open the in-page Perso XXL panel.
7. Describe your preferences and click "Generate and apply".

With the log server running, extension events will stream into your terminal. You will see panel actions, DOM summaries, OpenRouter request/response metadata, validation results, storage writes, and plan application details.

## OpenRouter key

For this prototype, the key lives in `.env` and is copied into `config/env.js`.

After changing `.env`, run:

```sh
node scripts/build-env.mjs
```

Set `DEV_LOGS=false` in `.env` and rebuild if you want to disable terminal logging.

This is acceptable for a local prototype only. A production extension should call your own backend, and the backend should call OpenRouter.

## Transform plan shape

The model must return JSON like:

```json
{
  "version": "1.0",
  "site": "youtube.com",
  "theme": {
    "colors": {
      "background": "#111111",
      "surface": "#1F1F1F",
      "surfaceElevated": "#2A2A2A",
      "text": "#F5F5F5",
      "textMuted": "#B8B8B8",
      "accent": "#D99A4E"
    },
    "typography": {
      "fontFamily": "Inter, Arial, system-ui, sans-serif",
      "baseFontSize": "15px"
    },
    "radius": "12px",
    "density": "comfortable"
  },
  "rules": [
    {
      "id": "video-cards",
      "type": "style",
      "target": "videoCard",
      "styles": {
        "backgroundColor": "var(--perso-surface)",
        "borderRadius": "var(--perso-radius)",
        "padding": "10px"
      }
    },
    {
      "id": "hide-shorts",
      "type": "visibility",
      "target": "shortsShelf",
      "action": "hide"
    }
  ]
}
```

The extension does not execute model-generated JavaScript.

## Next implementation steps

- Add a real onboarding chat that builds a reusable `DesignProfile`.
- Add plan repair when a target selector stops matching.
- Add before/after preview and per-rule toggles.
- Move OpenRouter calls to a backend before production so user API keys are not stored in the browser extension.
