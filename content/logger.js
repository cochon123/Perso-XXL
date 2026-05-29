window.PersoLogger = (() => {
  const ENDPOINT = "http://localhost:8787/log";
  const enabled = window.PersoEnv?.DEV_LOGS === true;
  let remoteAvailable = enabled ? null : false;

  function debug(event, data = {}) {
    write("debug", event, data);
  }

  function info(event, data = {}) {
    write("info", event, data);
  }

  function warn(event, data = {}) {
    write("warn", event, data);
  }

  function error(event, data = {}) {
    write("error", event, data);
  }

  function write(level, event, data = {}) {
    const entry = {
      level,
      event,
      data: sanitize(data),
      context: {
        url: location.href,
        title: document.title,
        source: "content"
      },
      timestamp: new Date().toISOString()
    };

    const consoleMethod = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    console[consoleMethod]("[Perso XXL]", event, entry.data);

    if (!enabled || remoteAvailable === false) return;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      keepalive: true
    }).then((response) => {
      remoteAvailable = response.ok;
    }).catch(() => {
      // Log server is optional — stop retrying after the first failed attempt.
      remoteAvailable = false;
    });
  }

  function sanitize(value) {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (item instanceof Error) {
        return {
          name: item.name,
          message: item.message,
          stack: item.stack
        };
      }

      if (typeof item === "string" && item.startsWith("sk-or-")) {
        return `${item.slice(0, 10)}...redacted`;
      }

      return item;
    }));
  }

  return { debug, info, warn, error };
})();
