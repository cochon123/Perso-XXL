window.PersoPlayground = window.PersoPlayground || {};

(() => {
  const modelContext = document.modelContext || navigator.modelContext;
  if (!modelContext?.registerTool) {
    window.PersoPlayground.webmcpAvailable = false;
    return;
  }

  window.PersoPlayground.webmcpAvailable = true;

  const notify = (event) => {
    window.PersoAgentActivity?.log(event);
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForHost() {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      if (window.PersoContentApi && window.PersoToolsDef) return window.PersoContentApi;
      await sleep(20);
    }
    return window.PersoContentApi || null;
  }

  async function start() {
    const host = await waitForHost();
    if (!host || !window.PersoToolsDef) return;

    const coreTools = window.PersoToolsDef.buildCoreTools(host, { notify });
    const coreController = new AbortController();
    await window.PersoToolsDef.registerTools(modelContext, coreTools, {
      signal: coreController.signal
    });

    let dynamicController = null;
    let debounceTimer = 0;

    async function syncDynamicTools() {
      if (dynamicController) dynamicController.abort();
      dynamicController = new AbortController();
      const modifications = host.listModifications();
      const tools = window.PersoToolsDef.buildDynamicTools(host, modifications, { notify });
      await window.PersoToolsDef.registerTools(modelContext, tools, {
        signal: dynamicController.signal
      });
    }

    function scheduleSync() {
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        syncDynamicTools();
      }, 200);
    }

    await sleep(150);
    await syncDynamicTools();
    host.onRecordChange(scheduleSync);
    window.setTimeout(() => {
      syncDynamicTools();
    }, 500);
  }

  start();
})();
