(() => {
  const SOURCE = "perso-xxl-webmcp";
  const HELLO_INTERVAL_MS = 500;
  const HELLO_MAX_TRIES = 10;
  const CALL_TIMEOUT_MS = 5 * 60 * 1000;
  const DYNAMIC_DEBOUNCE_MS = 200;
  const log = {
    debug() {},
    info() {},
    warn(event, data) {
      console.warn("[Perso XXL]", event, data || {});
    },
    error(event, data) {
      console.error("[Perso XXL]", event, data || {});
    }
  };

  const modelContext = document.modelContext || navigator.modelContext;
  if (!modelContext?.registerTool) {
    console.debug("[Perso XXL]", "webmcp.bridge.unavailable");
    return;
  }
  if (!window.PersoToolsDef) return;

  const pendingCalls = new Map();
  const coreController = new AbortController();
  let nonce = null;
  let helloTimer = null;
  let helloTries = 0;
  let coreRegistered = false;
  let dynamicController = null;
  let dynamicTimer = null;
  let pendingModifications = null;

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
      const message = { ...payload, source: SOURCE };
      if (nonce) message.nonce = nonce;
      window.postMessage(message, location.origin);
    } catch (error) {
      log.warn("webmcp.bridge.post_failed", { error: error?.message || String(error) });
    }
  }

  function isValidInbound(event) {
    if (event.source !== window) return false;
    if (event.origin !== location.origin) return false;
    const data = event.data;
    if (!data || typeof data !== "object") return false;
    if (data.source !== SOURCE) return false;
    return true;
  }

  function notify(event) {
    try {
      window.dispatchEvent(new CustomEvent("perso-xxl-agent-activity", { detail: event }));
    } catch (_error) {}
  }

  function finishCall(id, fn) {
    const pending = pendingCalls.get(id);
    if (!pending) return;
    pendingCalls.delete(id);
    clearTimeout(pending.timeoutId);
    if (pending.signal && pending.onAbort) {
      try {
        pending.signal.removeEventListener("abort", pending.onAbort);
      } catch (_error) {}
    }
    fn(pending);
  }

  function rpc(method, params, extras = {}) {
    return new Promise((resolve, reject) => {
      const id = randomId();
      const signal = extras.signal;
      const onProgress = extras.onProgress;

      if (signal?.aborted) {
        reject(signal.reason || new DOMException("The operation was aborted.", "AbortError"));
        return;
      }

      const onAbort = () => {
        post({ type: "abort", id });
      };

      const timeoutId = setTimeout(() => {
        finishCall(id, () => {
          post({ type: "abort", id });
          reject(new Error("Perso XXL WebMCP call timed out after 5 minutes."));
        });
      }, CALL_TIMEOUT_MS);

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      pendingCalls.set(id, { resolve, reject, timeoutId, onProgress, signal, onAbort });
      post({ type: "call", id, method, params });
    });
  }

  const hostProxy = {
    inspectPage(opts = {}) {
      return rpc("inspectPage", [opts]);
    },
    applyDirectPlan(opts = {}) {
      const options = opts && typeof opts === "object" ? opts : {};
      const { signal, onProgress, ...params } = options;
      return rpc("applyDirectPlan", [params], { signal, onProgress });
    },
    personalize(opts = {}) {
      const options = opts && typeof opts === "object" ? opts : {};
      const { signal, onProgress, ...params } = options;
      return rpc("personalize", [params], { signal, onProgress });
    },
    listModifications() {
      return rpc("listModifications", []);
    },
    setModificationEnabled(id, enabled) {
      return rpc("setModificationEnabled", [id, enabled]);
    },
    removeModification(id) {
      return rpc("removeModification", [id]);
    },
    undoLast() {
      return rpc("undoLast", []);
    },
    revertAll() {
      return rpc("revertAll", []);
    },
    invokeCapability(modId, ruleId) {
      return rpc("invokeCapability", [modId, ruleId]);
    },
    getAllSiteRecords() {
      return rpc("getAllSiteRecords", []);
    },
    getSiteRecord() {
      return rpc("getSiteRecord", []);
    }
  };

  async function registerCoreTools() {
    if (coreRegistered) return;
    coreRegistered = true;
    try {
      const tools = window.PersoToolsDef.buildCoreTools(hostProxy, { notify });
      await window.PersoToolsDef.registerTools(modelContext, tools, { signal: coreController.signal });
    } catch (error) {
      coreRegistered = false;
      log.warn("webmcp.bridge.core_failed", { error: error?.message || String(error) });
    }
  }

  async function runDynamicSync() {
    const modifications = pendingModifications;
    if (dynamicController) {
      try {
        dynamicController.abort();
      } catch (_error) {}
    }
    dynamicController = new AbortController();
    const signal = dynamicController.signal;
    try {
      const tools = window.PersoToolsDef.buildDynamicTools(hostProxy, modifications, { notify });
      await window.PersoToolsDef.registerTools(modelContext, tools, { signal });
    } catch (error) {
      if (signal.aborted) return;
      log.warn("webmcp.bridge.dynamic_failed", { error: error?.message || String(error) });
    }
  }

  function syncDynamicTools(modifications) {
    pendingModifications = modifications;
    clearTimeout(dynamicTimer);
    dynamicTimer = setTimeout(() => {
      runDynamicSync();
    }, DYNAMIC_DEBOUNCE_MS);
  }

  function stopHello() {
    if (!helloTimer) return;
    clearInterval(helloTimer);
    helloTimer = null;
  }

  function handleHandshake(data) {
    if (nonce && data.nonce !== nonce) return;
    if (!data.nonce) return;
    nonce = data.nonce;
    stopHello();
    registerCoreTools();
    syncDynamicTools(Array.isArray(data.modifications) ? data.modifications : []);
  }

  function handleResult(data) {
    finishCall(data.id, (pending) => {
      if (data.ok) pending.resolve(data.result);
      else pending.reject(new Error(data.error || "Perso XXL WebMCP call failed."));
    });
  }

  function handleProgress(data) {
    const pending = pendingCalls.get(data.id);
    if (!pending || typeof pending.onProgress !== "function") return;
    try {
      pending.onProgress(data.stage);
    } catch (_error) {}
  }

  function handleRecordChanged(data) {
    syncDynamicTools(Array.isArray(data.modifications) ? data.modifications : []);
  }

  function onMessage(event) {
    if (!isValidInbound(event)) return;
    const data = event.data;
    if (data.type === "handshake") {
      handleHandshake(data);
      return;
    }
    if (!nonce || data.nonce !== nonce) return;
    if (data.type === "result") {
      handleResult(data);
      return;
    }
    if (data.type === "progress") {
      handleProgress(data);
      return;
    }
    if (data.type === "record-changed") {
      handleRecordChanged(data);
    }
  }

  window.addEventListener("message", (event) => {
    try {
      onMessage(event);
    } catch (error) {
      log.warn("webmcp.bridge.handler_error", { error: error?.message || String(error) });
    }
  });

  function sendHello() {
    post({ type: "hello" });
  }

  sendHello();
  helloTries = 1;
  helloTimer = setInterval(() => {
    if (nonce) {
      stopHello();
      return;
    }
    helloTries += 1;
    if (helloTries > HELLO_MAX_TRIES) {
      stopHello();
      return;
    }
    sendHello();
  }, HELLO_INTERVAL_MS);
})();
