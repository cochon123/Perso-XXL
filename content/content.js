const log = window.PersoLogger;
const CONTENT_VERSION = "0.6.0-landing-ai-input";
let currentPlan = null;
let applyTimer = null;
/** @type {HTMLElement | null} */
let panel = null;
let suppressMutationApplyUntil = 0;
let zeroMatchRetryCount = 0;
let selectionCounter = 0;

log.info("content.loaded", {
  version: CONTENT_VERSION,
  hasSavedPlan: false
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  return false;
});

chrome.storage.local.get([getPlanStorageKey()], (state) => {
  const savedPlan = state[getPlanStorageKey()];
  log.info("storage.loaded", { key: getPlanStorageKey(), hasSavedPlan: Boolean(savedPlan) });
  if (savedPlan) {
    currentPlan = savedPlan;
    applyCurrentPlan();
  }
});

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
  panel.hidden = false;
  log.info("panel.visibility.changed", { hidden: false });
  loadPanelState();
}

function closePanel() {
  if (!panel || panel.hidden) return;
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
    <div class="toast productivity-toast" id="toast" role="status" aria-live="polite"></div>
  `;
}

function createPanel() {
  const root = document.createElement("section");
  root.id = "perso-xxl-panel";
  root.hidden = true;
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
    }
  };
}

async function loadPanelState() {
  const state = await chrome.storage.local.get(["profileNotes", getPlanStorageKey()]);
  const savedPlan = state[getPlanStorageKey()];
  const editor = panel?.querySelector("#prompt-editor");

  if (editor && state.profileNotes && !editor.textContent.trim()) {
    editor.textContent = state.profileNotes;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  log.info("panel.state.loaded", {
    hasProfileNotes: Boolean(state.profileNotes),
    hasSavedPlan: Boolean(savedPlan),
    key: getPlanStorageKey()
  });

  editor?.focus?.();
}

function tokensToSelections(tokens) {
  const selections = [];

  for (const [, stored] of tokens) {
    if (stored.type !== "pick" || !stored.element) continue;
    selectionCounter += 1;
    selections.push(
      window.PersoDomContext.buildSelection(stored.element, `sel_${selectionCounter}`)
    );
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

  if (!prompt) throw new Error("Type what you want to change first.");
  if (hasLocalPath(prompt) && !uploadedAsset) {
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

  const summaries = summariesFromUploaded(uploadedAsset);

  let plan = await window.PersoAiClient.generateTransformPlan({
    prompt,
    pageContext,
    pageDom,
    selections,
    availableAssets: summaries
  });
  plan = attachAssetsToPlan(plan, uploadedAsset);

  log.info("generation.received", {
    site: plan.site,
    ruleCount: plan.rules?.length || 0,
    targetRefs: Object.keys(plan.targetMap || {})
  });

  let validation = window.PersoAiClient.validateTransformPlan(plan);
  if (!validation.ok) {
    log.warn("generation.validation.failed", { errors: validation.errors });
    log.info("generation.repair.started");

    plan = await window.PersoAiClient.generateTransformPlan({
      prompt,
      pageContext,
      pageDom,
      selections,
      availableAssets: summaries,
      previousPlan: plan,
      validationErrors: validation.errors
    });
    plan = attachAssetsToPlan(plan, uploadedAsset);

    validation = window.PersoAiClient.validateTransformPlan(plan);
    if (!validation.ok) {
      log.warn("generation.repair.failed", { errors: validation.errors });
      throw new Error(`Generated plan failed validation: ${validation.errors.join(" ")}`);
    }

    log.info("generation.repair.passed", {
      ruleCount: plan.rules?.length || 0,
      targetRefs: Object.keys(plan.targetMap || {})
    });
  }

  log.info("generation.validation.passed");

  currentPlan = plan;
  zeroMatchRetryCount = 0;
  await chrome.storage.local.set({
    profileNotes: prompt,
    [getPlanStorageKey()]: plan
  });
  log.info("storage.saved", { key: getPlanStorageKey(), hasProfileNotes: Boolean(prompt), ruleCount: plan.rules?.length || 0 });
  applyCurrentPlan();
  log.info("panel.task.finished", { message: "Plan generated." });
}

async function revertAppliedPlan() {
  clearTimeout(applyTimer);
  currentPlan = null;
  zeroMatchRetryCount = 0;
  suppressMutationApplyUntil = Date.now() + 1200;
  window.PersoExecutor.revertPlan();
  await chrome.storage.local.remove([getPlanStorageKey()]);
  log.info("plan.reverted", { key: getPlanStorageKey() });
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

function getPlanStorageKey() {
  return `sitePlan:${location.hostname}:${location.pathname}`;
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

initExtensionHost();
panel = createPanel();
document.documentElement.appendChild(panel);
attachPanelInteractions();
log.info("panel.created");
loadPanelState();
