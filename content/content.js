const log = window.PersoLogger;
const CONTENT_VERSION = "0.4.0-ai-input";
let currentPlan = null;
let applyTimer = null;
let panel = null;
let aiInput = null;
let suppressMutationApplyUntil = 0;
let zeroMatchRetryCount = 0;
let uploadedAsset = null;
let selectedElements = [];
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
  if (!panel) {
    panel = createPanel();
    document.documentElement.appendChild(panel);
    log.info("panel.created");
    loadPanelState();
    return;
  }

  panel.hidden = !panel.hidden;
  log.info("panel.visibility.changed", { hidden: panel.hidden });
}

function createPanel() {
  const root = document.createElement("section");
  root.id = "perso-xxl-panel";
  root.innerHTML = `
    <header>
      <strong>Perso XXL</strong>
      <button type="button" data-action="close" aria-label="Close">×</button>
    </header>
    <div class="perso-xxl-ai-stack">${window.PersoAiInput.MARKUP}</div>
    <div class="perso-xxl-actions">
      <button type="button" data-action="apply" class="secondary">Apply saved</button>
      <button type="button" data-action="revert" class="danger">Revert</button>
    </div>
    <p data-role="status">Ready</p>
    <details>
      <summary>Current plan</summary>
      <pre data-role="plan"></pre>
    </details>
  `;

  root.addEventListener("click", handlePanelClick);

  const stack = root.querySelector(".perso-xxl-ai-stack");
  aiInput = window.PersoAiInput.init(stack, {
    onSend: handleAiSend,
    onPick: handleAiPick,
    onImage: handleAiImage,
    onRemoveToken: handleAiRemoveToken
  });

  return root;
}

async function loadPanelState() {
  const state = await chrome.storage.local.get(["profileNotes", getPlanStorageKey()]);
  const savedPlan = state[getPlanStorageKey()];

  if (state.profileNotes) aiInput.setPromptText(state.profileNotes);
  if (savedPlan) renderPlan(savedPlan);
  log.info("panel.state.loaded", {
    hasProfileNotes: Boolean(state.profileNotes),
    hasSavedPlan: Boolean(savedPlan),
    key: getPlanStorageKey()
  });
  aiInput.focus();
}

async function handlePanelClick(event) {
  const action = event.target?.dataset?.action;
  if (!action) return;

  if (action === "close") {
    panel.hidden = true;
    log.info("panel.closed");
    return;
  }

  if (action === "apply") {
    await applySavedPlan();
    return;
  }

  if (action === "revert") {
    await revertChanges();
  }
}

async function handleAiSend(prompt) {
  if (!prompt) throw new Error("Type what you want to change first.");
  if (hasLocalPath(prompt) && !uploadedAsset) {
    throw new Error("Attach the image file instead of typing its local path.");
  }

  try {
    await generatePlanFromPrompt(prompt);
    selectedElements = [];
    uploadedAsset = null;
    setPanelStatus("Plan generated and applied.");
  } catch (error) {
    setPanelStatus(error.message || String(error));
    log.error("panel.task.failed", { error });
    throw error;
  }
}

async function handleAiPick() {
  if (!panel || window.PersoPicker.isActive()) return null;

  panel.hidden = true;
  log.info("picker.requested");

  try {
    const element = await window.PersoPicker.pickElement();
    selectionCounter += 1;
    const selection = window.PersoDomContext.buildSelection(element, `sel_${selectionCounter}`);
    selectedElements.push(selection);
    log.info("selection.added", { selectionId: selection.id, count: selectedElements.length });
    return {
      type: "pick",
      label: formatSelectionLabel(selection),
      selectionId: selection.id
    };
  } catch (error) {
    if (error.message !== "Selection cancelled.") {
      log.warn("picker.failed", { error });
    }
    throw error;
  } finally {
    panel.hidden = false;
    aiInput?.focus();
  }
}

async function handleAiImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported");
  }

  uploadedAsset = {
    assetId: "uploadedImage",
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl: await readFileAsDataUrl(file)
  };
  log.info("asset.attached", {
    assetId: uploadedAsset.assetId,
    name: uploadedAsset.name,
    type: uploadedAsset.type,
    size: uploadedAsset.size
  });

  return {
    type: "image",
    label: file.name,
    url: URL.createObjectURL(file)
  };
}

