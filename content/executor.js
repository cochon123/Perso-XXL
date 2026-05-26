window.PersoExecutor = (() => {
  const log = window.PersoLogger;
  const STYLE_ID = "perso-xxl-theme";
  const RULE_STYLE_ID = "perso-xxl-css-rules";
  const TARGET_STYLE_ID = "perso-xxl-target-rules";
  const CAPABILITY_STYLE_ID = "perso-xxl-capability-rules";
  const APPLIED_ATTR = "data-perso-xxl-rule";
  const originalState = new WeakMap();

  function applyPlan(plan) {
    if (!plan) return { totalMatched: 0 };
    let totalMatched = 0;

    log.info("executor.apply.started", {
      ruleCount: plan.rules?.length || 0,
      targetCount: Object.keys(plan.targetMap || {}).length
    });

    document.documentElement.setAttribute("data-perso-xxl-enabled", "true");
    injectTheme(plan.theme || {});
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
    document.documentElement.removeAttribute("data-perso-xxl-enabled");
    document.documentElement.removeAttribute("data-perso-xxl-scroll-locked");

    const elements = Array.from(document.querySelectorAll(`[${APPLIED_ATTR}]`));
    for (const element of elements) {
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

  function clearAppliedState() {
    document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach((element) => {
      element.removeAttribute(APPLIED_ATTR);
    });
  }

  function rememberElement(element) {
    if (originalState.has(element)) return;

    originalState.set(element, {
      style: element.getAttribute("style"),
      attributes: collectStoredAttributes(element)
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
    const original = originalState.get(element);

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
    originalState.delete(element);
  }

  function mark(element, ruleId) {
    element.setAttribute(APPLIED_ATTR, ruleId || "anonymous");
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
