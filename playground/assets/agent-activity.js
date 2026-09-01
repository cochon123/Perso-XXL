window.PersoAgentActivity = (() => {
  const MAX_EVENTS = 20;
  const IDLE_MS = 6000;
  const events = [];
  let root = null;
  let list = null;
  let collapsed = false;
  let idleTimer = null;

  const STYLE = `
#pxxl-agent-activity {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 2147483600;
  width: min(360px, calc(100vw - 32px));
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #f4f1ea;
  pointer-events: none;
}

#pxxl-agent-activity * { box-sizing: border-box; }

#pxxl-agent-activity .pxxl-aa-shell {
  pointer-events: auto;
  background: rgba(16, 16, 20, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.38),
    0 1px 0 rgba(255, 255, 255, 0.06) inset;
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
  overflow: hidden;
}

#pxxl-agent-activity.pxxl-aa-collapsed {
  width: auto;
}

#pxxl-agent-activity.pxxl-aa-collapsed .pxxl-aa-shell {
  display: inline-flex;
}

#pxxl-agent-activity .pxxl-aa-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

#pxxl-agent-activity .pxxl-aa-toggle:hover {
  background: rgba(255, 255, 255, 0.04);
}

#pxxl-agent-activity .pxxl-aa-bolt {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: linear-gradient(180deg, #7c5cff, #5b3dff);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
  font-size: 12px;
}

#pxxl-agent-activity .pxxl-aa-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

#pxxl-agent-activity .pxxl-aa-count {
  margin-left: auto;
  font-size: 11px;
  color: rgba(244, 241, 234, 0.5);
  font-variant-numeric: tabular-nums;
}

#pxxl-agent-activity.pxxl-aa-collapsed .pxxl-aa-list,
#pxxl-agent-activity.pxxl-aa-collapsed .pxxl-aa-count {
  display: none;
}

#pxxl-agent-activity .pxxl-aa-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow: auto;
  padding: 0 10px 10px;
}

#pxxl-agent-activity .pxxl-aa-card {
  display: grid;
  grid-template-columns: 12px 1fr;
  gap: 8px;
  align-items: start;
  padding: 8px 9px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

#pxxl-agent-activity .pxxl-aa-dot {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: #8b8b96;
  box-shadow: 0 0 0 3px rgba(139, 139, 150, 0.16);
}

#pxxl-agent-activity .pxxl-aa-dot[data-phase="start"] {
  background: #8b7cff;
  box-shadow: 0 0 0 3px rgba(139, 124, 255, 0.22);
  animation: pxxl-aa-pulse 1.1s ease-in-out infinite;
}

#pxxl-agent-activity .pxxl-aa-dot[data-phase="progress"] {
  background: #f5b942;
  box-shadow: 0 0 0 3px rgba(245, 185, 66, 0.2);
}

#pxxl-agent-activity .pxxl-aa-dot[data-phase="success"] {
  background: #3dcf7a;
  box-shadow: 0 0 0 3px rgba(61, 207, 122, 0.18);
}

#pxxl-agent-activity .pxxl-aa-dot[data-phase="error"] {
  background: #ff5d6c;
  box-shadow: 0 0 0 3px rgba(255, 93, 108, 0.2);
}

#pxxl-agent-activity .pxxl-aa-tool {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.35;
  color: #f7f4ee;
}

#pxxl-agent-activity .pxxl-aa-detail {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(244, 241, 234, 0.62);
}

@keyframes pxxl-aa-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.25); opacity: 0.7; }
}

@media (prefers-reduced-motion: reduce) {
  #pxxl-agent-activity .pxxl-aa-dot[data-phase="start"] { animation: none; }
}
`;

  function ensureUi() {
    if (root) return;

    const style = document.createElement("style");
    style.setAttribute("data-perso-xxl-ui", "true");
    style.textContent = STYLE;
    document.head.appendChild(style);

    root = document.createElement("aside");
    root.id = "pxxl-agent-activity";
    root.setAttribute("data-perso-xxl-ui", "true");
    root.setAttribute("aria-label", "Agent activity");
    root.hidden = true;

    root.innerHTML = `
      <div class="pxxl-aa-shell">
        <button type="button" class="pxxl-aa-toggle" aria-expanded="true">
          <span class="pxxl-aa-bolt" aria-hidden="true">⚡</span>
          <span class="pxxl-aa-title">Agent activity</span>
          <span class="pxxl-aa-count"></span>
        </button>
        <div class="pxxl-aa-list" role="log" aria-live="polite"></div>
      </div>
    `;

    list = root.querySelector(".pxxl-aa-list");
    root.querySelector(".pxxl-aa-toggle").addEventListener("click", () => {
      if (collapsed) expand();
      else collapse();
    });

    document.body.appendChild(root);
  }

  function formatDetail(phase, detail) {
    if (detail == null) return "";
    if (phase === "progress" && typeof detail === "string") {
      const stage = detail.replace(/-/g, " ").trim();
      return stage.endsWith("…") ? stage : `${stage}…`;
    }
    if (typeof detail === "string") {
      return detail.length > 140 ? `${detail.slice(0, 137)}…` : detail;
    }
    if (typeof detail === "object" && detail.summary) return String(detail.summary);
    return "";
  }

  function render() {
    if (!root || !list) return;
    root.hidden = events.length === 0;
    root.querySelector(".pxxl-aa-count").textContent = events.length
      ? `${events.length}`
      : "";
    root.querySelector(".pxxl-aa-toggle").setAttribute("aria-expanded", String(!collapsed));

    list.innerHTML = events.map((event) => {
      const detail = formatDetail(event.phase, event.detail);
      const tool = escapeHtml(event.tool || "tool");
      const phase = escapeHtml(event.phase || "start");
      return `
        <div class="pxxl-aa-card">
          <span class="pxxl-aa-dot" data-phase="${phase}"></span>
          <div>
            <div class="pxxl-aa-tool">${tool}</div>
            ${detail ? `<div class="pxxl-aa-detail">${escapeHtml(detail)}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function expand() {
    collapsed = false;
    root?.classList.remove("pxxl-aa-collapsed");
    render();
    armIdle();
  }

  function collapse() {
    collapsed = true;
    root?.classList.add("pxxl-aa-collapsed");
    render();
    clearTimeout(idleTimer);
  }

  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (events.length) collapse();
    }, IDLE_MS);
  }

  function log(event) {
    if (!event || typeof event !== "object") return;
    ensureUi();
    events.unshift({
      tool: event.tool || "tool",
      phase: event.phase || "start",
      detail: event.detail
    });
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    expand();
    render();
  }

  window.addEventListener("perso-xxl-agent-activity", (event) => {
    log(event?.detail);
  });

  if (document.body) ensureUi();
  else document.addEventListener("DOMContentLoaded", ensureUi);

  return { log };
})();
