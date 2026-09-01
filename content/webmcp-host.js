(() => {
  const SOURCE = "perso-xxl-webmcp";
  const log = window.PersoLogger || {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
  const ALLOWED_METHODS = new Set([
    "inspectPage",
    "applyDirectPlan",
    "personalize",
    "listModifications",
    "setModificationEnabled",
    "removeModification",
    "undoLast",
    "revertAll",
    "invokeCapability",
    "getAllSiteRecords",
    "getSiteRecord"
  ]);
  const ABORTABLE_METHODS = new Set(["applyDirectPlan", "personalize"]);
  const API_RETRY_MS = 50;
  const API_RETRY_MAX = 20;
  const RECORD_DEBOUNCE_MS = 150;

  const pendingAborts = new Map();
  let nonce = null;
  let recordTimer = null;

  function randomId() {
    try {
      if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    } catch (_error) {}
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function post(payload) {
    try {
      window.postMessage({ ...payload, source: SOURCE, nonce }, location.origin);
    } catch (error) {
      log.warn("webmcp.host.post_failed", { error: error?.message || String(error) });
    }
  }

  function isValidInbound(event) {
    if (event.source !== window) return false;
    if (event.origin !== location.origin) return false;
    const data = event.data;
    if (!data || typeof data !== "object") return false;
    if (data.source !== SOURCE) return false;
    if (data.type !== "hello" && data.nonce !== nonce) return false;
    return true;
  }

  function listModificationsSafe() {
    try {
      const list = window.PersoContentApi?.listModifications?.();
      return Array.isArray(list) ? list : [];
    } catch (error) {
      log.warn("webmcp.host.list_failed", { error: error?.message || String(error) });
      return [];
    }
  }

  function sendHandshake() {
    if (!window.PersoContentApi || !nonce) return;
    post({
      type: "handshake",
      modifications: listModificationsSafe()
    });
  }

  function emitRecordChanged() {
    clearTimeout(recordTimer);
    recordTimer = setTimeout(() => {
      if (!window.PersoContentApi) return;
      post({
        type: "record-changed",
        modifications: listModificationsSafe()
      });
    }, RECORD_DEBOUNCE_MS);
  }

  async function handleCall(data) {
    const id = data.id;
    const method = data.method;
    if (!id) {
      log.warn("webmcp.host.call_missing_id", { method });
      return;
    }

    if (!ALLOWED_METHODS.has(method) || typeof window.PersoContentApi?.[method] !== "function") {
      post({ type: "result", id, ok: false, error: `Unknown method: ${method || ""}` });
      return;
    }

    const args = Array.isArray(data.params) ? data.params.slice() : [];

    if (ABORTABLE_METHODS.has(method)) {
      const abortController = new AbortController();
      pendingAborts.set(id, abortController);
      const opts = args[0] && typeof args[0] === "object" ? { ...args[0] } : {};
      opts.signal = abortController.signal;
      opts.onProgress = (stage) => {
        post({ type: "progress", id, stage });
      };
      args[0] = opts;
    }

    try {
      const result = await window.PersoContentApi[method](...args);
      post({ type: "result", id, ok: true, result });
    } catch (error) {
      post({ type: "result", id, ok: false, error: error?.message || String(error) });
    } finally {
      pendingAborts.delete(id);
    }
  }

  function handleAbort(data) {
    const controller = pendingAborts.get(data.id);
    if (!controller) return;
    try {
      controller.abort();
    } catch (error) {
      log.warn("webmcp.host.abort_failed", { error: error?.message || String(error) });
    }
  }

  function onMessage(event) {
    if (!isValidInbound(event)) return;
    const data = event.data;
    if (data.type === "hello") {
      sendHandshake();
      return;
    }
    if (data.type === "call") {
      handleCall(data).catch((error) => {
        log.warn("webmcp.host.call_failed", { error: error?.message || String(error) });
      });
      return;
    }
    if (data.type === "abort") {
      handleAbort(data);
    }
  }

  function start() {
    nonce = randomId();
    window.addEventListener("message", (event) => {
      try {
        onMessage(event);
      } catch (error) {
        log.warn("webmcp.host.handler_error", { error: error?.message || String(error) });
      }
    });

    try {
      window.PersoContentApi.onRecordChange(emitRecordChanged);
    } catch (error) {
      log.warn("webmcp.host.subscribe_failed", { error: error?.message || String(error) });
    }

    sendHandshake();
    log.info("webmcp.host.ready", {});
  }

  function waitForApi() {
    if (window.PersoContentApi) {
      start();
      return;
    }

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.PersoContentApi) {
        clearInterval(timer);
        start();
        return;
      }
      if (attempts >= API_RETRY_MAX) {
        clearInterval(timer);
        log.warn("webmcp.host.missing_api", {});
      }
    }, API_RETRY_MS);
  }

  waitForApi();
})();
