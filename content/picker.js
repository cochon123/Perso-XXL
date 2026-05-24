window.PersoPicker = (() => {
  const log = window.PersoLogger;
  let active = false;
  let overlay = null;
  let highlight = null;
  let hint = null;
  let hoveredElement = null;
  let onPick = null;
  let onCancel = null;

  function isPersoNode(node) {
    return Boolean(
      node?.id?.startsWith("perso-xxl") ||
      node?.closest?.("#perso-xxl-panel, #perso-xxl-picker-overlay, [data-perso-xxl-ui]")
    );
  }

  function resolveTarget(element) {
    if (!element || element === document.documentElement) return null;
    if (isPersoNode(element)) return null;
    return element;
  }

  function elementAtPoint(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      const target = resolveTarget(node);
      if (target) return target;
    }
    return null;
  }

  function createUi() {
    overlay = document.createElement("div");
    overlay.id = "perso-xxl-picker-overlay";
    overlay.setAttribute("data-perso-xxl-ui", "true");
    overlay.innerHTML = `
      <div id="perso-xxl-picker-highlight" aria-hidden="true"></div>
      <div id="perso-xxl-picker-hint" data-perso-xxl-ui="true">
        Click an element · Esc to cancel · ↑ parent · users often mean the parent control
      </div>
    `;
    highlight = overlay.querySelector("#perso-xxl-picker-highlight");
    hint = overlay.querySelector("#perso-xxl-picker-hint");
    document.documentElement.appendChild(overlay);
  }

  function destroyUi() {
    overlay?.remove();
    overlay = null;
    highlight = null;
    hint = null;
    hoveredElement = null;
  }

  function positionHighlight(element) {
    if (!highlight || !element) {
      if (highlight) highlight.hidden = true;
      return;
    }

    const rect = element.getBoundingClientRect();
    highlight.hidden = false;
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  }

  function handleMouseMove(event) {
    if (!active) return;
    hoveredElement = elementAtPoint(event.clientX, event.clientY);
    positionHighlight(hoveredElement);
  }

  function handleClick(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    let target = null;

    for (const node of path) {
      if (node instanceof Element) {
        target = resolveTarget(node);
        if (target) break;
      }
    }

    target = target || hoveredElement;
    if (!target) return;

    log.info("picker.selected", {
      tag: target.tagName.toLowerCase(),
      id: target.id || null
    });
    finish(target);
  }

  function handleKeyDown(event) {
    if (!active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }

    if (event.key === "ArrowUp" && hoveredElement?.parentElement) {
      event.preventDefault();
      hoveredElement = resolveTarget(hoveredElement.parentElement);
      positionHighlight(hoveredElement);
    }
  }

  function bindEvents() {
    overlay.addEventListener("mousemove", handleMouseMove, true);
    overlay.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeyDown, true);
  }

  function unbindEvents() {
    overlay?.removeEventListener("mousemove", handleMouseMove, true);
    overlay?.removeEventListener("click", handleClick, true);
    window.removeEventListener("keydown", handleKeyDown, true);
  }

  function finish(element) {
    const pickHandler = onPick;
    stop();
    pickHandler?.(element);
  }

  function cancel() {
    const cancelHandler = onCancel;
    stop();
    cancelHandler?.();
  }

  function stop() {
    if (!active) return;
    active = false;
    unbindEvents();
    destroyUi();
    onPick = null;
    onCancel = null;
  }

  function pickElement() {
    if (active) {
      return Promise.reject(new Error("Picker is already active."));
    }

    return new Promise((resolve, reject) => {
      active = true;
      onPick = resolve;
      onCancel = () => reject(new Error("Selection cancelled."));
      createUi();
      bindEvents();
      log.info("picker.started");
    });
  }

  return {
    pickElement,
    cancel,
    isActive: () => active
  };
})();
