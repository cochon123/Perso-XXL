const CONTENT_FILES = [
  "config/env.js",
  "content/logger.js",
  "content/openrouter-client.js",
  "content/picker.js",
  "content/dom-context.js",
  "content/executor.js",
  "content/ai-client.js",
  "content/content.js"
];

chrome.action.onClicked.addListener(async (tab) => {
  if (!isSupportedTab(tab)) return;
  console.log("[Perso XXL] action clicked", { tabId: tab.id, url: tab.url });
  await togglePalette(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-command-palette") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isSupportedTab(tab)) return;

  console.log("[Perso XXL] command palette requested", { tabId: tab.id, url: tab.url });
  await togglePalette(tab.id);
});

function isSupportedTab(tab) {
  return Boolean(tab?.id && /^https?:\/\//.test(tab.url || ""));
}

async function togglePalette(tabId) {
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, { type: "PERSO_TOGGLE_PANEL" });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PERSO_PING" });
    return;
  } catch (_error) {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content/base.css"]
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES
    });
  }
}
