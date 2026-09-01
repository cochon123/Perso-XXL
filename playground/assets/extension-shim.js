window.PersoShim = (() => {
  const PREFIX = "pxxl:";
  const storageListeners = [];
  const messageListeners = [];

  function storageKey(key) {
    return `${PREFIX}${key}`;
  }

  function isShimKey(lsKey) {
    return typeof lsKey === "string" && lsKey.startsWith(PREFIX);
  }

  function readValue(lsKey) {
    const raw = localStorage.getItem(lsKey);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return undefined;
    }
  }

  function parseStored(raw) {
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return undefined;
    }
  }

  function collectAll() {
    const result = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const lsKey = localStorage.key(index);
      if (!isShimKey(lsKey)) continue;
      const value = readValue(lsKey);
      if (value !== undefined) {
        result[lsKey.slice(PREFIX.length)] = value;
      }
    }
    return result;
  }

  function normalizeKeys(keys) {
    if (typeof keys === "string") return [keys];
    if (Array.isArray(keys)) return keys.filter((key) => typeof key === "string");
    return [];
  }

  async function get(keys) {
    if (keys == null) return collectAll();

    const result = {};
    normalizeKeys(keys).forEach((key) => {
      const value = readValue(storageKey(key));
      if (value !== undefined) result[key] = value;
    });
    return result;
  }

  async function set(obj) {
    Object.entries(obj || {}).forEach(([key, value]) => {
      localStorage.setItem(storageKey(key), JSON.stringify(value));
    });
  }

  async function remove(keys) {
    normalizeKeys(keys).forEach((key) => {
      localStorage.removeItem(storageKey(key));
    });
  }

  function addStorageListener(callback) {
    if (typeof callback === "function") storageListeners.push(callback);
  }

  window.addEventListener("storage", (event) => {
    if (!isShimKey(event.key)) return;

    const key = event.key.slice(PREFIX.length);
    const changes = {
      [key]: {
        oldValue: parseStored(event.oldValue),
        newValue: parseStored(event.newValue)
      }
    };

    storageListeners.forEach((callback) => {
      try {
        callback(changes, "local");
      } catch (_error) {}
    });
  });

  function addMessageListener(callback) {
    if (typeof callback === "function") messageListeners.push(callback);
  }

  function emitRuntimeMessage(message) {
    messageListeners.forEach((callback) => {
      try {
        callback(message, {}, function sendResponse() {});
      } catch (_error) {}
    });
  }

  async function sendMessage(msg) {
    if (msg?.type === "PERSO_FETCH_IMAGE_ASSET") {
      return { ok: false, error: "Image fetch is not available in the playground." };
    }
    if (msg?.type === "PERSO_OPEN_DASHBOARD") {
      return { ok: true };
    }
    return { ok: true };
  }

  const api = {
    storage: {
      local: { get, set, remove },
      onChanged: { addListener: addStorageListener }
    },
    runtime: {
      onMessage: { addListener: addMessageListener },
      sendMessage,
      getURL(path) {
        return path;
      },
      getManifest() {
        return { version: "playground" };
      }
    }
  };

  globalThis.browser = api;

  return {
    emitRuntimeMessage
  };
})();
