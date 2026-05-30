const extensionApi = globalThis.browser || globalThis.chrome;
const SITE_RECORD_PREFIX = "siteRecord:";

const siteList = document.getElementById("site-list");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const refreshBtn = document.getElementById("refresh-btn");
const themeToggle = document.getElementById("theme-toggle");
const siteCount = document.getElementById("site-count");
const modCount = document.getElementById("mod-count");
const activeCount = document.getElementById("active-count");
const THEME_STORAGE_KEY = "perso-dashboard-theme";
const DEFAULT_FAVICON_URL = "assets/world-grid-svgrepo-com.svg";

let records = [];
let mockMode = false;

initThemeToggle();
refreshBtn.addEventListener("click", loadRecords);
searchInput.addEventListener("input", render);
siteList.addEventListener("click", handleActionClick);

loadRecords();

function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function setTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_STORAGE_KEY, next);
  updateThemeToggleUi();
}

function updateThemeToggleUi() {
  if (!themeToggle) return;
  const dark = getTheme() === "dark";
  themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  themeToggle.title = dark ? "Light mode" : "Dark mode";
}

function initThemeToggle() {
  updateThemeToggleUi();
  themeToggle?.addEventListener("click", () => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
  });
}

function hasExtensionStorage() {
  return Boolean(extensionApi?.storage?.local?.get);
}

function isMockModeRequested() {
  const param = new URLSearchParams(location.search).get("mock");
  if (param === "1") return true;
  if (param === "0") return false;
  return !hasExtensionStorage();
}

function cloneMockRecords() {
  const source = window.DASHBOARD_MOCK_RECORDS || [];
  return source.map((record) => ({
    ...record,
    site: { ...record.site },
    conversations: [...(record.conversations || [])],
    modifications: record.modifications.map((mod) => ({ ...mod }))
  }));
}

function setMockBannerVisible(visible) {
  document.body.classList.toggle("dashboard--mock", visible);
  let banner = document.getElementById("mock-banner");
  if (!visible) {
    banner?.remove();
    return;
  }
  if (banner) return;
  banner = document.createElement("p");
  banner.id = "mock-banner";
  banner.className = "mock-banner";
  banner.textContent = "Preview mode — showing mock data. Load the extension to manage real modifications.";
  document.querySelector(".dashboard-shell")?.prepend(banner);
}

async function loadRecords() {
  mockMode = isMockModeRequested();
  setMockBannerVisible(mockMode);

  if (mockMode) {
    records = cloneMockRecords();
    render();
    return;
  }

  const data = await extensionApi.storage.local.get(null);
  records = Object.entries(data)
    .filter(([key, value]) => key.startsWith(SITE_RECORD_PREFIX) && value?.modifications?.length)
    .map(([key, value]) => normalizeRecord(key, value))
    .sort((left, right) => String(right.lastUpdatedAt).localeCompare(String(left.lastUpdatedAt)));
  render();
}

function normalizeRecord(key, value) {
  return {
    key,
    site: value.site || {},
    conversations: Array.isArray(value.conversations) ? value.conversations : [],
    modifications: Array.isArray(value.modifications) ? value.modifications : [],
    lastUpdatedAt: value.lastUpdatedAt || value.updatedAt || value.createdAt || ""
  };
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const visible = records.filter((record) => recordMatches(record, query));
  const totalMods = records.reduce((sum, record) => sum + record.modifications.length, 0);
  const totalActive = records.reduce((sum, record) => sum + record.modifications.filter((mod) => mod.enabled !== false).length, 0);

  siteCount.textContent = String(records.length);
  modCount.textContent = String(totalMods);
  activeCount.textContent = String(totalActive);
  emptyState.hidden = visible.length > 0;
  siteList.innerHTML = visible.map(renderRecord).join("");
}

