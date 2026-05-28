const CONTENT_FILES = [
  "config/env.js",
  "content/logger.js",
  "content/openrouter-client.js",
  "content/picker.js",
  "content/dom-context.js",
  "content/executor.js",
  "content/ai-client.js",
  "content/vendor/gsap.min.js",
  "ai-input/main.js",
  "content/content.js"
];

const CONTENT_CSS_FILES = [
  "content/base.css",
  "content/ai-input.css",
  "ai-input/embedded.css"
];

const extensionApi = globalThis.browser || globalThis.chrome;

extensionApi.action.onClicked.addListener(async (tab) => {
  if (!isSupportedTab(tab)) return;
  console.log("[Perso XXL] action clicked", { tabId: tab.id, url: tab.url });
  await togglePalette(tab.id);
});

extensionApi.commands.onCommand.addListener(async (command) => {
  if (command !== "open-command-palette") return;

  const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
  if (!isSupportedTab(tab)) return;

  console.log("[Perso XXL] command palette requested", { tabId: tab.id, url: tab.url });
  await togglePalette(tab.id);
});

function isSupportedTab(tab) {
  return Boolean(tab?.id && /^https?:\/\//.test(tab.url || ""));
}

async function togglePalette(tabId) {
  await ensureContentScript(tabId);
  await extensionApi.tabs.sendMessage(tabId, { type: "PERSO_TOGGLE_PANEL" });
}

async function ensureContentScript(tabId) {
  try {
    await extensionApi.tabs.sendMessage(tabId, { type: "PERSO_PING" });
    return;
  } catch (_error) {
    await extensionApi.scripting.insertCSS({
      target: { tabId },
      files: CONTENT_CSS_FILES
    });

    await extensionApi.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES
    });
  }
}
