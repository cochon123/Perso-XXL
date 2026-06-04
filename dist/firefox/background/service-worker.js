const CONTENT_FILES = [
  "config/env.js",
  "content/logger.js",
  "content/schema.js",
  "content/openrouter-client.js",
  "content/picker.js",
  "content/dom-context.js",
  "content/executor.js",
  "content/ai-client.js",
  "content/vendor/gsap.min.js",
  "content/content.js",
  "chat-interface/main.js"
];

const CONTENT_CSS_FILES = [
  "content/base.css",
  "content/chat-interface.css",
  "chat-interface/embedded.css"
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

  if (message?.type === "PERSO_OPEN_MOD_PREVIEW") {
    openModificationPreview(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
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

async function openModificationPreview({ url, recordKey, modId }) {
  if (!url || !modId) {
    throw new Error("Missing preview target.");
  }

  const tab = await findOrCreateTab(url);
  await waitForTabComplete(tab.id);
  await ensureContentScript(tab.id);
  await sendTabMessage(tab.id, {
    type: "PERSO_OPEN_MOD_PREVIEW",
    recordKey,
    modId
  });
  return { ok: true, tabId: tab.id };
}

function urlsMatch(tabUrl, targetUrl) {
  try {
    const tab = new URL(tabUrl);
    const target = new URL(targetUrl);
    if (tab.origin !== target.origin) return false;
    const tabPath = tab.pathname.replace(/\/$/, "") || "/";
    const targetPath = target.pathname.replace(/\/$/, "") || "/";
    return tabPath === targetPath;
  } catch (_error) {
    return false;
  }
}

async function findOrCreateTab(url) {
  const tabs = await extensionApi.tabs.query({});
  const existing = tabs.find((tab) => urlsMatch(tab.url || "", url));
  if (existing?.id) {
    await extensionApi.tabs.update(existing.id, { active: true });
    if (existing.windowId) {
      await extensionApi.windows.update(existing.windowId, { focused: true });
    }
    return existing;
  }

  return extensionApi.tabs.create({ url, active: true });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 8000);

    function onUpdated(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== "complete") return;
      extensionApi.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timeout);
      resolve();
    }

    extensionApi.tabs.onUpdated.addListener(onUpdated);
    extensionApi.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        extensionApi.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timeout);
        resolve();
      }
    }).catch(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function sendTabMessage(tabId, message, attempts = 8) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await extensionApi.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      await ensureContentScript(tabId);
    }
  }
  throw lastError || new Error("Could not reach the page.");
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