function recordMatches(record, query) {
  if (!query) return true;
  const haystack = [
    record.key,
    record.site?.url,
    record.site?.title,
    ...record.modifications.flatMap((mod) => [mod.title, mod.sourcePrompt, mod.status])
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

function renderRecord(record) {
  const url = record.site?.url || record.key.replace(SITE_RECORD_PREFIX, "");
  const faviconUrl = getFaviconUrl(url);
  const fallbackFaviconUrl = getFallbackFaviconUrl(url);
  const favicon = faviconUrl ? `
          <img
            class="site-favicon"
            src="${escapeAttr(faviconUrl)}"
            data-fallback-src="${escapeAttr(fallbackFaviconUrl)}"
            data-default-src="${escapeAttr(DEFAULT_FAVICON_URL)}"
            alt=""
            width="36"
            height="36"
            loading="lazy"
            onerror="handleFaviconError(this)"
          >` : "";
  return `
    <article class="site-card" data-record-key="${escapeAttr(record.key)}">
      <header class="site-head">
        <div class="site-identity">
          ${favicon}
          <div class="site-title">
            <h2>${escapeHtml(record.site?.title || url)}</h2>
            <p>${escapeHtml(url)}</p>
          </div>
        </div>
        <div class="site-actions">
          <button type="button" data-action="disable-site">Disable all</button>
          <button type="button" data-action="reset-site">Delete site</button>
        </div>
      </header>
      <div class="mod-list">
        ${record.modifications.map(renderModification).join("")}
      </div>
    </article>
  `;
}

function handleFaviconError(img) {
  const fallbackSrc = img.dataset.fallbackSrc || "";
  const defaultSrc = img.dataset.defaultSrc || "";

  if (fallbackSrc) {
    img.dataset.fallbackSrc = "";
    img.src = fallbackSrc;
    return;
  }

  if (defaultSrc && !img.dataset.usedDefaultSrc) {
    img.dataset.usedDefaultSrc = "true";
    img.src = defaultSrc;
    return;
  }

  img.hidden = true;
}

function getFaviconUrl(value) {
  try {
    const parsed = new URL(value);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch (_error) {
    return "";
  }
}

function getFallbackFaviconUrl(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}/favicon.ico`;
  } catch (_error) {
    return "";
  }
}

function renderModification(modification) {
  const enabled = modification.enabled !== false;
  return `
    <div class="mod-row" data-mod-id="${escapeAttr(modification.id)}" data-enabled="${enabled ? "true" : "false"}">
      <div>
        <p class="mod-title"><span class="status-dot"></span>${escapeHtml(modification.title || "Modification")}</p>
        <p class="mod-prompt">${escapeHtml(modification.sourcePrompt || "")}</p>
        <p class="mod-meta">${escapeHtml(formatDate(modification.updatedAt || modification.createdAt))}</p>
      </div>
      <div class="mod-actions">
        <button type="button" class="mod-action-icon" data-action="preview-mod" aria-label="Preview on page" title="Preview on page">
          ${iconExternalLink()}
        </button>
        <button type="button" data-action="toggle-mod">${enabled ? "Disable" : "Enable"}</button>
        <button type="button" data-action="delete-mod">Delete</button>
      </div>
    </div>
  `;
}

async function handleActionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const card = button.closest("[data-record-key]");
  const record = records.find((candidate) => candidate.key === card?.dataset.recordKey);
  if (!record) return;

  const action = button.dataset.action;
  const modId = button.closest("[data-mod-id]")?.dataset.modId;

  if (action === "preview-mod" && modId) {
    await openModificationPreview(record, modId);
    return;
  }

  if (action === "toggle-mod" && modId) {
    record.modifications = record.modifications.map((mod) => (
      mod.id === modId ? { ...mod, enabled: mod.enabled === false, updatedAt: new Date().toISOString() } : mod
    ));
    await saveRecord(record);
  }

  if (action === "delete-mod" && modId) {
    record.modifications = record.modifications.filter((mod) => mod.id !== modId);
    if (record.modifications.length) await saveRecord(record);
    else await deleteRecord(record);
  }

  if (action === "disable-site") {
    record.modifications = record.modifications.map((mod) => ({ ...mod, enabled: false, updatedAt: new Date().toISOString() }));
    await saveRecord(record);
  }

  if (action === "reset-site") {
    await deleteRecord(record);
  }

  if (!mockMode) {
    await loadRecords();
  }
}

async function saveRecord(record) {
  record.lastUpdatedAt = new Date().toISOString();

  if (mockMode) {
    const index = records.findIndex((candidate) => candidate.key === record.key);
    if (index >= 0) records[index] = record;
    render();
    return;
  }

  const next = {
    version: 1,
    site: record.site,
    conversations: record.conversations,
    modifications: record.modifications,
    lastUpdatedAt: record.lastUpdatedAt
  };
  await extensionApi.storage.local.set({ [record.key]: next });
}

async function deleteRecord(record) {
  if (mockMode) {
    records = records.filter((candidate) => candidate.key !== record.key);
    render();
    return;
  }

  await extensionApi.storage.local.remove([record.key]);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function iconExternalLink() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h6v6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 14 20 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
      <path d="M19 14v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
    </svg>
  `;
}

async function openModificationPreview(record, modId) {
  const url = record.site?.url || record.key.replace(SITE_RECORD_PREFIX, "");
  if (!url) return;

  if (mockMode) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    await extensionApi.runtime.sendMessage({
      type: "PERSO_OPEN_MOD_PREVIEW",
      url,
      recordKey: record.key,
      modId
    });
  } catch (_error) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
