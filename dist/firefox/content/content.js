const log = window.PersoLogger;
const CONTENT_VERSION = "0.7.0-chat-interface";
let currentPlan = null;
let currentSiteRecord = null;
let applyTimer = null;
let lastApplyResult = null;
/** @type {HTMLElement | null} */
let panel = null;
let suppressMutationApplyUntil = 0;
let zeroMatchRetryCount = 0;
let selectionCounter = 0;
/** @type {string | null} */
let focusedModId = null;
/** @type {HTMLElement | null} */
let modPreviewOverlay = null;
const extensionApi = globalThis.browser || globalThis.chrome;
const SITE_RECORD_PREFIX = "siteRecord:";
const LEGACY_PLAN_PREFIX = "sitePlan:";
const FEEDBACK_ENDPOINT = window.PersoEnv?.FEEDBACK_ENDPOINT || "http://localhost:8787/feedback";
const INSTALL_ID_KEY = "persoInstallId";

function injectPanelFontFace() {
  const styleId = "perso-xxl-font-face";
  if (document.getElementById(styleId)) return;

  let fontUrl;
  try {
    fontUrl = extensionApi.runtime.getURL("chat-interface/fonts/Chewy-Regular.ttf");
  } catch (_error) {
    return;
  }

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `@font-face{font-family:"Chewy";font-style:normal;font-weight:400;font-display:swap;src:url("${fontUrl}") format("truetype");}`;
  (document.head || document.documentElement).appendChild(style);
}

injectPanelFontFace();

