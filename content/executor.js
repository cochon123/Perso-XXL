window.PersoExecutor = (() => {
  const log = window.PersoLogger;
  const STYLE_ID = "perso-xxl-theme";
  const RULE_STYLE_ID = "perso-xxl-css-rules";
  const TARGET_STYLE_ID = "perso-xxl-target-rules";
  const APPLIED_ATTR = "data-perso-xxl-rule";
  const originalState = new WeakMap();

  function applyPlan(plan, adapter) {
    if (!plan || !adapter) return;
    let totalMatched = 0;

    log.info("executor.apply.started", {
      ruleCount: plan.rules?.length || 0,
      targets: Array.from(new Set((plan.rules || []).map((rule) => rule.target).filter(Boolean)))
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
          totalMatched += applyStyleRule(rule, adapter, plan);
        } else if (rule.type === "visibility") {
          totalMatched += applyVisibilityRule(rule, adapter, plan);
        } else if (rule.type === "attribute") {
          totalMatched += applyAttributeRule(rule, adapter, plan);
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
    document.documentElement.removeAttribute("data-perso-xxl-enabled");

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

  function applyStyleRule(rule, adapter, plan) {
    const elements = resolveRuleElements(rule, adapter, plan);
    log.debug("executor.rule.style", {
      ruleId: rule.id,
      target: rule.targetRef || rule.target,
      matchCount: elements.length,
      matched: summarizeElements(elements),
      diagnostics: elements.length === 0 && rule.target === "thumbnail" ? adapter.getSelectorDiagnostics?.() : null
    });
    for (const element of elements) {
      rememberElement(element);
      mark(element, rule.id);
      if (rule.target === "thumbnail" || /thumb|image|media/i.test(rule.targetRef || "")) {
        element.style.overflow = "hidden";
      }
      for (const [key, value] of Object.entries(rule.styles || {})) {
        const resolvedValue = resolveStyleValue(key, value, plan);
        if (resolvedValue) element.style[key] = resolvedValue;
      }
    }
    return elements.length;
  }

  function applyVisibilityRule(rule, adapter, plan) {
    const elements = resolveRuleElements(rule, adapter, plan);
    log.debug("executor.rule.visibility", { ruleId: rule.id, target: rule.targetRef || rule.target, action: rule.action, matchCount: elements.length });
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

  function applyAttributeRule(rule, adapter, plan) {
    const elements = resolveRuleElements(rule, adapter, plan);
    log.debug("executor.rule.attribute", {
      ruleId: rule.id,
      target: rule.targetRef || rule.target,
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

  function clearAppliedState() {
    document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach((element) => {
      element.removeAttribute(APPLIED_ATTR);
    });
  }

  function rememberElement(element) {
    if (originalState.has(element)) return;

    originalState.set(element, {
      style: element.getAttribute("style"),
      attributes: {
        theater: element.getAttribute("theater"),
        "mini-guide-visible": element.getAttribute("mini-guide-visible"),
        "guide-persistent-and-visible": element.getAttribute("guide-persistent-and-visible")
      }
    });
  }

  function restoreElement(element) {
    const original = originalState.get(element);

    if (original?.style === null) {
      element.removeAttribute("style");
    } else if (original?.style !== undefined) {
      element.setAttribute("style", original.style);
    }

    for (const [attribute, value] of Object.entries(original?.attributes || {})) {
      if (value === null) {
        element.removeAttribute(attribute);
      } else {
        element.setAttribute(attribute, value);
      }
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
    if (rule.targetRef) return buildTargetRefCssRule(rule, plan);
    if (rule.target !== "thumbnail") return [];

    const styles = normalizeThumbnailStyles(rule.styles || {});
    if (!styles) return [];

    const selector = [
      "ytd-rich-item-renderer ytd-thumbnail",
      "ytd-video-renderer ytd-thumbnail",
      "ytd-grid-video-renderer ytd-thumbnail",
      "ytd-rich-item-renderer ytd-thumbnail a#thumbnail",
      "ytd-video-renderer ytd-thumbnail a#thumbnail",
      "ytd-grid-video-renderer ytd-thumbnail a#thumbnail",
      "ytd-rich-item-renderer ytd-thumbnail yt-image",
      "ytd-video-renderer ytd-thumbnail yt-image",
      "ytd-grid-video-renderer ytd-thumbnail yt-image",
      "ytd-rich-item-renderer ytd-thumbnail img",
      "ytd-video-renderer ytd-thumbnail img",
      "ytd-grid-video-renderer ytd-thumbnail img",
      "ytd-rich-item-renderer img.yt-core-image",
      "ytd-video-renderer img.yt-core-image",
      "ytd-grid-video-renderer img.yt-core-image",
      "ytd-rich-grid-media #thumbnail",
      "ytd-rich-grid-media img",
      "ytd-rich-grid-media img.yt-core-image",
      "a[href^='/watch'] img",
      "img[src*='ytimg.com']",
      "img[src*='i.ytimg.com']"
    ].join(",\n");

    log.info("executor.thumbnail.css.generated", {
      ruleId: rule.id,
      styles
    });

    return [`${selector} {\n${styles}\n}`];
  }

  function buildTargetRefCssRule(rule, plan) {
    const target = plan.targetMap?.[rule.targetRef];
    const selectors = sanitizeSelectors(target?.selectors || []);
    if (!selectors.length) return [];

    const declarations = normalizeStyleDeclarations(rule.styles || {}, { forceImportant: true, plan });
    if (!declarations) return [];

    log.info("executor.target_ref.css.generated", {
      ruleId: rule.id,
      targetRef: rule.targetRef,
      selectorCount: selectors.length,
      declarations
    });

    return [`${selectors.join(",\n")} {\n${declarations}\n}`];
  }

  function normalizeThumbnailStyles(styles) {
    const declarations = [];

    if (styles.borderRadius) {
      declarations.push(`  border-radius: ${safeCssValue(styles.borderRadius, "16px")} !important;`);
      declarations.push("  overflow: hidden !important;");
    }

    if (styles.overflow) {
      declarations.push(`  overflow: ${safeCssValue(styles.overflow, "hidden")} !important;`);
    }

    if (styles.aspectRatio) {
      declarations.push(`  aspect-ratio: ${safeCssValue(styles.aspectRatio, "16 / 9")} !important;`);
    }

    if (styles.border) {
      declarations.push(`  border: ${safeCssValue(styles.border, "none")} !important;`);
    }

    if (styles.boxShadow) {
      declarations.push(`  box-shadow: ${safeCssValue(styles.boxShadow, "none")} !important;`);
    }

    return declarations.length > 0 ? declarations.join("\n") : "";
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

  function resolveRuleElements(rule, adapter, plan) {
    if (rule.targetRef) {
      const selectors = sanitizeSelectors(plan.targetMap?.[rule.targetRef]?.selectors || []);
      return uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
    }

    return adapter.queryTarget(rule.target);
  }

  function sanitizeSelectors(selectors) {
    return selectors.filter((selector) => {
      if (typeof selector !== "string") return false;
      if (selector.length > 180) return false;
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
