const extensionApi = globalThis.browser || globalThis.chrome;
const SITE_RECORD_PREFIX = "siteRecord:";

const siteList = document.getElementById("site-list");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const refreshBtn = document.getElementById("refresh-btn");
const siteCount = document.getElementById("site-count");
const modCount = document.getElementById("mod-count");
const activeCount = document.getElementById("active-count");

let records = [];

refreshBtn.addEventListener("click", loadRecords);
searchInput.addEventListener("input", render);
siteList.addEventListener("click", handleActionClick);

loadRecords();

async function loadRecords() {
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
  const active = record.modifications.filter((mod) => mod.enabled !== false).length;
  const url = record.site?.url || record.key.replace(SITE_RECORD_PREFIX, "");
  return `
    <article class="site-card" data-record-key="${escapeAttr(record.key)}">
      <header class="site-head">
        <div class="site-title">
          <h2>${escapeHtml(record.site?.title || url)}</h2>
          <p>${escapeHtml(url)} · ${active}/${record.modifications.length} active</p>
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

  await loadRecords();
}

async function saveRecord(record) {
  const next = {
    version: 1,
    site: record.site,
    conversations: record.conversations,
    modifications: record.modifications,
    lastUpdatedAt: new Date().toISOString()
  };
  await extensionApi.storage.local.set({ [record.key]: next });
}

async function deleteRecord(record) {
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
