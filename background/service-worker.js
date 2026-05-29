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

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PERSO_OPEN_DASHBOARD") {
    extensionApi.tabs.create({ url: extensionApi.runtime.getURL("dashboard/index.html") });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "PERSO_FETCH_IMAGE_ASSET") {
    fetchImageAsset(message.url)
      .then((asset) => sendResponse({ ok: true, ...asset }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
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

async function fetchImageAsset(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Only http and https image URLs are supported.");
  }

  const response = await fetch(parsed.href, {
    credentials: "omit",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Image request failed with ${response.status}.`);
  }

  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!type?.startsWith("image/")) {
    throw new Error("The URL did not return an image.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 4 * 1024 * 1024) {
    throw new Error("Image is larger than 4 MB.");
  }

  return {
    type,
    size: bytes.byteLength,
    name: parsed.pathname.split("/").filter(Boolean).pop() || "remote-image",
    dataUrl: `data:${type};base64,${toBase64(bytes)}`
  };
}

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}