log.info("content.loaded", {
  version: CONTENT_VERSION,
  hasSavedPlan: false
});

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PERSO_PING") {
    sendResponse({ ok: true, version: CONTENT_VERSION });
    return true;
  }

  if (message?.type === "PERSO_TOGGLE_PANEL") {
    log.info("panel.toggle.requested");
    togglePanel();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "PERSO_APPLY_PLAN") {
    log.info("plan.apply.message", { ruleCount: message.plan?.rules?.length || 0 });
    currentPlan = message.plan;
    applyCurrentPlan();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "PERSO_OPEN_MOD_PREVIEW") {
    openModificationPreview(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

loadSavedPlan();

const observer = new MutationObserver((mutations) => {
  if (!currentPlan) return;
  if (Date.now() < suppressMutationApplyUntil) return;
  if (!mutations.some(isRelevantPageMutation)) return;

  scheduleApply("page-mutation");
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

function scheduleApply(reason = "unknown") {
  clearTimeout(applyTimer);
  log.debug("plan.apply.scheduled", { reason });
  applyTimer = setTimeout(applyCurrentPlan, 250);
}

function applyCurrentPlan() {
  if (!currentPlan) return;
  suppressMutationApplyUntil = Date.now() + 1200;
  log.info("plan.apply.started", {
    ruleCount: currentPlan.rules?.length || 0
  });
  const result = window.PersoExecutor.applyPlan(currentPlan);
  lastApplyResult = {
    ...result,
    appliedAt: new Date().toISOString()
  };
  log.info("plan.apply.finished", result);
  if (result?.totalMatched === 0 && zeroMatchRetryCount < 5) {
    zeroMatchRetryCount += 1;
    log.warn("plan.apply.zero_matches", { retry: zeroMatchRetryCount });
    setTimeout(() => scheduleApply("zero-match-retry"), 1000 * zeroMatchRetryCount);
  } else if (result?.totalMatched > 0) {
    zeroMatchRetryCount = 0;
  }
}

function isRelevantPageMutation(mutation) {
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
  if (nodes.length === 0) return false;

  return nodes.some((node) => {
    if (isPersoNode(node)) return false;
    return Boolean(node.matches?.("main, section, article, header, nav, aside, footer, img, video, canvas, button, a, form, input, textarea, select") ||
      node.querySelector?.("main, section, article, header, nav, aside, footer, img, video, canvas, button, a, form, input, textarea, select"));
  });
}

function isPersoNode(node) {
  return node.id?.startsWith("perso-xxl") ||
    node.closest?.("#perso-xxl-panel") ||
    node.hasAttribute?.("data-perso-xxl-rule");
}

function togglePanel() {
  if (!panel) return;
  if (panel.hidden) openPanel();
  else closePanel();
}

function openPanel() {
  if (!panel) return;
  panel.style.display = "";
  panel.hidden = false;
  if (focusedModId) {
    setPanelMode("mod-focus");
    renderModificationPreview(getFocusedModification());
  } else {
    setPanelMode("chat");
  }
  log.info("panel.visibility.changed", { hidden: false });
  loadPanelState();
}

function closePanel() {
  if (!panel || panel.hidden) return;
  exitModificationPreview();
  panel.hidden = true;
  log.info("panel.visibility.changed", { hidden: true });
}

function attachPanelInteractions() {
  const backdrop = panel.querySelector(".perso-xxl-panel-backdrop");
  backdrop?.addEventListener("mousedown", (e) => {
    e.preventDefault();
    closePanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !panel || panel.hidden) return;
    const menu = panel.querySelector("#attach-menu");
    if (menu && !menu.hidden) return;
    if (window.PersoPicker?.isActive?.()) return;
    closePanel();
  });
}

function createAiInputMarkup() {
  return `
    <div class="perso-xxl-panel-backdrop" aria-hidden="true"></div>
    <div class="preview-stack" id="preview-stack">
      <div class="ai-sent-list" id="sent-list" aria-live="polite"></div>

      <div class="ai-input" id="ai-input" data-state="idle" data-multiline="false">
        <div class="ai-input__body">
          <div class="ai-input__left">
            <button
              type="button"
              class="ai-input__btn ai-input__btn--attach"
              id="attach-toggle"
              aria-label="Add attachment"
              aria-expanded="false"
              aria-haspopup="menu"
            >
              <svg class="ai-input__icon ai-input__icon--plus" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span class="ai-input__loader" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <g transform="translate(12 12)">
                    <circle r="9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="28 56" transform="rotate(-90)"/>
                  </g>
                </svg>
              </span>
            </button>

            <div class="ai-input__menu" id="attach-menu" role="menu" hidden>
              <button type="button" class="ai-input__menu-item" role="menuitem" data-action="dashboard">
                <span class="ai-input__menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="3" width="8" height="8" rx="1.75" stroke="currentColor" stroke-width="1.75"/>
                    <rect x="13" y="3" width="8" height="8" rx="1.75" stroke="currentColor" stroke-width="1.75"/>
                    <rect x="3" y="13" width="8" height="8" rx="1.75" stroke="currentColor" stroke-width="1.75"/>
                    <rect x="13" y="13" width="8" height="8" rx="1.75" stroke="currentColor" stroke-width="1.75"/>
                  </svg>
                </span>
                <span class="ai-input__menu-text">
                  <strong>Dashboard</strong>
                  <small>Manage modifications</small>
                </span>
              </button>
              <button type="button" class="ai-input__menu-item" role="menuitem" data-action="image">
                <span class="ai-input__menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.75"/>
                    <circle cx="8.5" cy="10.5" r="1.75" fill="currentColor"/>
                    <path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.12 0L3 19" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                </span>
                <span class="ai-input__menu-text">
                  <strong>Add image</strong>
                  <small>Upload a reference</small>
                </span>
              </button>
              <button type="button" class="ai-input__menu-item" role="menuitem" data-action="pick">
                <span class="ai-input__menu-icon">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 4l7 16 2.5-6.5L20 11 4 4z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
                    <path d="M13 13l6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                </span>
                <span class="ai-input__menu-text">
                  <strong>Pick from page</strong>
                  <small>Select an element</small>
                </span>
              </button>
            </div>

            <input type="file" id="image-input" accept="image/*" hidden />
          </div>

          <div class="ai-input__field-wrap">
            <div
              class="ai-input__editor"
              id="prompt-editor"
              contenteditable="true"
              role="textbox"
              aria-multiline="true"
              aria-label="Describe what you want to change"
              spellcheck="true"
            ></div>
            <span class="ai-input__placeholder" id="prompt-placeholder" aria-hidden="true">
              Describe what you want to change…
            </span>
            <div class="ai-input__status" id="input-status" hidden>
              <div class="ai-input__status-viewport">
                <div class="ai-input__status-line" id="status-line">
                  <span class="ai-input__status-label" id="status-label"></span>
                  <span class="ai-input__dots" id="status-dots" aria-hidden="true">
                    <span></span><span></span><span></span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            class="ai-input__btn ai-input__btn--send"
            id="send-btn"
            aria-label="Send prompt"
            disabled
          >
            <svg class="ai-input__icon ai-input__icon--send" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="ai-input__send-revert" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 20.75C10.078 20.7474 8.23546 19.9827 6.8764 18.6236C5.51733 17.2645 4.75265 15.422 4.75 13.5C4.75 13.3011 4.82902 13.1103 4.96967 12.9697C5.11032 12.829 5.30109 12.75 5.5 12.75C5.69891 12.75 5.88968 12.829 6.03033 12.9697C6.17098 13.1103 6.25 13.3011 6.25 13.5C6.25 14.6372 6.58723 15.7489 7.21905 16.6945C7.85087 17.6401 8.74889 18.3771 9.79957 18.8123C10.8502 19.2475 12.0064 19.3614 13.1218 19.1395C14.2372 18.9177 15.2617 18.37 16.0659 17.5659C16.87 16.7617 17.4177 15.7372 17.6395 14.6218C17.8614 13.5064 17.7475 12.3502 17.3123 11.2996C16.8771 10.2489 16.1401 9.35087 15.1945 8.71905C14.2489 8.08723 13.1372 7.75 12 7.75H9.5C9.30109 7.75 9.11032 7.67098 8.96967 7.53033C8.82902 7.38968 8.75 7.19891 8.75 7C8.75 6.80109 8.82902 6.61032 8.96967 6.46967C9.11032 6.32902 9.30109 6.25 9.5 6.25H12C13.9228 6.25 15.7669 7.01384 17.1265 8.37348C18.4862 9.73311 19.25 11.5772 19.25 13.5C19.25 15.4228 18.4862 17.2669 17.1265 18.6265C15.7669 19.9862 13.9228 20.75 12 20.75Z" fill="currentColor"/>
                <path d="M12 10.75C11.9015 10.7505 11.8038 10.7313 11.7128 10.6935C11.6218 10.6557 11.5393 10.6001 11.47 10.53L8.47001 7.53003C8.32956 7.38941 8.25067 7.19878 8.25067 7.00003C8.25067 6.80128 8.32956 6.61066 8.47001 6.47003L11.47 3.47003C11.5387 3.39634 11.6215 3.33724 11.7135 3.29625C11.8055 3.25526 11.9048 3.23322 12.0055 3.23144C12.1062 3.22966 12.2062 3.24819 12.2996 3.28591C12.393 3.32363 12.4778 3.37977 12.549 3.45099C12.6203 3.52221 12.6764 3.60705 12.7141 3.70043C12.7519 3.79382 12.7704 3.89385 12.7686 3.99455C12.7668 4.09526 12.7448 4.19457 12.7038 4.28657C12.6628 4.37857 12.6037 4.46137 12.53 4.53003L10.06 7.00003L12.53 9.47003C12.6705 9.61066 12.7494 9.80128 12.7494 10C12.7494 10.1988 12.6705 10.3894 12.53 10.53C12.4608 10.6001 12.3782 10.6557 12.2872 10.6935C12.1962 10.7313 12.0986 10.7505 12 10.75Z" fill="currentColor"/>
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
    <div class="mod-focus-stack" id="mod-focus-stack" hidden>
      <div class="mod-focus-card">
        <div class="mod-focus-head">
          <button type="button" class="mod-focus-edit" id="mod-focus-edit" aria-label="Rename modification">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
            </svg>
          </button>
          <p class="mod-focus-title" id="mod-focus-title"></p>
          <input type="text" class="mod-focus-title-input" id="mod-focus-title-input" maxlength="120" hidden />
        </div>
        <div class="mod-focus-actions">
          <button type="button" id="mod-focus-toggle">Disable</button>
          <button type="button" id="mod-focus-delete">Delete</button>
        </div>
      </div>
    </div>
    <div class="toast productivity-toast" id="toast" role="status" aria-live="polite"></div>
  `;
}

function createPanel() {
  const root = document.createElement("section");
  root.id = "perso-xxl-panel";
  root.hidden = true;
  root.style.display = "none";
  root.innerHTML = createAiInputMarkup();
  return root;
}

function initExtensionHost() {
  window.PersoExtension = {
    enabled: true,

    async pickElement() {
      if (!panel || window.PersoPicker.isActive()) {
        throw new Error("Selection cancelled.");
      }
      panel.hidden = true;
      log.info("picker.requested");
      try {
        return await window.PersoPicker.pickElement();
      } finally {
        panel.hidden = false;
        panel.querySelector("#prompt-editor")?.focus?.();
      }
    },

    formatElementLabel(element) {
      if (element.id) return `#${element.id}`;
      const tag = element.tagName.toLowerCase();
      const classes = Array.from(element.classList || []).slice(0, 2);
      return classes.length ? `${tag}.${classes.join(".")}` : tag;
    },

    async onSend({ prompt, tokens }) {
      const trimmed = prompt?.trim();
      if (!trimmed) throw new Error("Type what you want to change first.");
      if (hasLocalPath(trimmed) && !tokens.some(([, stored]) => stored.type === "image")) {
        throw new Error("Attach the image file instead of typing its local path.");
      }
      return generateAndApplyPlan({ prompt: trimmed, tokens });
    },

    async onRevert() {
      await revertAppliedPlan();
    },

    async onFeedback(payload) {
      return sendFeedback(payload || {});
    },

    openDashboard() {
      try {
        const result = extensionApi.runtime.sendMessage({ type: "PERSO_OPEN_DASHBOARD" });
        if (result?.catch) result.catch(() => {});
      } catch (_error) {}
    }
  };
}

async function loadPanelState() {
  const state = await extensionApi.storage.local.get(["profileNotes", getSiteRecordKey(), getLegacyPlanStorageKey()]);
  const savedPlan = state[getLegacyPlanStorageKey()];
  currentSiteRecord = normalizeSiteRecord(state[getSiteRecordKey()]);

  if (!state[getSiteRecordKey()] && savedPlan) {
    currentSiteRecord = migrateLegacyPlan(savedPlan);
    await saveSiteRecord(currentSiteRecord);
    await extensionApi.storage.local.remove([getLegacyPlanStorageKey()]);
  }

  const editor = panel?.querySelector("#prompt-editor");

  if (editor && state.profileNotes && !editor.textContent.trim()) {
    editor.textContent = state.profileNotes;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  log.info("panel.state.loaded", {
    hasProfileNotes: Boolean(state.profileNotes),
    modificationCount: currentSiteRecord.modifications.length,
    key: getSiteRecordKey()
  });

  refreshConversationPreview();
  editor?.focus?.();
}

function tokensToSelections(tokens) {
  const selections = [];

  for (const [, stored] of tokens) {
    if (stored.type !== "pick") continue;
    if (stored.selection) {
      selections.push(stored.selection);
      continue;
    }
    if (stored.element) {
      selectionCounter += 1;
      selections.push(
        window.PersoDomContext.buildSelection(stored.element, `sel_${selectionCounter}`)
      );
    }
  }

  return selections;
}

async function resolveUploadedAsset(tokens) {
  for (const [, stored] of tokens) {
    if (stored.type !== "image" || !stored.file) continue;

    return {
      assetId: "uploadedImage",
      name: stored.label || stored.file.name,
      type: stored.file.type,
      size: stored.file.size,
      dataUrl: await readFileAsDataUrl(stored.file)
    };
  }

  return null;
}

async function resolveRemoteImageAsset(prompt) {
  const url = extractFirstImageUrl(prompt);
  if (!url) return null;

  const response = await extensionApi.runtime.sendMessage({
    type: "PERSO_FETCH_IMAGE_ASSET",
    url
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not download the image.");
  }

  return {
    assetId: "remoteImage",
    name: response.name || new URL(url).pathname.split("/").filter(Boolean).pop() || "remote-image",
    type: response.type,
    size: response.size,
    dataUrl: response.dataUrl,
    sourceUrl: url
  };
}

function summariesFromUploaded(uploaded) {
  if (!uploaded) return [];
  return [{
    assetId: uploaded.assetId,
    name: uploaded.name,
    type: uploaded.type,
    size: uploaded.size,
    useAs: "backgroundImage"
  }];
}

function attachAssetsToPlan(plan, uploaded) {
  if (!uploaded) return plan;
  return {
    ...plan,
    assets: {
      ...(plan.assets || {}),
      [uploaded.assetId]: {
        type: uploaded.type,
        name: uploaded.name,
        dataUrl: uploaded.dataUrl
      }
    }
  };
}

async function generateAndApplyPlan({ prompt, tokens }) {
  const selections = tokensToSelections(tokens);
  const uploadedAsset = await resolveUploadedAsset(tokens);
  const remoteAsset = uploadedAsset ? null : await resolveRemoteImageAsset(prompt);
  const selectedAsset = uploadedAsset || remoteAsset;

  if (!prompt) throw new Error("Type what you want to change first.");
  if (hasLocalPath(prompt) && !selectedAsset) {
    throw new Error("Attach the image file instead of typing its local path.");
  }

  const pageContext = buildPageContext();
  const pageDom = window.PersoDomContext.collectPageDom();

  log.info("generation.started", {
    promptLength: prompt.length,
    pageContext,
    selectionCount: selections.length,
    pageNodeCount: pageDom.nodeCount
  });

  const summaries = summariesFromUploaded(selectedAsset);

  let plans = await generatePlansForRequest({
    prompt,
    pageContext,
    pageDom,
    selections,
    availableAssets: summaries,
    selectedAsset
  });

  log.info("generation.received", {
    planCount: plans.length,
    ruleCount: plans.reduce((count, plan) => count + (plan.rules?.length || 0), 0),
    targetRefs: plans.flatMap((plan) => Object.keys(plan.targetMap || {}))
  });

  plans = await validateAndRepairPlans({
    plans,
    prompt,
    pageContext,
    pageDom,
    selections,
    summaries,
    selectedAsset
  });

  log.info("generation.validation.passed", { planCount: plans.length });

  const modifications = plans.map((plan) => buildModification({
    prompt: plan.sourcePrompt || prompt,
    plan,
    title: plan.title
  }));
  currentSiteRecord = normalizeSiteRecord(currentSiteRecord);
  currentSiteRecord.modifications.push(...modifications);
  currentSiteRecord.conversations.push({
    id: createId("msg"),
    role: "user",
    text: prompt,
    createdAt: new Date().toISOString(),
    modificationIds: modifications.map((modification) => modification.id)
  });
  currentSiteRecord.conversations.push(...modifications.map((modification) => ({
    id: createId("msg"),
    role: "assistant",
    text: `Created modification: ${modification.title}`,
    createdAt: new Date().toISOString(),
    modificationId: modification.id
  })));
  currentSiteRecord.lastUpdatedAt = new Date().toISOString();
  currentPlan = composeEnabledPlan(currentSiteRecord);
  zeroMatchRetryCount = 0;
  await extensionApi.storage.local.set({
    profileNotes: prompt,
    [getSiteRecordKey()]: currentSiteRecord
  });
  log.info("storage.saved", { key: getSiteRecordKey(), hasProfileNotes: Boolean(prompt), modificationCount: currentSiteRecord.modifications.length });
  refreshConversationPreview();
  applyCurrentPlan();
  log.info("panel.task.finished", { message: "Plan generated.", modificationCount: modifications.length });
}

async function generatePlansForRequest(options) {
  if (typeof window.PersoAiClient.generateModificationPlans === "function") {
    const plans = await window.PersoAiClient.generateModificationPlans(options);
    if (plans.length) return plans.map((plan) => attachAssetsToPlan(plan, options.selectedAsset));
  }

  const plan = await window.PersoAiClient.generateTransformPlan(options);
  return [attachAssetsToPlan(plan, options.selectedAsset)];
}

async function validateAndRepairPlans({
  plans,
  prompt,
  pageContext,
  pageDom,
  selections,
  summaries,
  selectedAsset
}) {
  const repaired = [];

  for (const plan of plans) {
    const originalTitle = plan.title;
    let nextPlan = attachAssetsToPlan(plan, selectedAsset);
    let validation = window.PersoAiClient.validateTransformPlan(nextPlan);
    if (!validation.ok) {
      log.warn("generation.validation.failed", { title: nextPlan.title, errors: validation.errors });
      log.info("generation.repair.started", { title: nextPlan.title });

      nextPlan = await window.PersoAiClient.generateTransformPlan({
        prompt: nextPlan.sourcePrompt || prompt,
        pageContext,
        pageDom,
        selections,
        availableAssets: summaries,
        previousPlan: nextPlan,
        validationErrors: validation.errors
      });
      nextPlan = attachAssetsToPlan(nextPlan, selectedAsset);
      nextPlan.title = nextPlan.title || originalTitle;

      validation = window.PersoAiClient.validateTransformPlan(nextPlan);
      if (!validation.ok) {
        log.warn("generation.repair.failed", { title: nextPlan.title, errors: validation.errors });
        throw new Error(`Generated plan failed validation: ${validation.errors.join(" ")}`);
      }

      log.info("generation.repair.passed", {
        title: nextPlan.title,
        ruleCount: nextPlan.rules?.length || 0,
        targetRefs: Object.keys(nextPlan.targetMap || {})
      });
    }

    repaired.push(nextPlan);
  }

  if (!repaired.length) {
    throw new Error("The AI did not return any modification plans.");
  }

  return repaired;
}

async function revertAppliedPlan() {
  clearTimeout(applyTimer);
  if (currentSiteRecord) {
    currentSiteRecord.modifications = currentSiteRecord.modifications.map((modification) => ({
      ...modification,
      enabled: false,
      updatedAt: new Date().toISOString()
    }));
    currentSiteRecord.lastUpdatedAt = new Date().toISOString();
    await saveSiteRecord(currentSiteRecord);
  }
  currentPlan = composeEnabledPlan(currentSiteRecord);
  zeroMatchRetryCount = 0;
  suppressMutationApplyUntil = Date.now() + 1200;
  window.PersoExecutor.revertPlan();
  refreshConversationPreview();
  log.info("plan.reverted", { key: getSiteRecordKey() });
}

function buildPageContext() {
  return {
    url: location.href,
    hostname: location.hostname,
    pathname: location.pathname,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
}

function getSiteKey() {
  return `${location.hostname}:${location.pathname}`;
}

function getSiteRecordKey() {
  return `${SITE_RECORD_PREFIX}${getSiteKey()}`;
}

function getLegacyPlanStorageKey() {
  return `${LEGACY_PLAN_PREFIX}${location.hostname}:${location.pathname}`;
}

async function loadSavedPlan() {
  const state = await extensionApi.storage.local.get([getSiteRecordKey(), getLegacyPlanStorageKey()]);
  let record = normalizeSiteRecord(state[getSiteRecordKey()]);

  if (!state[getSiteRecordKey()] && state[getLegacyPlanStorageKey()]) {
    record = migrateLegacyPlan(state[getLegacyPlanStorageKey()]);
    await saveSiteRecord(record);
    await extensionApi.storage.local.remove([getLegacyPlanStorageKey()]);
  }

  currentSiteRecord = record;
  currentPlan = composeEnabledPlan(currentSiteRecord);
  log.info("storage.loaded", { key: getSiteRecordKey(), modificationCount: record.modifications.length });
  refreshConversationPreview();
  if (currentPlan) {
    applyCurrentPlan();
  }
}

function normalizeSiteRecord(record) {
  if (record && typeof record === "object" && Array.isArray(record.modifications)) {
    return {
      version: 1,
      site: record.site || buildPageContext(),
      conversations: Array.isArray(record.conversations) ? record.conversations : [],
      modifications: record.modifications.map(normalizeModification).filter(Boolean),
      createdAt: record.createdAt || new Date().toISOString(),
      lastUpdatedAt: record.lastUpdatedAt || record.updatedAt || new Date().toISOString()
    };
  }

  return {
    version: 1,
    site: buildPageContext(),
    conversations: [],
    modifications: [],
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString()
  };
}

function normalizeModification(modification) {
  if (!modification?.plan) return null;
  return {
    id: modification.id || createId("mod"),
    title: modification.title || titleFromPrompt(modification.sourcePrompt || modification.plan.sourcePrompt || "Modification"),
    enabled: modification.enabled !== false,
    sourcePrompt: modification.sourcePrompt || modification.plan.sourcePrompt || "",
    plan: modification.plan,
    status: modification.status || "unknown",
    createdAt: modification.createdAt || new Date().toISOString(),
    updatedAt: modification.updatedAt || modification.createdAt || new Date().toISOString()
  };
}

function migrateLegacyPlan(plan) {
  const record = normalizeSiteRecord(null);
  record.modifications.push(buildModification({
    prompt: plan.sourcePrompt || "Legacy modification",
    plan,
    title: "Imported modification"
  }));
  record.conversations.push({
    id: createId("msg"),
    role: "assistant",
    text: "Imported the previous one-shot plan as a managed modification.",
    createdAt: new Date().toISOString(),
    modificationId: record.modifications[0].id
  });
  return record;
}

function buildModification({ prompt, plan, title }) {
  const now = new Date().toISOString();
  return {
    id: createId("mod"),
    title: title || plan.title || titleFromPrompt(prompt),
    enabled: true,
    sourcePrompt: prompt,
    plan,
    status: "unknown",
    createdAt: now,
    updatedAt: now
  };
}

function composeEnabledPlan(record) {
  const enabled = normalizeSiteRecord(record).modifications.filter((modification) => modification.enabled);
  if (!enabled.length) return null;

  const composed = {
    version: "2.1",
    site: buildPageContext(),
    sourcePrompt: enabled.map((modification) => modification.sourcePrompt).filter(Boolean).join("\n"),
    selections: [],
    targetMap: {},
    rules: [],
    assets: {}
  };

  enabled.forEach((modification, index) => {
    const prefix = `m${index}_${modification.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const targetRefs = new Map();
    Object.entries(modification.plan.targetMap || {}).forEach(([key, target]) => {
      const ref = `${prefix}_${key}`;
      targetRefs.set(key, ref);
      composed.targetMap[ref] = target;
    });
    Object.entries(modification.plan.assets || {}).forEach(([key, asset]) => {
      composed.assets[`${prefix}_${key}`] = asset;
    });
    composed.rules.push(...(modification.plan.rules || []).map((rule, ruleIndex) => {
      const nextRule = {
        ...rule,
        id: `${prefix}_${rule.id || `rule_${ruleIndex}`}`,
        targetRef: rule.targetRef ? targetRefs.get(rule.targetRef) || rule.targetRef : rule.targetRef
      };
      if (rule.sourceActionTargetRef) {
        nextRule.sourceActionTargetRef = targetRefs.get(rule.sourceActionTargetRef) || rule.sourceActionTargetRef;
      }
      if (rule.placementTargetRef) {
        nextRule.placementTargetRef = targetRefs.get(rule.placementTargetRef) || rule.placementTargetRef;
      }
      if (rule.sourceTargetRef) {
        nextRule.sourceTargetRef = targetRefs.get(rule.sourceTargetRef) || rule.sourceTargetRef;
      }
      if (rule.otherTargetRef) {
        nextRule.otherTargetRef = targetRefs.get(rule.otherTargetRef) || rule.otherTargetRef;
      }
      if (rule.menuTargetRef) {
        nextRule.menuTargetRef = targetRefs.get(rule.menuTargetRef) || rule.menuTargetRef;
      }
      if (nextRule.styles?.backgroundImage?.startsWith?.("asset:")) {
        const assetId = nextRule.styles.backgroundImage.slice("asset:".length);
        nextRule.styles = {
          ...nextRule.styles,
          backgroundImage: `asset:${prefix}_${assetId}`
        };
      }
      if (nextRule.element) {
        nextRule.element = remapElementAssetRefs(nextRule.element, prefix);
      }
      return nextRule;
    }));
  });

  return composed;
}

function remapElementAssetRefs(element, prefix) {
  if (!element || typeof element !== "object" || Array.isArray(element)) return element;

  const next = { ...element };
  if (next.styles?.backgroundImage?.startsWith?.("asset:")) {
    const assetId = next.styles.backgroundImage.slice("asset:".length);
    next.styles = {
      ...next.styles,
      backgroundImage: `asset:${prefix}_${assetId}`
    };
  }

  if (next.attributes?.src?.startsWith?.("asset:")) {
    const assetId = next.attributes.src.slice("asset:".length);
    next.attributes = {
      ...next.attributes,
      src: `asset:${prefix}_${assetId}`
    };
  }

  if (Array.isArray(next.children)) {
    next.children = next.children.map((child) => remapElementAssetRefs(child, prefix));
  }

  return next;
}

async function saveSiteRecord(record) {
  currentSiteRecord = normalizeSiteRecord(record);
  await extensionApi.storage.local.set({ [getSiteRecordKey()]: currentSiteRecord });
}

async function setModificationEnabled(id, enabled) {
  currentSiteRecord = normalizeSiteRecord(currentSiteRecord);
  currentSiteRecord.modifications = currentSiteRecord.modifications.map((modification) => (
    modification.id === id
      ? { ...modification, enabled, updatedAt: new Date().toISOString() }
      : modification
  ));
  currentSiteRecord.lastUpdatedAt = new Date().toISOString();
  await saveSiteRecord(currentSiteRecord);
  currentPlan = composeEnabledPlan(currentSiteRecord);
  refreshConversationPreview();
  suppressMutationApplyUntil = Date.now() + 1200;
  window.PersoExecutor.revertPlan();
  applyCurrentPlan();
}

async function deleteModification(id) {
  currentSiteRecord = normalizeSiteRecord(currentSiteRecord);
  currentSiteRecord.modifications = currentSiteRecord.modifications.filter((modification) => modification.id !== id);
  currentSiteRecord.lastUpdatedAt = new Date().toISOString();
  await saveSiteRecord(currentSiteRecord);
  currentPlan = composeEnabledPlan(currentSiteRecord);
  refreshConversationPreview();
  suppressMutationApplyUntil = Date.now() + 1200;
  window.PersoExecutor.revertPlan();
  applyCurrentPlan();
}

async function renameModification(id, title) {
  const nextTitle = String(title || "").trim();
  if (!nextTitle) return false;

  currentSiteRecord = normalizeSiteRecord(currentSiteRecord);
  const exists = currentSiteRecord.modifications.some((modification) => modification.id === id);
  if (!exists) return false;

  currentSiteRecord.modifications = currentSiteRecord.modifications.map((modification) => (
    modification.id === id
      ? { ...modification, title: nextTitle, updatedAt: new Date().toISOString() }
      : modification
  ));
  currentSiteRecord.lastUpdatedAt = new Date().toISOString();
  await saveSiteRecord(currentSiteRecord);
  renderModificationPreview(getFocusedModification());
  return true;
}

function getFocusedModification() {
  if (!focusedModId || !currentSiteRecord) return null;
  return currentSiteRecord.modifications.find((modification) => modification.id === focusedModId) || null;
}

async function openModificationPreview({ modId, recordKey }) {
  if (!modId) throw new Error("Missing modification id.");

  const key = recordKey || getSiteRecordKey();
  const state = await extensionApi.storage.local.get([key]);
  const record = normalizeSiteRecord(state[key]);
  const modification = record.modifications.find((entry) => entry.id === modId);
  if (!modification) throw new Error("Modification not found on this page.");

  currentSiteRecord = record;
  currentPlan = composeEnabledPlan(currentSiteRecord);
  applyCurrentPlan();

  focusedModId = modId;
  setPanelMode("mod-focus");
  renderModificationPreview(modification);
  highlightModificationTargets(modification);
  openPanel();
  log.info("mod.preview.opened", { modId });
  return { ok: true };
}

function exitModificationPreview() {
  if (!focusedModId) return;
  focusedModId = null;
  clearModificationHighlights();
  setPanelMode("chat");
}

function setPanelMode(mode) {
  if (!panel) return;
  const chatStack = panel.querySelector("#preview-stack");
  const focusStack = panel.querySelector("#mod-focus-stack");
  const isFocus = mode === "mod-focus";
  if (chatStack) chatStack.hidden = isFocus;
  if (focusStack) focusStack.hidden = !isFocus;
  panel.dataset.mode = mode;
}

function renderModificationPreview(modification) {
  if (!panel || !modification) return;

  const titleEl = panel.querySelector("#mod-focus-title");
  const inputEl = panel.querySelector("#mod-focus-title-input");
  const toggleBtn = panel.querySelector("#mod-focus-toggle");
  const enabled = modification.enabled !== false;

  if (titleEl) titleEl.textContent = modification.title || "Modification";
  if (inputEl) {
    inputEl.value = modification.title || "Modification";
    inputEl.hidden = true;
  }
  if (titleEl) titleEl.hidden = false;
  if (toggleBtn) toggleBtn.textContent = enabled ? "Disable" : "Enable";
}

function attachModFocusInteractions() {
  const editBtn = panel?.querySelector("#mod-focus-edit");
  const titleEl = panel?.querySelector("#mod-focus-title");
  const inputEl = panel?.querySelector("#mod-focus-title-input");
  const toggleBtn = panel?.querySelector("#mod-focus-toggle");
  const deleteBtn = panel?.querySelector("#mod-focus-delete");

  editBtn?.addEventListener("click", () => {
    if (!inputEl || !titleEl) return;
    titleEl.hidden = true;
    inputEl.hidden = false;
    inputEl.focus();
    inputEl.select();
  });

  inputEl?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await commitModificationRename();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelModificationRename();
    }
  });

  inputEl?.addEventListener("blur", () => {
    commitModificationRename();
  });

  toggleBtn?.addEventListener("click", async () => {
    if (!focusedModId) return;
    const modification = getFocusedModification();
    if (!modification) return;
    await setModificationEnabled(focusedModId, modification.enabled === false);
    renderModificationPreview(getFocusedModification());
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!focusedModId) return;
    const id = focusedModId;
    exitModificationPreview();
    await deleteModification(id);
    closePanel();
  });
}

async function commitModificationRename() {
  const inputEl = panel?.querySelector("#mod-focus-title-input");
  const titleEl = panel?.querySelector("#mod-focus-title");
  if (!inputEl || !titleEl || !focusedModId || inputEl.hidden) return;

  const saved = await renameModification(focusedModId, inputEl.value);
  inputEl.hidden = true;
  titleEl.hidden = false;
  if (!saved) {
    titleEl.textContent = getFocusedModification()?.title || "Modification";
  }
}

function cancelModificationRename() {
  const inputEl = panel?.querySelector("#mod-focus-title-input");
  const titleEl = panel?.querySelector("#mod-focus-title");
  if (!inputEl || !titleEl) return;
  inputEl.value = getFocusedModification()?.title || "Modification";
  inputEl.hidden = true;
  titleEl.hidden = false;
}

function highlightModificationTargets(modification) {
  clearModificationHighlights();
  const elements = collectModificationTargetElements(modification);
  if (!elements.length) return;

  const overlay = document.createElement("div");
  overlay.id = "perso-xxl-mod-preview-overlay";
  overlay.setAttribute("data-perso-xxl-ui", "true");

  elements.forEach((element) => {
    const box = document.createElement("div");
    box.className = "perso-xxl-mod-preview-highlight";
    box.dataset.persoPreviewTarget = "true";
    positionPreviewHighlight(box, element);
    overlay.appendChild(box);
  });

  document.documentElement.appendChild(overlay);
  modPreviewOverlay = overlay;
  window.addEventListener("scroll", refreshModificationHighlights, true);
  window.addEventListener("resize", refreshModificationHighlights);
}

function refreshModificationHighlights() {
  if (!modPreviewOverlay) return;
  const modification = getFocusedModification();
  if (!modification) return;

  const elements = collectModificationTargetElements(modification);
  modPreviewOverlay.replaceChildren();

  elements.forEach((element) => {
    const box = document.createElement("div");
    box.className = "perso-xxl-mod-preview-highlight";
    positionPreviewHighlight(box, element);
    modPreviewOverlay.appendChild(box);
  });
}

function positionPreviewHighlight(box, element) {
  const rect = element.getBoundingClientRect();
  box.style.top = `${rect.top}px`;
  box.style.left = `${rect.left}px`;
  box.style.width = `${Math.max(rect.width, 1)}px`;
  box.style.height = `${Math.max(rect.height, 1)}px`;
}

function collectModificationTargetElements(modification) {
  const plan = modification?.plan;
  if (!plan) return [];

  const elements = new Set();
  const targetRefs = new Set((plan.rules || []).map((rule) => rule.targetRef).filter(Boolean));

  Object.entries(plan.targetMap || {}).forEach(([key, target]) => {
    if (targetRefs.size && !targetRefs.has(key)) return;
    resolvePreviewSelectors(target).forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (!isPersoNode(element)) elements.add(element);
        });
      } catch (_error) {}
    });
  });

  return Array.from(elements);
}

function resolvePreviewSelectors(target) {
  const primary = (target?.selectors || []).filter(Boolean);
  if (primary.length) return primary;
  return (target?.fallbackSelectors || []).filter(Boolean);
}

function clearModificationHighlights() {
  window.removeEventListener("scroll", refreshModificationHighlights, true);
  window.removeEventListener("resize", refreshModificationHighlights);
  modPreviewOverlay?.remove();
  modPreviewOverlay = null;
}

function refreshConversationPreview() {
  if (!panel) return;
  const sentList = panel.querySelector("#sent-list");
  if (!sentList) return;
  const conversations = normalizeSiteRecord(currentSiteRecord).conversations.slice(-8);
  if (!conversations.length) return;

  sentList.innerHTML = conversations.map((message) => {
    const isAssistant = message.role === "assistant";
    const feedbackHtml = isAssistant ? `
      <div class="ai-sent-bubble__feedback">
        <button type="button" class="ai-sent-bubble__feedback-btn ai-sent-bubble__feedback-btn--like" aria-label="Thumbs up" data-feedback="like" data-message-id="${escapeAttr(message.id || "")}">
          <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
            <path d="M507.532,223.313c-9.891-24.594-35-41.125-62.469-41.125H365.86c-2.516,0-4.75-0.031-6.75-0.094
              c0.641-0.844,1.203-1.594,1.672-2.203c2.719-3.563,4.922-6.406,6.656-9.188c0.688-0.922,1.688-2.047,2.859-3.453
              c9.516-11.234,29.328-34.625,34.531-67.109c2.891-18.016-2.359-36.438-14.359-50.516c-11.156-13.094-26.906-20.891-42.109-20.891
              c-15.359,0-28.672,7.641-36.516,20.969c-1.156,1.938-2.531,4.406-4.125,7.266c-7.797,13.859-24,42.719-39.672,54.063
              c-17.969,12.984-33.875,30.5-49.25,47.453c-21.141,23.313-43.016,47.406-60.656,47.406c-13.797,0-24.969,11.203-24.969,24.984
              v170.516c0,13.797,11.172,24.984,24.969,24.984c18.359,0,59.766,15.938,89.984,27.594c23.156,8.922,43.172,16.609,56.703,19.328
              c3.984,0.797,8.094,1.719,12.313,2.641c15.484,3.438,33.063,7.328,50.531,7.328c27.766,0,49.234-10.031,63.797-29.828
              c14.203-19.266,30.422-69.313,51.813-137.938c1.453-4.703,2.906-9.328,4.297-13.797
              C520.017,267.188,512.501,235.641,507.532,223.313z M465.563,288.453c-17.031,54.172-39.719,130.516-54.219,150.188
              c-11.031,15-26.672,19.641-43.672,19.641c-19.141,0-40-5.875-57.938-9.484c-29.891-5.984-114.328-47.406-151.594-47.406V230.875
              c45.234,0,81.125-68.25,124.531-99.594c23.391-16.922,42.984-55.797,50.688-68.906c3.547-6.031,9.016-8.672,15-8.672
              c15.984,0,35.578,18.844,31.797,42.484c-5.203,32.484-29.891,54.594-33.797,61.078c-3.891,6.516-20.797,24.703-20.797,35.094
              c0,9.109,6.484,14.813,40.297,14.813c42.031,0,70.922,0,79.203,0C478.923,207.172,508.767,246.969,465.563,288.453z"/>
            <path d="M0.001,250.734v158.219c0,19.547,15.844,35.406,35.406,35.406h42.234c13.047,0,23.609-10.578,23.609-23.609
              V215.328H35.407C15.845,215.328,0.001,231.172,0.001,250.734z M49.798,374.125c8.969,0,16.25,7.266,16.25,16.25
              c0,8.969-7.281,16.25-16.25,16.25c-8.984,0-16.266-7.281-16.266-16.25C33.532,381.391,40.813,374.125,49.798,374.125z"/>
          </svg>
        </button>
        <button type="button" class="ai-sent-bubble__feedback-btn ai-sent-bubble__feedback-btn--dislike" aria-label="Thumbs down" data-feedback="dislike" data-message-id="${escapeAttr(message.id || "")}">
          <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" style="transform: scaleY(-1);">
            <path d="M507.532,223.313c-9.891-24.594-35-41.125-62.469-41.125H365.86c-2.516,0-4.75-0.031-6.75-0.094
              c0.641-0.844,1.203-1.594,1.672-2.203c2.719-3.563,4.922-6.406,6.656-9.188c0.688-0.922,1.688-2.047,2.859-3.453
              c9.516-11.234,29.328-34.625,34.531-67.109c2.891-18.016-2.359-36.438-14.359-50.516c-11.156-13.094-26.906-20.891-42.109-20.891
              c-15.359,0-28.672,7.641-36.516,20.969c-1.156,1.938-2.531,4.406-4.125,7.266c-7.797,13.859-24,42.719-39.672,54.063
              c-17.969,12.984-33.875,30.5-49.25,47.453c-21.141,23.313-43.016,47.406-60.656,47.406c-13.797,0-24.969,11.203-24.969,24.984
              v170.516c0,13.797,11.172,24.984,24.969,24.984c18.359,0,59.766,15.938,89.984,27.594c23.156,8.922,43.172,16.609,56.703,19.328
              c3.984,0.797,8.094,1.719,12.313,2.641c15.484,3.438,33.063,7.328,50.531,7.328c27.766,0,49.234-10.031,63.797-29.828
              c14.203-19.266,30.422-69.313,51.813-137.938c1.453-4.703,2.906-9.328,4.297-13.797
              C520.017,267.188,512.501,235.641,507.532,223.313z M465.563,288.453c-17.031,54.172-39.719,130.516-54.219,150.188
              c-11.031,15-26.672,19.641-43.672,19.641c-19.141,0-40-5.875-57.938-9.484c-29.891-5.984-114.328-47.406-151.594-47.406V230.875
              c45.234,0,81.125-68.25,124.531-99.594c23.391-16.922,42.984-55.797,50.688-68.906c3.547-6.031,9.016-8.672,15-8.672
              c15.984,0,35.578,18.844,31.797,42.484c-5.203,32.484-29.891,54.594-33.797,61.078c-3.891,6.516-20.797,24.703-20.797,35.094
              c0,9.109,6.484,14.813,40.297,14.813c42.031,0,70.922,0,79.203,0C478.923,207.172,508.767,246.969,465.563,288.453z"/>
            <path d="M0.001,250.734v158.219c0,19.547,15.844,35.406,35.406,35.406h42.234c13.047,0,23.609-10.578,23.609-23.609
              V215.328H35.407C15.845,215.328,0.001,231.172,0.001,250.734z M49.798,374.125c8.969,0,16.25,7.266,16.25,16.25
              c0,8.969-7.281,16.25-16.25,16.25c-8.984,0-16.266-7.281-16.266-16.25C33.532,381.391,40.813,374.125,49.798,374.125z"/>
          </svg>
        </button>
      </div>
    ` : '';
    return `
    <div class="ai-sent-bubble perso-xxl-chat-bubble perso-xxl-chat-bubble--${isAssistant ? "assistant" : "user"}">
      ${escapeHtml(message.text)}
      ${feedbackHtml}
    </div>
  `;
  }).join("");

  sentList.querySelectorAll("[data-feedback]").forEach((button) => {
    button.addEventListener("click", handleFeedbackClick);
  });
}

async function handleFeedbackClick(event) {
  const button = event.currentTarget;
  const feedback = button.dataset.feedback;
  const messageId = button.dataset.messageId;
  const feedbackBar = button.closest(".ai-sent-bubble__feedback");

  feedbackBar?.querySelectorAll(".ai-sent-bubble__feedback-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn === button);
  });

  try {
    await sendFeedback({ feedback, messageId });
    window.PersoAiBar?.toast?.("Feedback saved");
  } catch (error) {
    log.warn("feedback.save.failed", { error: error.message || String(error), feedback, messageId });
    window.PersoAiBar?.toast?.("Feedback saved locally");
  }

  if (feedback === "dislike") {
    await disableModificationForFeedback(messageId);
  }
}

async function sendFeedback({ feedback, messageId }) {
  const record = normalizeSiteRecord(currentSiteRecord);
  const message = messageId
    ? record.conversations.find((item) => item.id === messageId)
    : [...record.conversations].reverse().find((item) => item.role === "assistant");
  if (!message || message.role !== "assistant") throw new Error("Assistant message not found.");

  const messageIndex = record.conversations.findIndex((item) => item.id === messageId);
  const promptMessage = [...record.conversations.slice(0, messageIndex)].reverse()
    .find((item) => item.role === "user" && (
      item.modificationId === message.modificationId ||
      item.modificationIds?.includes?.(message.modificationId)
    )) || [...record.conversations.slice(0, messageIndex)].reverse()
    .find((item) => item.role === "user");
  const installId = await getInstallId();
  const manifest = extensionApi.runtime?.getManifest?.();
  const modification = record.modifications.find((item) => item.id === message.modificationId);

  const response = await fetch(FEEDBACK_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      feedback,
      messageId: message.id,
      conversationId: getSiteRecordKey(),
      modificationId: message.modificationId || null,
      promptText: promptMessage?.text || "",
      assistantText: message.text || "",
      siteUrl: record.site?.url || location.href,
      siteTitle: record.site?.title || document.title,
      pageHostname: record.site?.hostname || location.hostname,
      pagePathname: record.site?.pathname || location.pathname,
      installId,
      extensionVersion: manifest?.version || CONTENT_VERSION,
      metadata: {
        source: "extension-panel",
        contentVersion: CONTENT_VERSION,
        messageCreatedAt: message.createdAt || null,
        promptCreatedAt: promptMessage?.createdAt || null,
        modification: summarizeModificationForFeedback(modification),
        plan: summarizePlanForFeedback(modification?.plan),
        applyResult: lastApplyResult,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      }
    })
  });

  if (!response.ok) throw new Error(`Feedback server returned ${response.status}`);
  log.info("feedback.saved", { feedback, messageId });
}

async function disableModificationForFeedback(messageId) {
  const record = normalizeSiteRecord(currentSiteRecord);
  const message = messageId
    ? record.conversations.find((item) => item.id === messageId)
    : [...record.conversations].reverse().find((item) => item.role === "assistant");
  const modificationId = message?.role === "assistant" ? message.modificationId : null;
  if (!modificationId) return;

  const modification = record.modifications.find((item) => item.id === modificationId);
  if (!modification || modification.enabled === false) return;

  try {
    await setModificationEnabled(modificationId, false);
    if (focusedModId === modificationId) {
      renderModificationPreview(getFocusedModification());
    }
    window.PersoAiBar?.toast?.("Modification disabled");
    log.info("feedback.dislike.disabled_modification", { messageId, modificationId });
  } catch (error) {
    log.warn("feedback.dislike.disable_failed", {
      error: error.message || String(error),
      messageId,
      modificationId
    });
  }
}

function summarizeModificationForFeedback(modification) {
  if (!modification) return null;
  return {
    id: modification.id,
    title: modification.title,
    enabled: modification.enabled,
    status: modification.status,
    createdAt: modification.createdAt,
    updatedAt: modification.updatedAt
  };
}

function summarizePlanForFeedback(plan) {
  if (!plan) return null;
  const rules = Array.isArray(plan.rules) ? plan.rules : [];
  return {
    version: plan.version || null,
    site: plan.site || null,
    ruleCount: rules.length,
    targetRefs: Object.keys(plan.targetMap || {}),
    assetIds: Object.keys(plan.assets || {}),
    rules: rules.map((rule) => ({
      id: rule?.id || null,
      type: rule?.type || null,
      targetRef: rule?.targetRef || null,
      action: rule?.action || null,
      capability: rule?.capability || null
    }))
  };
}

async function getInstallId() {
  const state = await extensionApi.storage.local.get([INSTALL_ID_KEY]);
  if (state[INSTALL_ID_KEY]) return state[INSTALL_ID_KEY];
  const installId = createId("install");
  await extensionApi.storage.local.set({ [INSTALL_ID_KEY]: installId });
  return installId;
}

function titleFromPrompt(prompt) {
  const text = String(prompt || "Modification").replace(/\[[^\]]+\]/g, "").trim();
  return text.length > 56 ? `${text.slice(0, 53)}...` : text || "Modification";
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractFirstImageUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s)'"<>]+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0]);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function hasLocalPath(value) {
  return /(^|\s)(\/home\/|\/Users\/|[A-Za-z]:\\)/.test(value);
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

extensionApi.storage.onChanged?.addListener((changes, area) => {
  if (area !== "local" || !changes[getSiteRecordKey()]) return;
  currentSiteRecord = normalizeSiteRecord(changes[getSiteRecordKey()].newValue);
  currentPlan = composeEnabledPlan(currentSiteRecord);
  refreshConversationPreview();
  if (focusedModId) {
    const modification = getFocusedModification();
    if (modification) {
      renderModificationPreview(modification);
      highlightModificationTargets(modification);
    } else {
      exitModificationPreview();
      setPanelMode("chat");
    }
  }
  suppressMutationApplyUntil = Date.now() + 1200;
  window.PersoExecutor.revertPlan();
  applyCurrentPlan();
});

initExtensionHost();
panel = createPanel();
document.documentElement.appendChild(panel);
attachPanelInteractions();
attachModFocusInteractions();
log.info("panel.created");
loadPanelState();