function handleAiRemoveToken(stored) {
  if (stored.type === "pick" && stored.selectionId) {
    selectedElements = selectedElements.filter((selection) => selection.id !== stored.selectionId);
    log.info("selection.removed", { selectionId: stored.selectionId, remaining: selectedElements.length });
    return;
  }

  if (stored.type === "image") {
    uploadedAsset = null;
    log.info("asset.removed");
  }
}

function formatSelectionLabel(selection) {
  const hint = selection.selectorHints?.[0];
  if (hint) return hint;
  const className = selection.classes?.[0];
  if (selection.idAttr) return `${selection.tag}#${selection.idAttr}`;
  if (className) return `${selection.tag}.${className}`;
  return selection.tag || "element";
}

async function generatePlanFromPrompt(prompt) {
  const pageContext = buildPageContext();
  const pageDom = window.PersoDomContext.collectPageDom();
  log.info("generation.started", {
    promptLength: prompt.length,
    pageContext,
    selectionCount: selectedElements.length,
    pageNodeCount: pageDom.nodeCount
  });

  let plan = await window.PersoAiClient.generateTransformPlan({
    prompt,
    pageContext,
    pageDom,
    selections: selectedElements,
    availableAssets: getAvailableAssetSummaries()
  });
  plan = attachAssetsToPlan(plan);
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
      selections: selectedElements,
      availableAssets: getAvailableAssetSummaries(),
      previousPlan: plan,
      validationErrors: validation.errors
    });
    plan = attachAssetsToPlan(plan);

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
  renderPlan(plan);
}

async function applySavedPlan() {
  await runPanelTask("Applying saved plan...", async () => {
    const state = await chrome.storage.local.get([getPlanStorageKey()]);
    const savedPlan = state[getPlanStorageKey()];
    if (!savedPlan) throw new Error("No saved plan for this page yet.");

    log.info("plan.saved.apply.requested", { key: getPlanStorageKey(), ruleCount: savedPlan.rules?.length || 0 });
    currentPlan = savedPlan;
    zeroMatchRetryCount = 0;
    applyCurrentPlan();
    renderPlan(savedPlan);
    return "Saved plan applied.";
  });
}

async function revertChanges() {
  await runPanelTask("Reverting changes...", async () => {
    clearTimeout(applyTimer);
    currentPlan = null;
    zeroMatchRetryCount = 0;
    suppressMutationApplyUntil = Date.now() + 1200;
    window.PersoExecutor.revertPlan();
    await chrome.storage.local.remove([getPlanStorageKey()]);
    renderPlan(null);
    log.info("plan.reverted", { key: getPlanStorageKey() });
    return "Changes reverted.";
  });
}

async function runPanelTask(message, callback) {
  setPanelStatus(message);
  setPanelDisabled(true);

  try {
    const result = await callback();
    setPanelStatus(result);
    log.info("panel.task.finished", { message: result });
  } catch (error) {
    setPanelStatus(error.message || String(error));
    log.error("panel.task.failed", { error });
  } finally {
    setPanelDisabled(false);
  }
}

function setPanelStatus(message) {
  panel.querySelector('[data-role="status"]').textContent = message;
}

function setPanelDisabled(disabled) {
  aiInput?.setDisabled(disabled);
  panel.querySelectorAll("button[data-action]").forEach((element) => {
    if (element.dataset.action !== "close") element.disabled = disabled;
  });
}

function renderPlan(plan) {
  if (!panel) return;
  panel.querySelector('[data-role="plan"]').textContent = plan ? JSON.stringify(plan, null, 2) : "";
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

function getAvailableAssetSummaries() {
  if (!uploadedAsset) return [];
  return [{
    assetId: uploadedAsset.assetId,
    name: uploadedAsset.name,
    type: uploadedAsset.type,
    size: uploadedAsset.size,
    useAs: "backgroundImage"
  }];
}

function attachAssetsToPlan(plan) {
  if (!uploadedAsset) return plan;

  return {
    ...plan,
    assets: {
      ...(plan.assets || {}),
      [uploadedAsset.assetId]: {
        type: uploadedAsset.type,
        name: uploadedAsset.name,
        dataUrl: uploadedAsset.dataUrl
      }
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
