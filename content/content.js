const log = window.PersoLogger;
const CONTENT_VERSION = "0.3.0-picker-pipeline";
let currentPlan = null;
let applyTimer = null;
let panel = null;
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
    <label for="perso-xxl-notes">What do you want to change?</label>
    <div class="perso-xxl-prompt-row">
      <textarea id="perso-xxl-notes" rows="4" placeholder="Example: Remove this button."></textarea>
      <button type="button" data-action="pick" class="secondary perso-xxl-pick-button" title="Select element">◎</button>
    </div>
    <div class="perso-xxl-selections" data-role="selections" hidden></div>
    <div class="perso-xxl-asset-row">
      <label class="perso-xxl-file-button">
        Attach image
        <input id="perso-xxl-asset" type="file" accept="image/*">
      </label>
      <span data-role="asset-status">No image attached</span>
    </div>
    <div class="perso-xxl-actions">
      <button type="button" data-action="generate">Generate and apply</button>
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
  root.querySelector("#perso-xxl-asset").addEventListener("change", handleAssetChange);
  root.querySelector('[data-role="selections"]').addEventListener("click", handleSelectionClick);
  return root;
}

async function loadPanelState() {
  const state = await chrome.storage.local.get(["profileNotes", getPlanStorageKey()]);
  const notes = panel.querySelector("#perso-xxl-notes");
  const savedPlan = state[getPlanStorageKey()];

  if (state.profileNotes) notes.value = state.profileNotes;
  if (savedPlan) renderPlan(savedPlan);
  renderSelections();
  log.info("panel.state.loaded", {
    hasProfileNotes: Boolean(state.profileNotes),
    hasSavedPlan: Boolean(savedPlan),
    key: getPlanStorageKey()
  });
  notes.focus();
}

async function handlePanelClick(event) {
  const action = event.target?.dataset?.action;
  if (!action) return;

  if (action === "close") {
    panel.hidden = true;
    log.info("panel.closed");
    return;
  }

  if (action === "pick") {
    await startElementPick();
    return;
  }

  if (action === "generate") {
    await generateAndApplyPlan();
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

function handleSelectionClick(event) {
  const removeId = event.target?.dataset?.removeSelection;
  if (!removeId) return;

  selectedElements = selectedElements.filter((selection) => selection.id !== removeId);
  renderSelections();
  log.info("selection.removed", { selectionId: removeId, remaining: selectedElements.length });
}

async function startElementPick() {
  if (!panel || window.PersoPicker.isActive()) return;

  panel.hidden = true;
  log.info("picker.requested");

  try {
    const element = await window.PersoPicker.pickElement();
    selectionCounter += 1;
    const selection = window.PersoDomContext.buildSelection(element, `sel_${selectionCounter}`);
    selectedElements.push(selection);
    renderSelections();
    log.info("selection.added", { selectionId: selection.id, count: selectedElements.length });
  } catch (error) {
    if (error.message !== "Selection cancelled.") {
      log.warn("picker.failed", { error });
    }
  } finally {
    panel.hidden = false;
    panel.querySelector("#perso-xxl-notes")?.focus();
  }
}

function renderSelections() {
  if (!panel) return;

  const container = panel.querySelector('[data-role="selections"]');
  container.replaceChildren();

  if (selectedElements.length === 0) {
    container.hidden = true;
    return;
  }

  container.hidden = false;

  for (const selection of selectedElements) {
    const chip = document.createElement("span");
    chip.className = "perso-xxl-selection-chip";
    chip.innerHTML = `
      <span>(pasted element)</span>
      <button type="button" data-remove-selection="${selection.id}" aria-label="Remove selection">×</button>
    `;
    container.appendChild(chip);
  }
}

async function generateAndApplyPlan() {
  await runPanelTask("Generating plan...", async () => {
    const prompt = panel.querySelector("#perso-xxl-notes").value.trim();
    if (!prompt) throw new Error("Type what you want to change first.");
    if (hasLocalPath(prompt) && !uploadedAsset) {
      throw new Error("Attach the image file instead of typing its local path.");
    }

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
    return "Plan generated and applied.";
  });
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
  panel.querySelectorAll("button, textarea").forEach((element) => {
    if (element.dataset.action !== "close") element.disabled = disabled;
  });
}

function renderPlan(plan) {
  if (!panel) return;
  panel.querySelector('[data-role="plan"]').textContent = plan ? JSON.stringify(plan, null, 2) : "";
}

async function handleAssetChange(event) {
  const file = event.target.files?.[0];
  if (!file) {
    uploadedAsset = null;
    setAssetStatus("No image attached");
    return;
  }

  if (!file.type.startsWith("image/")) {
    uploadedAsset = null;
    setAssetStatus("Only image files are supported");
    return;
  }

  uploadedAsset = {
    assetId: "uploadedImage",
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl: await readFileAsDataUrl(file)
  };
  setAssetStatus(file.name);
  log.info("asset.attached", {
    assetId: uploadedAsset.assetId,
    name: uploadedAsset.name,
    type: uploadedAsset.type,
    size: uploadedAsset.size
  });
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

function setAssetStatus(message) {
  panel?.querySelector('[data-role="asset-status"]')?.replaceChildren(document.createTextNode(message));
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
