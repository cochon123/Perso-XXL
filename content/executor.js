window.PersoExecutor = (() => {
  const log = window.PersoLogger;
  const STYLE_ID = "perso-xxl-theme";
  const RULE_STYLE_ID = "perso-xxl-css-rules";
  const TARGET_STYLE_ID = "perso-xxl-target-rules";
  const CAPABILITY_STYLE_ID = "perso-xxl-capability-rules";
  const SHORTCUT_STYLE_ID = "perso-xxl-shortcut-rules";
  const APPLIED_ATTR = "data-perso-xxl-rule";
  const SHORTCUT_ATTR = "data-perso-xxl-shortcut";
  const MOVED_ATTR = "data-perso-xxl-moved";
  const CREATED_ATTR = "data-perso-xxl-created";
  const SWAPPED_ATTR = "data-perso-xxl-swapped";
  const ALLOWED_INSERT_TAGS = new Set([
    "a",
    "aside",
    "button",
    "div",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "header",
    "img",
    "li",
    "nav",
    "p",
    "section",
    "span",
    "strong",
    "ul"
  ]);
  const ALLOWED_INSERT_ATTRIBUTES = new Set(["alt", "aria-label", "href", "role", "src", "title"]);
  const ALLOWED_PLACEMENTS = new Set(["append", "prepend", "before", "after", "replace"]);
  const originalState = new WeakMap();
  const originalPositions = new WeakMap();

  function applyPlan(plan) {
    if (!plan) return { totalMatched: 0 };
    let totalMatched = 0;

    log.info("executor.apply.started", {
      ruleCount: plan.rules?.length || 0,
      targetCount: Object.keys(plan.targetMap || {}).length
    });

    document.documentElement.setAttribute("data-perso-xxl-enabled", "true");
    injectTheme(plan.theme || {});
    clearShortcutButtons();
    clearCreatedElements();
    clearAppliedState();

    const cssRules = [];
    const targetCssRules = [];

    for (const rule of plan.rules || []) {
      try {
        if (rule.type === "css") {
          cssRules.push(rule.css);
        } else if (rule.type === "style") {
          targetCssRules.push(...buildTargetCssRules(rule, plan));
          totalMatched += applyStyleRule(rule, plan);
        } else if (rule.type === "visibility") {
          totalMatched += applyVisibilityRule(rule, plan);
        } else if (rule.type === "attribute") {
          totalMatched += applyAttributeRule(rule, plan);
        } else if (rule.type === "capability") {
          totalMatched += applyCapabilityRule(rule, plan);
        }
      } catch (error) {
        log.warn("executor.rule.failed", { ruleId: rule?.id, ruleType: rule?.type, error });
        console.warn("[Perso XXL] Rule failed", rule?.id || rule?.type, error);
      }
    }

    injectCssRules(cssRules);
    injectTargetCssRules(targetCssRules);
    log.info("executor.apply.finished", { cssRuleCount: cssRules.length, targetCssRuleCount: targetCssRules.length, totalMatched });
    return { totalMatched, cssRuleCount: cssRules.length, targetCssRuleCount: targetCssRules.length };
  }

  function revertPlan() {
    log.info("executor.revert.started");

    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(RULE_STYLE_ID)?.remove();
    document.getElementById(TARGET_STYLE_ID)?.remove();
    document.getElementById(CAPABILITY_STYLE_ID)?.remove();
    document.getElementById(SHORTCUT_STYLE_ID)?.remove();
    clearShortcutButtons();
    document.documentElement.removeAttribute("data-perso-xxl-enabled");
    document.documentElement.removeAttribute("data-perso-xxl-scroll-locked");

    const elements = Array.from(document.querySelectorAll(`[${APPLIED_ATTR}]`));
    const createdElements = elements.filter((element) => element.hasAttribute(CREATED_ATTR));
    const restoredElements = elements
      .filter((element) => !element.hasAttribute(CREATED_ATTR))
      .sort((left, right) => getOriginalIndex(right) - getOriginalIndex(left));

    for (const element of createdElements) {
      restoreElement(element);
    }

    for (const element of restoredElements) {
      restoreElement(element);
    }

    log.info("executor.revert.finished", { restoredCount: elements.length });
  }

  function injectTheme(theme) {
    const colors = theme.colors || {};
    const typography = theme.typography || {};
    const css = `
      :root {
        --perso-background: ${safeCssValue(colors.background, "#111111")};
        --perso-surface: ${safeCssValue(colors.surface, "#1f1f1f")};
        --perso-surface-elevated: ${safeCssValue(colors.surfaceElevated, "#2a2a2a")};
        --perso-text: ${safeCssValue(colors.text, "#f5f5f5")};
        --perso-text-muted: ${safeCssValue(colors.textMuted, "#b8b8b8")};
        --perso-accent: ${safeCssValue(colors.accent, "#d99a4e")};
        --perso-font-family: ${safeCssValue(typography.fontFamily, "Inter, Arial, system-ui, sans-serif")};
        --perso-base-font-size: ${safeCssValue(typography.baseFontSize, "15px")};
        --perso-radius: ${safeCssValue(theme.radius, "12px")};
      }
    `;
    upsertStyle(STYLE_ID, css);
  }

  function injectCssRules(cssRules) {
    upsertStyle(RULE_STYLE_ID, cssRules.join("\n"));
  }

  function injectTargetCssRules(cssRules) {
    upsertStyle(TARGET_STYLE_ID, cssRules.join("\n"));
  }

  function applyStyleRule(rule, plan) {
    const elements = resolveRuleElements(rule, plan);
    log.debug("executor.rule.style", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      matchCount: elements.length,
      matched: summarizeElements(elements)
    });

    for (const element of elements) {
      rememberElement(element);
      mark(element, rule.id);
      for (const [key, value] of Object.entries(rule.styles || {})) {
        const resolvedValue = resolveStyleValue(key, value, plan);
        if (resolvedValue) element.style[key] = resolvedValue;
      }
    }
    return elements.length;
  }

  function applyVisibilityRule(rule, plan) {
    const elements = resolveRuleElements(rule, plan);
    log.debug("executor.rule.visibility", { ruleId: rule.id, targetRef: rule.targetRef, action: rule.action, matchCount: elements.length });

    for (const element of elements) {
      rememberElement(element);
      mark(element, rule.id);

      if (rule.action === "hide") {
        element.style.display = "none";
      } else if (rule.action === "show") {
        element.style.display = "";
      } else if (rule.action === "dim") {
        element.style.opacity = "0.45";
      }
    }
    return elements.length;
  }

  function applyAttributeRule(rule, plan) {
    const elements = resolveRuleElements(rule, plan);
    log.debug("executor.rule.attribute", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      attribute: rule.attribute,
      value: rule.value,
      matchCount: elements.length
    });

    for (const element of elements) {
      rememberElement(element);
      mark(element, rule.id);

      if (rule.value === false || rule.value === null) {
        element.removeAttribute(rule.attribute);
      } else {
        element.setAttribute(rule.attribute, String(rule.value));
      }
    }
    return elements.length;
  }

  function applyCapabilityRule(rule, plan) {
    if (rule.capability === "shortcutButton") {
      return applyShortcutButtonCapability(rule, plan);
    }

    if (rule.capability === "moveElement") {
      return applyMoveElementCapability(rule, plan);
    }

    if (rule.capability === "insertElement") {
      return applyInsertElementCapability(rule, plan);
    }

    if (rule.capability === "cloneElement") {
      return applyCloneElementCapability(rule, plan);
    }

    if (rule.capability === "swapElements") {
      return applySwapElementsCapability(rule, plan);
    }

    if (rule.capability === "menuShortcut") {
      return applyMenuShortcutCapability(rule, plan);
    }

    if (rule.capability !== "scrollLock") {
      log.warn("executor.capability.unsupported", { ruleId: rule.id, capability: rule.capability });
      return 0;
    }

    return applyScrollLockCapability(rule, plan);
  }

  function applyScrollLockCapability(rule, plan) {
    const elements = resolveRuleElements(rule, plan);
    const preserveSelectors = sanitizeSelectors(rule.options?.preserveSelectors || []);
    const preserveElements = uniqueElements(preserveSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
    const firstElement = preserveElements[0] || elements[0] || document.querySelector("main article, article, main > *");

    document.documentElement.setAttribute("data-perso-xxl-scroll-locked", "true");

    if (firstElement) {
      rememberElement(firstElement);
      mark(firstElement, rule.id);
      firstElement.setAttribute("data-perso-xxl-scroll-preserved", "true");
    }

    const css = `
      html[data-perso-xxl-scroll-locked],
      html[data-perso-xxl-scroll-locked] body {
        overflow: hidden !important;
        max-height: 100vh !important;
      }

      html[data-perso-xxl-scroll-locked] main,
      html[data-perso-xxl-scroll-locked] [role="main"] {
        max-height: 100vh !important;
        overflow: hidden !important;
      }
    `;

    upsertStyle(CAPABILITY_STYLE_ID, css);

    log.info("executor.capability.scroll_lock", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      targetCount: elements.length,
      hasPreservedElement: Boolean(firstElement)
    });

    return Math.max(1, elements.length || preserveElements.length);
  }

  function applyShortcutButtonCapability(rule, plan) {
    const placementElements = resolveRuleElements(rule, plan);
    const sourceElements = resolveTargetElements(plan.targetMap?.[rule.sourceActionTargetRef]);
    const placement = placementElements[0] || document.querySelector("header, nav, [role='toolbar'], main") || document.body;
    const source = sourceElements[0];

    if (!placement || !source) {
      log.warn("executor.capability.shortcut_button.missing_target", {
        ruleId: rule.id,
        placementCount: placementElements.length,
        sourceCount: sourceElements.length
      });
      return 0;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(SHORTCUT_ATTR, rule.id || "shortcut");
    button.setAttribute("data-perso-xxl-rule", rule.id || "shortcut");
    button.className = "perso-xxl-shortcut-button";
    button.textContent = sanitizeShortcutLabel(rule.label || source.getAttribute("aria-label") || source.textContent || "Shortcut");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      source.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    });

    if (rule.placement === "prepend") {
      placement.insertBefore(button, placement.firstChild);
    } else {
      placement.appendChild(button);
    }

    rememberElement(placement);
    mark(placement, rule.id);
    injectShortcutCss();

    log.info("executor.capability.shortcut_button", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      sourceActionTargetRef: rule.sourceActionTargetRef
    });

    return 1;
  }

  function applyMoveElementCapability(rule, plan) {
    const elements = resolveRuleElements(rule, plan);
    const destinations = resolveTargetElements(plan.targetMap?.[rule.placementTargetRef]);
    const destination = destinations[0];
    if (!elements.length || !destination) {
      log.warn("executor.capability.move_element.missing_target", {
        ruleId: rule.id,
        elementCount: elements.length,
        destinationCount: destinations.length
      });
      return 0;
    }

    for (const element of elements) {
      if (element === destination || element.contains(destination)) continue;
      rememberElement(element);
      rememberPosition(element);
      mark(element, rule.id);
      element.setAttribute(MOVED_ATTR, "true");
      placeElement(element, destination, normalizePlacement(rule.placement, "append", ["append", "prepend", "before", "after"]));
    }

    log.info("executor.capability.move_element", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      placementTargetRef: rule.placementTargetRef,
      movedCount: elements.length
    });

    return elements.length;
  }

  function applyInsertElementCapability(rule, plan) {
    const targets = resolveRuleElements(rule, plan);
    if (!targets.length) {
      log.warn("executor.capability.insert_element.missing_target", { ruleId: rule.id, targetRef: rule.targetRef });
      return 0;
    }

    const placement = normalizePlacement(rule.placement);
    let insertedCount = 0;

    for (const target of targets) {
      const element = buildInsertedElement(rule.element || {}, plan, rule.id);
      if (!element) continue;
      markCreated(element, rule.id);
      placeElement(element, target, placement);
      insertedCount += 1;
    }

    log.info("executor.capability.insert_element", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      insertedCount
    });

    return insertedCount;
  }

  function applyCloneElementCapability(rule, plan) {
    const targets = resolveRuleElements(rule, plan);
    const sources = resolveTargetElements(plan.targetMap?.[rule.sourceTargetRef]);
    const source = sources[0];

    if (!targets.length || !source) {
      log.warn("executor.capability.clone_element.missing_target", {
        ruleId: rule.id,
        targetCount: targets.length,
        sourceCount: sources.length
      });
      return 0;
    }

    const placement = normalizePlacement(rule.placement);
    let clonedCount = 0;

    for (const target of targets) {
      const clone = source.cloneNode(true);
      stripPersoAttributes(clone);
      if (rule.text) clone.textContent = sanitizeText(rule.text, 240);
      if (rule.label) clone.setAttribute("aria-label", sanitizeText(rule.label, 120));
      markCreated(clone, rule.id);
      placeElement(clone, target, placement);
      clonedCount += 1;
    }

    log.info("executor.capability.clone_element", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      sourceTargetRef: rule.sourceTargetRef,
      clonedCount
    });

    return clonedCount;
  }

  function applySwapElementsCapability(rule, plan) {
    const elements = resolveRuleElements(rule, plan);
    const otherElements = resolveTargetElements(plan.targetMap?.[rule.otherTargetRef]);
    const first = elements[0];
    const second = otherElements[0];

    if (!first || !second || first === second || first.contains(second) || second.contains(first)) {
      log.warn("executor.capability.swap_elements.missing_target", {
        ruleId: rule.id,
        firstCount: elements.length,
        secondCount: otherElements.length
      });
      return 0;
    }

    rememberElement(first);
    rememberElement(second);
    rememberPosition(first);
    rememberPosition(second);
    mark(first, rule.id);
    mark(second, rule.id);

    if (first.getAttribute(SWAPPED_ATTR) === rule.id && second.getAttribute(SWAPPED_ATTR) === rule.id) {
      return 2;
    }

    first.setAttribute(MOVED_ATTR, "true");
    second.setAttribute(MOVED_ATTR, "true");
    first.setAttribute(SWAPPED_ATTR, rule.id || "true");
    second.setAttribute(SWAPPED_ATTR, rule.id || "true");

    const firstMarker = document.createComment("perso-xxl-swap-first");
    const secondMarker = document.createComment("perso-xxl-swap-second");
    first.parentNode.insertBefore(firstMarker, first);
    second.parentNode.insertBefore(secondMarker, second);
    secondMarker.parentNode.insertBefore(first, secondMarker);
    firstMarker.parentNode.insertBefore(second, firstMarker);
    firstMarker.remove();
    secondMarker.remove();

    log.info("executor.capability.swap_elements", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      otherTargetRef: rule.otherTargetRef
    });

    return 2;
  }

  function applyMenuShortcutCapability(rule, plan) {
    const placementElements = resolveRuleElements(rule, plan);
    const menuElements = resolveTargetElements(plan.targetMap?.[rule.menuTargetRef]);
    const placement = placementElements[0] || document.querySelector("header, nav, [role='toolbar'], main") || document.body;
    const menu = menuElements[0];

    if (!placement || !menu || !rule.actionText) {
      log.warn("executor.capability.menu_shortcut.missing_target", {
        ruleId: rule.id,
        placementCount: placementElements.length,
        menuCount: menuElements.length,
        hasActionText: Boolean(rule.actionText)
      });
      return 0;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(SHORTCUT_ATTR, rule.id || "menu-shortcut");
    button.className = "perso-xxl-shortcut-button";
    button.textContent = sanitizeShortcutLabel(rule.label || rule.actionText);
    markCreated(button, rule.id);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      triggerElement(menu);
      window.setTimeout(() => {
        const action = findVisibleAction(rule.actionText);
        if (action) triggerElement(action);
        else log.warn("executor.capability.menu_shortcut.action_missing", { ruleId: rule.id, actionText: rule.actionText });
      }, Number(rule.delayMs) > 0 ? Math.min(Number(rule.delayMs), 1000) : 120);
    });

    placeElement(button, placement, normalizePlacement(rule.placement, "append", ["append", "prepend"]));
    rememberElement(placement);
    mark(placement, rule.id);
    injectShortcutCss();

    log.info("executor.capability.menu_shortcut", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      menuTargetRef: rule.menuTargetRef,
      actionText: rule.actionText
    });

    return 1;
  }

  function injectShortcutCss() {
    const css = `
      .perso-xxl-shortcut-button {
        appearance: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 32px !important;
        margin: 4px !important;
        padding: 6px 12px !important;
        border: 1px solid rgba(255, 45, 122, 0.35) !important;
        border-radius: 8px !important;
        background: rgba(22, 14, 20, 0.88) !important;
        color: #fff !important;
        font: 600 13px/1.2 Inter, Arial, system-ui, sans-serif !important;
        cursor: pointer !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22) !important;
        z-index: 2 !important;
      }

      .perso-xxl-shortcut-button:hover {
        background: rgba(255, 45, 122, 0.88) !important;
      }
    `;
    upsertStyle(SHORTCUT_STYLE_ID, css);
  }

  function sanitizeShortcutLabel(value) {
    return String(value || "Shortcut").replace(/\s+/g, " ").trim().slice(0, 32) || "Shortcut";
  }

  function clearAppliedState() {
    document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach((element) => {
      if (element.hasAttribute(MOVED_ATTR)) return;
      element.removeAttribute(APPLIED_ATTR);
    });
  }

  function clearShortcutButtons() {
    document.querySelectorAll(`[${SHORTCUT_ATTR}]`).forEach((element) => element.remove());
  }

  function clearCreatedElements() {
    document.querySelectorAll(`[${CREATED_ATTR}]`).forEach((element) => element.remove());
  }

  function rememberElement(element) {
    if (originalState.has(element)) return;

    originalState.set(element, {
      style: element.getAttribute("style"),
      attributes: collectStoredAttributes(element)
    });
  }

  function rememberPosition(element) {
    if (originalPositions.has(element)) return;
    originalPositions.set(element, {
      parent: element.parentNode,
      previousSibling: element.previousSibling,
      nextSibling: element.nextSibling,
      index: Array.from(element.parentNode?.childNodes || []).indexOf(element)
    });
  }

  function collectStoredAttributes(element) {
    const attributes = {};
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("data-perso-xxl")) continue;
      attributes[attribute.name] = attribute.value;
    }
    return attributes;
  }

  function restoreElement(element) {
    if (element.hasAttribute(CREATED_ATTR)) {
      element.remove();
      return;
    }

    const original = originalState.get(element);
    const originalPosition = originalPositions.get(element);

    if (originalPosition?.parent?.isConnected && (
      element.parentNode !== originalPosition.parent ||
      element.nextSibling !== originalPosition.nextSibling
    )) {
      const referenceNode = originalPosition.nextSibling?.parentNode === originalPosition.parent
        ? originalPosition.nextSibling
        : originalPosition.parent.childNodes[originalPosition.index] !== element
          ? originalPosition.parent.childNodes[originalPosition.index] || null
          : originalPosition.previousSibling?.parentNode === originalPosition.parent
            ? originalPosition.previousSibling.nextSibling
            : null;
      originalPosition.parent.insertBefore(
        element,
        referenceNode
      );
    }

    if (original?.style === null) {
      element.removeAttribute("style");
    } else if (original?.style !== undefined) {
      element.setAttribute("style", original.style);
    }

    const currentAttributes = collectStoredAttributes(element);
    for (const attributeName of Object.keys(currentAttributes)) {
      if (!(attributeName in (original?.attributes || {}))) {
        element.removeAttribute(attributeName);
      }
    }

    for (const [attribute, value] of Object.entries(original?.attributes || {})) {
      element.setAttribute(attribute, value);
    }

    element.removeAttribute(APPLIED_ATTR);
    element.removeAttribute(MOVED_ATTR);
    element.removeAttribute(SWAPPED_ATTR);
    originalState.delete(element);
    originalPositions.delete(element);
  }

  function getOriginalIndex(element) {
    return originalPositions.get(element)?.index ?? -1;
  }

  function mark(element, ruleId) {
    element.setAttribute(APPLIED_ATTR, ruleId || "anonymous");
  }

  function markCreated(element, ruleId) {
    mark(element, ruleId);
    element.setAttribute(CREATED_ATTR, "true");
  }

  function normalizePlacement(value, fallback = "append", allowed = Array.from(ALLOWED_PLACEMENTS)) {
    const placement = String(value || fallback).trim().toLowerCase();
    return allowed.includes(placement) ? placement : fallback;
  }

  function placeElement(element, target, placement) {
    if (!element || !target?.parentNode && !["append", "prepend"].includes(placement)) return;

    if (placement === "prepend") {
      target.insertBefore(element, target.firstChild);
    } else if (placement === "before") {
      target.parentNode.insertBefore(element, target);
    } else if (placement === "after") {
      target.parentNode.insertBefore(element, target.nextSibling);
    } else if (placement === "replace") {
      target.parentNode.insertBefore(element, target);
      rememberElement(target);
      mark(target, "replaced");
      target.style.display = "none";
    } else {
      target.appendChild(element);
    }
  }

  function buildInsertedElement(descriptor, plan, ruleId, depth = 0) {
    if (!descriptor || typeof descriptor !== "object" || depth > 4) return null;

    const tag = String(descriptor.tag || "div").toLowerCase();
    if (!ALLOWED_INSERT_TAGS.has(tag)) return null;

    const element = document.createElement(tag);
    element.className = "perso-xxl-inserted";
    if (descriptor.text) element.textContent = sanitizeText(descriptor.text, 500);

    applySafeAttributes(element, descriptor.attributes || {}, plan);
    applyDescriptorStyles(element, descriptor.styles || {}, plan);

    for (const childDescriptor of Array.isArray(descriptor.children) ? descriptor.children.slice(0, 8) : []) {
      const child = buildInsertedElement(childDescriptor, plan, ruleId, depth + 1);
      if (child) element.appendChild(child);
    }

    if (tag === "button" && descriptor.actionText) {
      element.type = "button";
      element.addEventListener("click", () => {
        const action = findVisibleAction(descriptor.actionText);
        if (action) triggerElement(action);
      });
    }

    markCreated(element, ruleId);
    return element;
  }

  function applySafeAttributes(element, attributes, plan) {
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return;

    for (const [name, value] of Object.entries(attributes)) {
      if (!ALLOWED_INSERT_ATTRIBUTES.has(name) || value === null) continue;
      const normalizedValue = sanitizeText(value, 500);
      if (name === "href" && !isSafeHref(normalizedValue)) continue;
      if (name === "src") {
        const src = resolveAssetAttribute(normalizedValue, plan);
        if (!src) continue;
        element.setAttribute(name, src);
        continue;
      }
      element.setAttribute(name, normalizedValue);
    }
  }

  function applyDescriptorStyles(element, styles, plan) {
    if (!styles || typeof styles !== "object" || Array.isArray(styles)) return;

    for (const [key, value] of Object.entries(styles)) {
      const resolvedValue = resolveStyleValue(key, value, plan);
      if (resolvedValue) element.style[key] = resolvedValue;
    }
  }

  function sanitizeText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function isSafeHref(value) {
    return /^(https?:|mailto:|tel:|#|\/)/i.test(value);
  }

  function resolveAssetAttribute(value, plan) {
    if (value.startsWith("asset:")) {
      const assetId = value.slice("asset:".length);
      const dataUrl = plan?.assets?.[assetId]?.dataUrl;
      return isSafeImageDataUrl(dataUrl) ? dataUrl : "";
    }

    return isSafeImageDataUrl(value) ? value : "";
  }

  function stripPersoAttributes(root) {
    if (!root?.querySelectorAll) return;
    [root, ...root.querySelectorAll("*")].forEach((element) => {
      element.removeAttribute("id");
      for (const attribute of Array.from(element.attributes || [])) {
        if (attribute.name.startsWith("data-perso-xxl")) {
          element.removeAttribute(attribute.name);
        }
      }
    });
  }

  function triggerElement(element) {
    if (!element) return;
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function findVisibleAction(actionText) {
    const needle = normalizeActionText(actionText);
    if (!needle) return null;

    const candidates = Array.from(document.querySelectorAll([
      "button",
      "a",
      "[role='button']",
      "[role='menuitem']",
      "[role='option']",
      "[role='tab']",
      "[aria-label]"
    ].join(",")));

    return candidates.find((candidate) => {
      if (isPersoNode(candidate) || !isElementVisible(candidate)) return false;
      const label = normalizeActionText(candidate.getAttribute("aria-label") || candidate.textContent || candidate.getAttribute("title") || "");
      return label === needle || label.includes(needle) || needle.includes(label);
    }) || null;
  }

  function normalizeActionText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0";
  }

  function isPersoNode(node) {
    return Boolean(
      node?.id?.startsWith("perso-xxl") ||
      node?.closest?.("#perso-xxl-panel, #perso-xxl-picker-overlay, [data-perso-xxl-ui], [data-perso-xxl-created], [data-perso-xxl-shortcut]")
    );
  }

  function upsertStyle(id, css) {
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.documentElement.appendChild(style);
    }
    style.textContent = css;
  }

  function safeCssValue(value, fallback) {
    if (typeof value !== "string") return fallback;
    if (/url\s*\(|@import|javascript:/i.test(value)) return fallback;
    return value;
  }

  function buildTargetCssRules(rule, plan) {
    const selectors = resolveTargetSelectors(plan.targetMap?.[rule.targetRef]);
    if (!selectors.length) return [];

    const declarations = normalizeStyleDeclarations(rule.styles || {}, { forceImportant: true, plan });
    if (!declarations) return [];

    log.info("executor.target_ref.css.generated", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      selectorCount: selectors.length
    });

    return [`${selectors.join(",\n")} {\n${declarations}\n}`];
  }

  function normalizeStyleDeclarations(styles, options = {}) {
    const important = options.forceImportant ? " !important" : "";
    const declarations = [];

    for (const [key, value] of Object.entries(styles)) {
      const cssKey = camelToKebab(key);
      if (!/^[a-z-]+$/.test(cssKey)) continue;
      const resolvedValue = resolveStyleValue(key, value, options.plan);
      if (!resolvedValue) continue;
      declarations.push(`  ${cssKey}: ${resolvedValue}${important};`);

      if (key === "borderRadius") {
        declarations.push(`  overflow: hidden${important};`);
      }
    }

    return declarations.length ? declarations.join("\n") : "";
  }

  function resolveRuleElements(rule, plan) {
    const selectors = resolveTargetSelectors(plan.targetMap?.[rule.targetRef]);
    return uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
  }

  function resolveTargetElements(target) {
    const selectors = resolveTargetSelectors(target);
    return uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
  }

  function resolveTargetSelectors(target) {
    const primary = sanitizeSelectors(target?.selectors || []);
    if (primary.length > 0) return primary;
    return sanitizeSelectors(target?.fallbackSelectors || []);
  }

  function sanitizeSelectors(selectors) {
    return selectors.filter((selector) => {
      if (typeof selector !== "string") return false;
      if (selector.length > 240) return false;
      if (/[{};]/.test(selector)) return false;
      try {
        document.querySelector(selector);
        return true;
      } catch (_error) {
        return false;
      }
    });
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements));
  }

  function camelToKebab(value) {
    return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  function resolveStyleValue(key, value, plan) {
    if (key === "backgroundImage" && typeof value === "string" && value.startsWith("asset:")) {
      const assetId = value.slice("asset:".length);
      const dataUrl = plan?.assets?.[assetId]?.dataUrl;
      if (isSafeImageDataUrl(dataUrl)) return `url("${dataUrl}")`;
      return "";
    }

    return safeCssValue(String(value), "");
  }

  function isSafeImageDataUrl(value) {
    return typeof value === "string" && /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(value);
  }

  function summarizeElements(elements) {
    return elements.slice(0, 8).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: Array.from(element.classList || []).slice(0, 4),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
  }

  return { applyPlan, revertPlan };
})();
