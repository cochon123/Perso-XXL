const adapter = window.PersoYoutubeAdapter;
const log = window.PersoLogger;
let currentPlan = null;
let applyTimer = null;
let panel = null;
let suppressMutationApplyUntil = 0;
let zeroMatchRetryCount = 0;

log.info("content.loaded", {
  pageType: adapter.getPageType(),
  hasSavedPlan: false
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PERSO_TOGGLE_PANEL") {
    log.info("panel.toggle.requested");
    togglePanel();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "PERSO_COLLECT_DOM") {
    const domSummary = adapter.buildDomSummary();
    log.info("dom.summary.collected", summarizeDomForLog(domSummary));
    sendResponse({ ok: true, domSummary });
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

chrome.storage.local.get(["youtubePlan"], ({ youtubePlan }) => {
  log.info("storage.loaded", { hasSavedPlan: Boolean(youtubePlan) });
  if (youtubePlan) {
    currentPlan = youtubePlan;
    applyCurrentPlan();
  }
});

window.addEventListener("yt-navigate-finish", () => {
  log.info("youtube.navigation.finished", { pageType: adapter.getPageType() });
  scheduleApply("youtube-navigation");
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
    ruleCount: currentPlan.rules?.length || 0,
    pageType: adapter.getPageType()
  });
  const result = window.PersoExecutor.applyPlan(currentPlan, adapter);
  log.info("plan.apply.finished");
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
    return node.matches?.("ytd-app, ytd-page-manager, ytd-rich-grid-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-thumbnail") ||
      node.querySelector?.("ytd-rich-grid-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-thumbnail");
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
    <label for="perso-xxl-notes">Tell the AI what you like</label>
    <textarea id="perso-xxl-notes" rows="7" placeholder="Example: I like calm tools, warm accents, compact layouts, fewer distractions, and readable typography. I dislike neon colors and clutter."></textarea>
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
  return root;
}

async function loadPanelState() {
  const state = await chrome.storage.local.get(["profileNotes", "youtubePlan"]);
  const notes = panel.querySelector("#perso-xxl-notes");

  if (state.profileNotes) notes.value = state.profileNotes;
  if (state.youtubePlan) renderPlan(state.youtubePlan);
  log.info("panel.state.loaded", {
    hasProfileNotes: Boolean(state.profileNotes),
    hasSavedPlan: Boolean(state.youtubePlan)
  });
}

async function handlePanelClick(event) {
  const action = event.target?.dataset?.action;
  if (!action) return;

  if (action === "close") {
    panel.hidden = true;
    log.info("panel.closed");
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

async function generateAndApplyPlan() {
  await runPanelTask("Generating plan...", async () => {
    const notes = panel.querySelector("#perso-xxl-notes").value.trim();
    const domSummary = adapter.buildDomSummary();
    log.info("generation.started", {
      notesLength: notes.length,
      dom: summarizeDomForLog(domSummary)
    });

    let plan = await window.PersoAiClient.generateTransformPlan({
      profileNotes: notes,
      domSummary
    });
    log.info("generation.received", {
      site: plan.site,
      ruleCount: plan.rules?.length || 0,
      targets: Array.from(new Set((plan.rules || []).map((rule) => rule.target).filter(Boolean)))
    });

    let validation = window.PersoAiClient.validateTransformPlan(plan);
    if (!validation.ok) {
      log.warn("generation.validation.failed", { errors: validation.errors });
      log.info("generation.repair.started");

      plan = await window.PersoAiClient.generateTransformPlan({
        profileNotes: notes,
        domSummary,
        previousPlan: plan,
        validationErrors: validation.errors
      });

      validation = window.PersoAiClient.validateTransformPlan(plan);
      if (!validation.ok) {
        log.warn("generation.repair.failed", { errors: validation.errors });
        throw new Error(`Generated plan failed validation: ${validation.errors.join(" ")}`);
      }

      log.info("generation.repair.passed", {
        ruleCount: plan.rules?.length || 0,
        targets: Array.from(new Set((plan.rules || []).map((rule) => rule.target).filter(Boolean)))
      });
    }
    log.info("generation.validation.passed");

    currentPlan = plan;
    zeroMatchRetryCount = 0;
    await chrome.storage.local.set({
      profileNotes: notes,
      youtubePlan: plan
    });
    log.info("storage.saved", { hasProfileNotes: Boolean(notes), ruleCount: plan.rules?.length || 0 });
    applyCurrentPlan();
    renderPlan(plan);
    return "Plan generated and applied.";
  });
}

async function applySavedPlan() {
  await runPanelTask("Applying saved plan...", async () => {
    const { youtubePlan } = await chrome.storage.local.get(["youtubePlan"]);
    if (!youtubePlan) throw new Error("No saved YouTube plan yet.");

    log.info("plan.saved.apply.requested", { ruleCount: youtubePlan.rules?.length || 0 });
    currentPlan = youtubePlan;
    zeroMatchRetryCount = 0;
    applyCurrentPlan();
    renderPlan(youtubePlan);
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
    await chrome.storage.local.remove(["youtubePlan"]);
    renderPlan(null);
    log.info("plan.reverted");
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

function summarizeDomForLog(domSummary) {
  return {
    pageType: domSummary.pageType,
    viewport: domSummary.viewport,
    targets: (domSummary.targets || []).map((target) => ({
      target: target.target,
      count: target.count,
      visibleCount: target.visible?.length || 0
    }))
  };
}
